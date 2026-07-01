import { Worker } from "bullmq";

import { createRedisConnection } from "@/lib/jobs/queue";
import { getWorkerConcurrency } from "@/lib/jobs/settings";
import type { ReviewJobData, ReviewJobName } from "@/lib/jobs/types";
import { REVIEW_JOB_NAME, REVIEW_QUEUE_NAME } from "@/lib/jobs/types";
import { runReviewJob } from "@/lib/review/run-review-job";

const connection = createRedisConnection();

const worker = new Worker<ReviewJobData, void, ReviewJobName>(
  REVIEW_QUEUE_NAME,
  async (job) => {
    if (job.name !== REVIEW_JOB_NAME) {
      throw new Error(`Unsupported job name: ${job.name}`);
    }

    console.log(
      `[worker] started ${job.id} ${job.data.repoFullName}#${job.data.prNumber}`
    );
    await runReviewJob(job.data);
    console.log(`[worker] completed ${job.id}`);
  },
  {
    concurrency: getWorkerConcurrency(),
    connection,
  }
);

worker.on("failed", (job, error) => {
  console.error(`[worker] failed ${job?.id ?? "unknown"}:`, error);
});

worker.on("error", (error) => {
  console.error("[worker] error:", error);
});

const shutdown = async (): Promise<void> => {
  console.log("[worker] shutting down");
  await worker.close();
};

const handleShutdown = async (): Promise<void> => {
  try {
    await shutdown();
    process.exit(0);
  } catch (error) {
    console.error("[worker] shutdown failed:", error);
    process.exit(1);
  }
};

process.on("SIGINT", () => {
  handleShutdown();
});

process.on("SIGTERM", () => {
  handleShutdown();
});
