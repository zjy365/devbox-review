import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { env } from "@/lib/env";
import { getConfiguredAppSlug, getInstallationOctokit } from "@/lib/github";
import { enqueueReviewJob } from "@/lib/jobs/enqueue";
import type { ReviewJobData } from "@/lib/jobs/types";

interface IssueCommentPayload {
  action: string;
  comment: {
    body: string;
    id: number;
  };
  installation?: {
    id: number;
  };
  issue: {
    number: number;
    pull_request?: unknown;
  };
  repository: {
    full_name: string;
    name: string;
    owner: {
      login: string;
    };
  };
}

interface PullRequestReviewCommentPayload {
  action: string;
  comment: {
    body: string;
    id: number;
  };
  installation?: {
    id: number;
  };
  pull_request: {
    base: {
      ref: string;
    };
    head: {
      ref: string;
    };
    number: number;
  };
  repository: {
    full_name: string;
    name: string;
    owner: {
      login: string;
    };
  };
}

type GitHubWebhookPayload =
  | IssueCommentPayload
  | PullRequestReviewCommentPayload;

const verifySignature = (body: string, signature: string | null): boolean => {
  if (!(signature && env.GITHUB_APP_WEBHOOK_SECRET)) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", env.GITHUB_APP_WEBHOOK_SECRET)
    .update(body)
    .digest("hex")}`;

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
};

const resolveInstallationId = (payload: GitHubWebhookPayload): number => {
  const installationId = payload.installation?.id;
  if (typeof installationId === "number" && Number.isFinite(installationId)) {
    return installationId;
  }

  throw new Error(
    "Missing GitHub App installation ID in signed webhook payload"
  );
};

const isReviewMention = (body: string): boolean => {
  const appSlug = getConfiguredAppSlug();
  console.log(`[webhook] checking mention for ${appSlug}`);
  return body.includes(`@${appSlug}`);
};

const enqueueFromIssueComment = async (
  payload: IssueCommentPayload
): Promise<string | null> => {
  if (payload.action !== "created" || !payload.issue.pull_request) {
    return null;
  }

  if (!isReviewMention(payload.comment.body)) {
    console.log("[webhook] issue comment ignored: no mention");
    return null;
  }

  const installationId = resolveInstallationId(payload);
  console.log(`[webhook] resolved installation ${installationId}`);
  const octokit = await getInstallationOctokit(installationId);
  console.log("[webhook] fetching pull request");
  const { data: pr } = await octokit.rest.pulls.get({
    owner: payload.repository.owner.login,
    pull_number: payload.issue.number,
    repo: payload.repository.name,
  });
  console.log("[webhook] enqueueing review job");

  const threadId = `github:${payload.repository.full_name}:${payload.issue.number}`;
  return enqueueReviewJob({
    baseBranch: pr.base.ref,
    installationId,
    messages: [{ content: payload.comment.body, role: "user" }],
    prBranch: pr.head.ref,
    prNumber: payload.issue.number,
    repoFullName: payload.repository.full_name,
    threadId,
    triggerId: String(payload.comment.id),
  } satisfies ReviewJobData);
};

const enqueueFromReviewComment = (
  payload: PullRequestReviewCommentPayload
): Promise<string | null> => {
  if (payload.action !== "created") {
    return Promise.resolve(null);
  }

  if (!isReviewMention(payload.comment.body)) {
    console.log("[webhook] review comment ignored: no mention");
    return Promise.resolve(null);
  }

  const installationId = resolveInstallationId(payload);
  const threadId = `github:${payload.repository.full_name}:${payload.pull_request.number}`;

  return enqueueReviewJob({
    baseBranch: payload.pull_request.base.ref,
    installationId,
    messages: [{ content: payload.comment.body, role: "user" }],
    prBranch: payload.pull_request.head.ref,
    prNumber: payload.pull_request.number,
    repoFullName: payload.repository.full_name,
    threadId,
    triggerId: String(payload.comment.id),
  } satisfies ReviewJobData);
};

export const POST = async (request: NextRequest): Promise<NextResponse> => {
  const body = await request.text();
  if (!verifySignature(body, request.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const eventType = request.headers.get("x-github-event");
  if (eventType === "ping") {
    return new NextResponse("pong");
  }

  let jobId: string | null;
  try {
    const payload = JSON.parse(body) as GitHubWebhookPayload;
    if (eventType === "issue_comment") {
      jobId = await enqueueFromIssueComment(payload as IssueCommentPayload);
    } else if (eventType === "pull_request_review_comment") {
      jobId = await enqueueFromReviewComment(
        payload as PullRequestReviewCommentPayload
      );
    } else {
      jobId = null;
    }
  } catch (error) {
    console.error(
      `[webhook] failed to process ${eventType ?? "unknown"}`,
      error
    );
    return new NextResponse(
      error instanceof Error ? error.message : "Webhook processing failed",
      { status: 500 }
    );
  }
  if (jobId) {
    console.log(`[bot] queued review job ${jobId}`);
  }

  return new NextResponse("ok");
};
