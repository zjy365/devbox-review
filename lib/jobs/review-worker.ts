import { Worker } from "bullmq";

import { createRedisConnection } from "@/lib/jobs/queue";
import { getWorkerConcurrency } from "@/lib/jobs/settings";
import type { ReviewJobData, ReviewJobName } from "@/lib/jobs/types";
import { REVIEW_JOB_NAME, REVIEW_QUEUE_NAME } from "@/lib/jobs/types";
import { runReviewJob } from "@/lib/review/run-review-job";

type ReviewWorkerGlobal = typeof globalThis & {
  __devboxReviewWorker?: Worker<ReviewJobData, void, ReviewJobName>;
  __devboxReviewWorkerShuttingDown?: boolean;
  __devboxReviewWorkerShutdownHandlersRegistered?: boolean;
};

const workerGlobal = globalThis as ReviewWorkerGlobal;

const closeWorker = async (): Promise<void> => {
  if (
    !workerGlobal.__devboxReviewWorker ||
    workerGlobal.__devboxReviewWorkerShuttingDown
  ) {
    return;
  }

  workerGlobal.__devboxReviewWorkerShuttingDown = true;
  console.log("[worker] shutting down");
  await workerGlobal.__devboxReviewWorker.close();
  workerGlobal.__devboxReviewWorker = undefined;
  workerGlobal.__devboxReviewWorkerShuttingDown = false;
};

const handleShutdown = async (): Promise<void> => {
  try {
    await closeWorker();
    process.exit(0);
  } catch (error) {
    console.error("[worker] shutdown failed:", error);
    process.exit(1);
  }
};

const registerShutdownHandlers = (): void => {
  if (workerGlobal.__devboxReviewWorkerShutdownHandlersRegistered) {
    return;
  }

  workerGlobal.__devboxReviewWorkerShutdownHandlersRegistered = true;
  process.on("SIGINT", () => {
    handleShutdown();
  });
  process.on("SIGTERM", () => {
    handleShutdown();
  });
};

export const startReviewWorker = (): Worker<
  ReviewJobData,
  void,
  ReviewJobName
> => {
  if (workerGlobal.__devboxReviewWorker) {
    return workerGlobal.__devboxReviewWorker;
  }

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

  registerShutdownHandlers();
  workerGlobal.__devboxReviewWorker = worker;
  return worker;
};

export const stopReviewWorker = (): Promise<void> => closeWorker();
