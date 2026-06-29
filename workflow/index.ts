import { FatalError, sleep } from "workflow";

import { parseError } from "@/lib/error";
import type { DevboxRuntime } from "@/lib/runtime/devbox";

import { addPRComment } from "./steps/add-pr-comment";
import { checkPushAccess } from "./steps/check-push-access";
import { cloneRuntimeRepository } from "./steps/clone-runtime-repository";
import { commitAndPush } from "./steps/commit-and-push";
import { configureGit } from "./steps/configure-git";
import { createRuntime } from "./steps/create-runtime";
import { extendRuntime } from "./steps/extend-runtime";
import { getGitHubToken } from "./steps/get-github-token";
import { getRuntimeInfo } from "./steps/get-runtime-info";
import { hasUncommittedChanges } from "./steps/has-uncommitted-changes";
import { installDependencies } from "./steps/install-dependencies";
import { runAgent } from "./steps/run-agent";
import { stopRuntime } from "./steps/stop-runtime";

const DEVBOX_RUNTIME_READY_ATTEMPTS = 150;
const DEVBOX_RUNTIME_READY_POLL_MS = 2000;

export interface ThreadMessage {
  content: string;
  role: "assistant" | "user";
}

export interface WorkflowParams {
  baseBranch: string;
  messages: ThreadMessage[];
  prBranch: string;
  prNumber: number;
  repoFullName: string;
  threadId: string;
}

const runtimeStateLabel = (
  runtime: Awaited<ReturnType<typeof getRuntimeInfo>>
) =>
  [runtime.state.phase, runtime.state.status].filter(Boolean).join("/") ||
  "unknown";

const waitForRuntime = async (runtime: DevboxRuntime): Promise<void> => {
  let lastState = "unknown";

  for (let attempt = 0; attempt < DEVBOX_RUNTIME_READY_ATTEMPTS; attempt += 1) {
    const info = await getRuntimeInfo(runtime);
    lastState = runtimeStateLabel(info);

    if (info.state.phase === "Running") {
      return;
    }

    await sleep(DEVBOX_RUNTIME_READY_POLL_MS);
  }

  throw new Error(
    `Timed out waiting for DevBox runtime (last state: ${lastState})`
  );
};

export const botWorkflow = async (params: WorkflowParams): Promise<void> => {
  "use workflow";

  const {
    baseBranch: _baseBranch,
    messages,
    prBranch,
    prNumber,
    repoFullName,
    threadId,
  } = params;

  const pushAccess = await checkPushAccess(repoFullName, prBranch);

  if (!pushAccess.canPush) {
    await addPRComment(
      threadId,
      `## Skipped

Unable to access this branch: ${pushAccess.reason}

Please ensure the DevBox Review app has access to this repository and branch.

---
*Powered by [DevBox Review](https://github.com/zjy365/devbox-review)*`
    );

    throw new FatalError(pushAccess.reason ?? "Push access denied");
  }

  const token = await getGitHubToken();
  const runtime = await createRuntime(repoFullName, token, prBranch);
  const runtimeInput = { branch: prBranch, repoFullName, token };

  try {
    await waitForRuntime(runtime);
    await cloneRuntimeRepository(runtime, runtimeInput);
    await installDependencies(runtime);
    await configureGit(runtime, repoFullName, token);
    await extendRuntime(runtime);

    const agentResult = await runAgent(
      runtime,
      messages,
      threadId,
      prNumber,
      repoFullName
    );

    if (!agentResult.success) {
      throw new FatalError(agentResult.errorMessage ?? "Agent failed to run");
    }

    const changed = await hasUncommittedChanges(runtime);

    if (changed) {
      await commitAndPush(runtime, "devbox-review: apply changes", prBranch);
    }
  } catch (error) {
    try {
      await addPRComment(
        threadId,
        `## Error

An error occurred while processing your request:

\`\`\`
${parseError(error)}
\`\`\`

---
*Powered by [DevBox Review](https://github.com/zjy365/devbox-review)*`
      );
    } catch {
      // Ignore comment failure
    }

    throw error;
  } finally {
    await stopRuntime(runtime);
  }
};
