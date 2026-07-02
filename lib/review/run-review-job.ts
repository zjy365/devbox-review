import { setTimeout } from "node:timers/promises";

import { UnrecoverableError } from "bullmq";

import { parseError } from "@/lib/error";
import type { ReviewJobData } from "@/lib/jobs/types";
import { runPiReviewAgent } from "@/lib/pi/review-agent";
import {
  addPRComment,
  checkPushAccess,
  getGitHubToken,
  startTyping,
} from "@/lib/review/github";
import {
  cloneDevboxRuntimeRepository,
  commitAndPushRuntimeChanges,
  configureRuntimeGit,
  createDevboxRuntime,
  getDevboxRuntimeInfo,
  hasRuntimeChanges,
  installRuntimeDependencies,
  pauseDevboxRuntime,
  refreshDevboxRuntime,
  runDevboxCommand,
} from "@/lib/runtime/devbox";
import type { DevboxRuntime } from "@/lib/runtime/devbox";

const DEVBOX_RUNTIME_READY_ATTEMPTS = 150;
const DEVBOX_RUNTIME_READY_POLL_MS = 2000;
const DEVBOX_EXEC_READY_ATTEMPTS = 60;

const runtimeStateLabel = (
  runtime: Awaited<ReturnType<typeof getDevboxRuntimeInfo>>
): string =>
  [runtime.state.phase, runtime.state.status].filter(Boolean).join("/") ||
  "unknown";

const waitForRuntime = async (runtime: DevboxRuntime): Promise<void> => {
  let lastState = "unknown";

  for (let attempt = 0; attempt < DEVBOX_RUNTIME_READY_ATTEMPTS; attempt += 1) {
    const info = await getDevboxRuntimeInfo(runtime);
    lastState = runtimeStateLabel(info);

    if (info.state.phase === "Running") {
      return;
    }

    await setTimeout(DEVBOX_RUNTIME_READY_POLL_MS);
  }

  throw new Error(
    `Timed out waiting for DevBox runtime (last state: ${lastState})`
  );
};

const waitForRuntimeExec = async (runtime: DevboxRuntime): Promise<void> => {
  let lastError = "";

  for (let attempt = 0; attempt < DEVBOX_EXEC_READY_ATTEMPTS; attempt += 1) {
    try {
      await runDevboxCommand(runtime, "true", 10);
      return;
    } catch (error) {
      lastError = parseError(error);
      await setTimeout(DEVBOX_RUNTIME_READY_POLL_MS);
    }
  }

  throw new Error(`Timed out waiting for DevBox exec API: ${lastError}`);
};

const postSkippedComment = async (
  job: ReviewJobData,
  reason: string
): Promise<void> => {
  await addPRComment(
    job.installationId,
    job.threadId,
    `## Skipped

Unable to access this branch: ${reason}

Please ensure the OpenReview app has access to this repository and branch.

---
*Powered by [DevboxReview](https://github.com/zjy365/devbox-review)*`
  );
};

const postErrorComment = async (
  job: ReviewJobData,
  errorMessage: string
): Promise<void> => {
  await addPRComment(
    job.installationId,
    job.threadId,
    `## Error

An error occurred while processing your request:

\`\`\`
${errorMessage}
\`\`\`

---
*Powered by [DevboxReview](https://github.com/zjy365/devbox-review)*`
  );
};

const redactError = (error: unknown, token: string): string =>
  parseError(error)
    .replaceAll(token, "[redacted]")
    .replaceAll(/x-access-token:[^@\s]+@/g, "x-access-token:[redacted]@");

export const runReviewJob = async (job: ReviewJobData): Promise<void> => {
  const pushAccess = await checkPushAccess(
    job.installationId,
    job.repoFullName,
    job.prBranch
  );

  if (!pushAccess.canPush) {
    const reason = pushAccess.reason ?? "Push access denied";
    await postSkippedComment(job, reason);
    throw new UnrecoverableError(reason);
  }

  const token = await getGitHubToken(job.installationId);
  const runtime = await createDevboxRuntime({
    branch: job.prBranch,
    repoFullName: job.repoFullName,
    token,
  });

  try {
    await startTyping(job.threadId, "Reviewing...");
    await waitForRuntime(runtime);
    await waitForRuntimeExec(runtime);
    await cloneDevboxRuntimeRepository(runtime, {
      branch: job.prBranch,
      repoFullName: job.repoFullName,
      token,
    });
    await installRuntimeDependencies(runtime);
    await refreshDevboxRuntime(runtime);
    await runPiReviewAgent(runtime, job);

    const changed = await hasRuntimeChanges(runtime);

    if (changed) {
      await configureRuntimeGit(runtime, job.repoFullName, token);
      await commitAndPushRuntimeChanges(
        runtime,
        "openreview: apply changes",
        job.prBranch
      );
    }
  } catch (error) {
    try {
      await postErrorComment(job, redactError(error, token));
    } catch {
      // Preserve the original failure if GitHub commenting fails.
    }

    throw error;
  } finally {
    await pauseDevboxRuntime(runtime);
  }
};
