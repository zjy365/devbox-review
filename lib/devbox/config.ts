import "server-only";
import { SignJWT } from "jose";

import { env } from "@/lib/env";

const DEVBOX_API_PREFIX = "/api/v1/devbox";
const DEFAULT_DEVBOX_TOKEN_TTL_SECONDS = 4 * 60 * 60;
const DNS_1123_LABEL_RE = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const TRAILING_SLASHES_RE = /\/+$/;

const required = (value: string | undefined, name: string): string => {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return trimmed;
};

const normalizeBaseUrl = (url: string): string =>
  url.trim().replace(TRAILING_SLASHES_RE, "");

export const validateDevboxNamespace = (namespace: string): string => {
  const trimmed = namespace.trim();
  if (!DNS_1123_LABEL_RE.test(trimmed)) {
    throw new Error("DevBox namespace must be a valid DNS1123 label");
  }
  return trimmed;
};

export const getDevboxBaseUrl = (): string =>
  normalizeBaseUrl(required(env.DEVBOX_API_BASE_URL, "DEVBOX_API_BASE_URL"));

export const getDevboxApiPrefix = (): string => DEVBOX_API_PREFIX;

export const getDevboxNamespace = (): string =>
  validateDevboxNamespace(required(env.DEVBOX_NAMESPACE, "DEVBOX_NAMESPACE"));

export const getDevboxDefaultImage = (): string | undefined => {
  const image = env.DEVBOX_RUNTIME_IMAGE?.trim();
  return image || undefined;
};

export const getDevboxArchiveAfterPauseTime = (): string =>
  env.DEVBOX_ARCHIVE_AFTER_PAUSE_TIME?.trim() || "24h";

export const getDevboxPauseAfterMinutes = (): number => {
  const raw = env.DEVBOX_PAUSE_AFTER_MINUTES ?? "300";
  const minutes = Number.parseInt(raw, 10);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error("DEVBOX_PAUSE_AFTER_MINUTES must be a positive integer");
  }
  return minutes;
};

export const getDevboxCommandTimeoutSeconds = (): number => {
  const raw = env.DEVBOX_COMMAND_TIMEOUT_SECONDS ?? "60";
  const seconds = Number.parseInt(raw, 10);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(
      "DEVBOX_COMMAND_TIMEOUT_SECONDS must be a positive integer"
    );
  }
  return seconds;
};

export const getDevboxAuthToken = async (
  namespace: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<string> => {
  const staticToken = env.DEVBOX_TOKEN?.trim();
  if (staticToken) {
    return staticToken;
  }

  const signingKey = required(
    env.DEVBOX_JWT_SIGNING_KEY,
    "DEVBOX_JWT_SIGNING_KEY"
  );
  const ttlSeconds = Number.parseInt(
    env.DEVBOX_JWT_TTL_SECONDS ?? String(DEFAULT_DEVBOX_TOKEN_TTL_SECONDS),
    10
  );

  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error("DEVBOX_JWT_TTL_SECONDS must be a positive integer");
  }

  return await new SignJWT({ namespace: validateDevboxNamespace(namespace) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + ttlSeconds)
    .sign(new TextEncoder().encode(signingKey));
};
