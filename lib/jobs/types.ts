export const REVIEW_QUEUE_NAME = "openreview-review-jobs";
export const REVIEW_JOB_NAME = "review-pr";

export interface ThreadMessage {
  content: string;
  role: "assistant" | "user";
}

export interface ReviewJobData {
  baseBranch: string;
  installationId: number;
  messages: ThreadMessage[];
  prBranch: string;
  prNumber: number;
  repoFullName: string;
  threadId: string;
  triggerId?: string;
}

export type ReviewJobName = typeof REVIEW_JOB_NAME;
