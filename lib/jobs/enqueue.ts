import { getJobAttempts, getJobBackoffMs } from "@/lib/jobs/settings";

import { createReviewQueue } from "./queue";
import type { ReviewJobData } from "./types";
import { REVIEW_JOB_NAME } from "./types";

const buildJobId = (data: ReviewJobData): string =>
  [
    data.repoFullName,
    data.prNumber,
    data.triggerId ?? data.threadId,
    Date.now(),
  ].join(":");

export const enqueueReviewJob = async (
  data: ReviewJobData
): Promise<string> => {
  const queue = createReviewQueue();

  try {
    const job = await queue.add(REVIEW_JOB_NAME, data, {
      attempts: getJobAttempts(),
      backoff: {
        delay: getJobBackoffMs(),
        type: "exponential",
      },
      jobId: buildJobId(data),
      removeOnComplete: {
        count: 100,
      },
      removeOnFail: {
        count: 500,
      },
    });

    return job.id ?? "";
  } finally {
    await queue.close();
  }
};
