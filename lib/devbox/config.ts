import { existsSync, readFileSync } from "node:fs";

import { KubeConfig } from "@kubernetes/client-node";
import { SignJWT } from "jose";

import { env } from "@/lib/env";

const DEVBOX_API_PREFIX = "/api/v1/devbox";
const DEFAULT_DEVBOX_TOKEN_TTL_SECONDS = 4 * 60 * 60;
const DEVBOX_SERVER_PREFIX = "devbox-server.";
const DNS_1123_LABEL_RE = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const TRAILING_SLASHES_RE = /\/+$/;

const normalizeBaseUrl = (url: string): string =>
  url.trim().replace(TRAILING_SLASHES_RE, "");

export const validateDevboxNamespace = (namespace: string): string => {
  const trimmed = namespace.trim();
  if (!DNS_1123_LABEL_RE.test(trimmed)) {
    throw new Error("DevBox namespace must be a valid DNS1123 label");
  }
  return trimmed;
};

interface DevboxKubeconfigSettings {
  namespace: string;
  server: string;
  token: string;
}

let cachedKubeconfigSettings: DevboxKubeconfigSettings | undefined;

const optionalTrimmed = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed || undefined;
};

const required = (value: string | undefined, name: string): string => {
  const trimmed = optionalTrimmed(value);
  if (!trimmed) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return trimmed;
};

const getKubeconfigPath = (): string => {
  const path = optionalTrimmed(env.DEVBOX_KUBECONFIG_PATH);
  if (!path) {
    throw new Error("Missing DEVBOX_KUBECONFIG_PATH environment variable");
  }
  return path;
};

const readKubeconfigContent = (): string => {
  const path = getKubeconfigPath();
  if (!existsSync(path)) {
    throw new Error(`DevBox kubeconfig file does not exist: ${path}`);
  }
  return readFileSync(path, "utf8");
};

const inferDevboxBaseUrl = (server: string): string => {
  const url = new URL(server);
  const hostname = url.hostname.startsWith(DEVBOX_SERVER_PREFIX)
    ? url.hostname
    : `${DEVBOX_SERVER_PREFIX}${url.hostname}`;
  return normalizeBaseUrl(`${url.protocol}//${hostname}`);
};

const getKubeconfigSettings = (): DevboxKubeconfigSettings => {
  if (cachedKubeconfigSettings) {
    return cachedKubeconfigSettings;
  }

  const content = readKubeconfigContent();
  const kubeconfig = new KubeConfig();
  kubeconfig.loadFromString(content);

  const currentContextName = kubeconfig.getCurrentContext();
  if (!currentContextName) {
    throw new Error("DevBox kubeconfig must define current-context");
  }

  const currentContext = kubeconfig.getContextObject(currentContextName);
  const currentCluster = kubeconfig.getCurrentCluster();
  const currentUser = kubeconfig.getCurrentUser();

  if (!currentContext) {
    throw new Error(
      `DevBox kubeconfig current-context was not found: ${currentContextName}`
    );
  }

  if (!currentCluster?.server) {
    throw new Error(
      "DevBox kubeconfig current context must reference a cluster"
    );
  }

  if (!currentUser?.token) {
    throw new Error(
      "DevBox kubeconfig current context user must include a bearer token"
    );
  }

  if (!currentContext.namespace) {
    throw new Error("DevBox kubeconfig current context must include namespace");
  }

  cachedKubeconfigSettings = {
    namespace: validateDevboxNamespace(currentContext.namespace),
    server: currentCluster.server,
    token: currentUser.token,
  };
  return cachedKubeconfigSettings;
};

export const getDevboxBaseUrl = (): string =>
  inferDevboxBaseUrl(getKubeconfigSettings().server);

export const getDevboxApiPrefix = (): string => DEVBOX_API_PREFIX;

export const getDevboxNamespace = (): string =>
  getKubeconfigSettings().namespace;

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
    .sign(
      new TextEncoder().encode(
        required(env.DEVBOX_JWT_SIGNING_KEY, "DEVBOX_JWT_SIGNING_KEY")
      )
    );
};
