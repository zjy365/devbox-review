import "server-only";
import {
  getDevboxApiPrefix,
  getDevboxAuthToken,
  getDevboxBaseUrl,
} from "@/lib/devbox/config";
import type {
  CreateDevboxInput,
  CreateDevboxResult,
  DeleteDevboxResult,
  DevboxEnvelope,
  DevboxExecInput,
  DevboxExecResult,
  DevboxInfo,
  DevboxListItem,
  PauseDevboxResult,
  RefreshPauseInput,
  RefreshPauseResult,
} from "@/lib/devbox/types";

const DEVBOX_REQUEST_TIMEOUT_MS = 60_000;
const DEVBOX_EXEC_REQUEST_BUFFER_MS = 10_000;

export class DevboxApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "DevboxApiError";
    this.status = status;
  }
}

const execRequestTimeoutMs = (timeoutSeconds?: number): number =>
  Math.max(
    DEVBOX_REQUEST_TIMEOUT_MS,
    (timeoutSeconds ?? 60) * 1000 + DEVBOX_EXEC_REQUEST_BUFFER_MS
  );

const buildUrl = (
  pathname: string,
  searchParams?: URLSearchParams,
  includeApiPrefix = true
): string => {
  const basePath = includeApiPrefix
    ? `${getDevboxApiPrefix()}${pathname}`
    : pathname;
  const url = new URL(basePath, getDevboxBaseUrl());
  if (searchParams) {
    url.search = searchParams.toString();
  }
  return url.toString();
};

const parseJsonResponse = async <T>(
  response: Response
): Promise<DevboxEnvelope<T>> => {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new DevboxApiError(
      response.status,
      "DevBox API returned an invalid JSON response"
    );
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "message" in payload &&
      typeof payload.message === "string"
        ? payload.message
        : "DevBox API request failed";
    throw new DevboxApiError(response.status, message);
  }

  return payload as DevboxEnvelope<T>;
};

const devboxRequest = async <T>(
  pathname: string,
  init?: Omit<RequestInit, "headers"> & {
    authNamespace?: string;
    headers?: HeadersInit;
    includeApiPrefix?: boolean;
    searchParams?: URLSearchParams;
    skipAuth?: boolean;
    timeoutMs?: number;
  }
): Promise<DevboxEnvelope<T>> => {
  const {
    authNamespace,
    headers: initHeaders,
    includeApiPrefix,
    searchParams,
    skipAuth,
    timeoutMs,
    ...requestInit
  } = init ?? {};

  const headers = new Headers(initHeaders);

  if (!skipAuth) {
    if (!authNamespace?.trim()) {
      throw new Error("DevBox auth namespace is required.");
    }
    headers.set(
      "Authorization",
      `Bearer ${await getDevboxAuthToken(authNamespace)}`
    );
  }

  if (requestInit.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const signal =
    requestInit.signal ??
    AbortSignal.timeout(timeoutMs ?? DEVBOX_REQUEST_TIMEOUT_MS);

  const response = await fetch(
    buildUrl(pathname, searchParams, includeApiPrefix),
    {
      ...requestInit,
      cache: "no-store",
      headers,
      signal,
    }
  );
  return await parseJsonResponse<T>(response);
};

export const createDevbox = async (
  authNamespace: string,
  input: CreateDevboxInput
) =>
  await devboxRequest<CreateDevboxResult>("", {
    authNamespace,
    body: JSON.stringify(input),
    method: "POST",
  });

export const listDevboxes = async (
  authNamespace: string,
  upstreamID?: string
) => {
  const searchParams = new URLSearchParams();
  if (upstreamID) {
    searchParams.set("upstreamID", upstreamID);
  }
  return await devboxRequest<{ items: DevboxListItem[] }>("", {
    authNamespace,
    method: "GET",
    searchParams,
  });
};

export const getDevbox = async (authNamespace: string, name: string) =>
  await devboxRequest<DevboxInfo>(`/${encodeURIComponent(name)}`, {
    authNamespace,
    method: "GET",
  });

export const pauseDevbox = async (authNamespace: string, name: string) =>
  await devboxRequest<PauseDevboxResult>(`/${encodeURIComponent(name)}/pause`, {
    authNamespace,
    method: "POST",
  });

export const refreshDevboxPause = async (
  authNamespace: string,
  name: string,
  input: RefreshPauseInput
) =>
  await devboxRequest<RefreshPauseResult>(
    `/${encodeURIComponent(name)}/pause/refresh`,
    {
      authNamespace,
      body: JSON.stringify(input),
      method: "POST",
    }
  );

export const resumeDevbox = async (authNamespace: string, name: string) =>
  await devboxRequest<PauseDevboxResult>(
    `/${encodeURIComponent(name)}/resume`,
    {
      authNamespace,
      method: "POST",
    }
  );

export const deleteDevbox = async (authNamespace: string, name: string) =>
  await devboxRequest<DeleteDevboxResult>(`/${encodeURIComponent(name)}`, {
    authNamespace,
    method: "DELETE",
  });

export const execDevbox = async (
  authNamespace: string,
  name: string,
  input: DevboxExecInput
) =>
  await devboxRequest<DevboxExecResult>(`/${encodeURIComponent(name)}/exec`, {
    authNamespace,
    body: JSON.stringify(input),
    method: "POST",
    timeoutMs: execRequestTimeoutMs(input.timeoutSeconds),
  });
