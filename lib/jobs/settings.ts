import { env } from "@/lib/env";

const parsePositiveInteger = (
  value: string | undefined,
  fallback: number
): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const getWorkerConcurrency = (): number =>
  parsePositiveInteger(env.OPENREVIEW_WORKER_CONCURRENCY, 1);

export const getJobAttempts = (): number =>
  parsePositiveInteger(env.OPENREVIEW_JOB_ATTEMPTS, 3);

export const getJobBackoffMs = (): number =>
  parsePositiveInteger(env.OPENREVIEW_JOB_BACKOFF_MS, 30_000);

export const getModelProvider = (): "openai" => {
  const provider = env.OPENREVIEW_MODEL_PROVIDER ?? "openai";

  if (provider !== "openai") {
    throw new Error(
      `Unsupported OPENREVIEW_MODEL_PROVIDER "${provider}". Only "openai" is supported.`
    );
  }

  return provider;
};

export const getModelName = (): string => env.OPENREVIEW_MODEL ?? "gpt-5.1";
