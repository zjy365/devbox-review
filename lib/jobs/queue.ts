import { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";

import { env } from "@/lib/env";

import type { ReviewJobData, ReviewJobName } from "./types";
import { REVIEW_QUEUE_NAME } from "./types";

export type ReviewQueue = Queue<
  ReviewJobData,
  void,
  ReviewJobName,
  ReviewJobData,
  void,
  ReviewJobName
>;

const getRedisUrl = (): string => {
  if (!env.REDIS_URL) {
    throw new Error("Missing REDIS_URL environment variable");
  }

  return env.REDIS_URL;
};

export const createRedisConnection = (): ConnectionOptions => {
  const url = new URL(getRedisUrl());
  const db = Number.parseInt(url.pathname.replace("/", ""), 10);

  return {
    db: Number.isFinite(db) ? db : undefined,
    host: url.hostname,
    maxRetriesPerRequest: null,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    port: url.port ? Number.parseInt(url.port, 10) : 6379,
    tls: url.protocol === "rediss:" ? {} : undefined,
    username: url.username ? decodeURIComponent(url.username) : undefined,
  };
};

export const createReviewQueue = (): ReviewQueue =>
  new Queue<
    ReviewJobData,
    void,
    ReviewJobName,
    ReviewJobData,
    void,
    ReviewJobName
  >(REVIEW_QUEUE_NAME, {
    connection: createRedisConnection(),
  });
