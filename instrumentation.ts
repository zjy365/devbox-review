export const register = async (): Promise<void> => {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { startReviewWorker } = await import("@/lib/jobs/review-worker");
  startReviewWorker();
};
