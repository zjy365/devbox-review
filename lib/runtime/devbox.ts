import { setTimeout } from "node:timers/promises";

import {
  createDevbox,
  DevboxApiError,
  execDevbox,
  getDevbox,
  listDevboxes,
  pauseDevbox,
  refreshDevboxPause,
  resumeDevbox,
} from "@/lib/devbox/client";
import {
  getDevboxArchiveAfterPauseTime,
  getDevboxCommandTimeoutSeconds,
  getDevboxCustomObjectsApi,
  getDevboxNamespace,
  getDevboxPauseAfterMinutes,
  getDevboxStorageLimit,
} from "@/lib/devbox/config";
import type { DevboxInfo, DevboxExecResult } from "@/lib/devbox/types";

export const DEVBOX_WORKSPACE_DIR = "/home/devbox/project";

const DEVBOX_NAME_PREFIX = "run-review";
const GITHUB_CLI_INSTALL_TIMEOUT_SECONDS = 180;
const DEPENDENCY_INSTALL_TIMEOUT_SECONDS = 600;
const GIT_COMMAND_TIMEOUT_SECONDS = 120;
const FILE_COMMAND_TIMEOUT_SECONDS = 60;
const DEVBOX_INFO_READY_MAX_RETRIES = 3;
const DEVBOX_INFO_READY_RETRY_DELAY_MS = 2000;
const DEVBOX_STORAGE_PATCH_MAX_RETRIES = 5;
const DEVBOX_STORAGE_PATCH_RETRY_DELAY_MS = 1000;
const DEVBOX_CRD_GROUP = "devbox.sealos.io";
const DEVBOX_CRD_VERSION = "v1alpha2";
const DEVBOX_CRD_PLURAL = "devboxes";

export interface DevboxRuntime {
  name: string;
  namespace: string;
  workspaceDir: string;
}

export interface CreateDevboxRuntimeInput {
  branch: string;
  repoFullName: string;
  token: string;
}

const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", "'\\''")}'`;

const runtimeHash = async (
  input: CreateDevboxRuntimeInput
): Promise<string> => {
  const data = new TextEncoder().encode(
    `${input.repoFullName}|${input.branch}`
  );
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
};

const runtimeName = (hash: string): string =>
  `${DEVBOX_NAME_PREFIX}-${hash.slice(0, 20)}`;

const runtimeUpstreamId = (hash: string): string =>
  `${DEVBOX_NAME_PREFIX}-${hash}`;

const pauseAt = (): string =>
  new Date(Date.now() + getDevboxPauseAfterMinutes() * 60 * 1000).toISOString();

const authenticatedRepoUrl = (repoFullName: string, token: string): string => {
  const url = new URL(`https://github.com/${repoFullName}.git`);
  url.username = "x-access-token";
  url.password = token;
  return url.toString();
};

const publicRepoUrl = (repoFullName: string): string =>
  `https://github.com/${repoFullName}.git`;

const isDevboxRuntimePendingError = (error: unknown): error is DevboxApiError =>
  error instanceof DevboxApiError &&
  (error.status === 404 || error.status >= 500);

const resolveWorkspacePathCommand = (
  runtime: DevboxRuntime,
  path: string
): string =>
  [
    `requested=${shellQuote(path)}`,
    `workspace=${shellQuote(runtime.workspaceDir)}`,
    'case "$requested" in',
    '  /*) candidate="$requested" ;;',
    '  *) candidate="$workspace/$requested" ;;',
    "esac",
    'resolved="$(realpath -m -- "$candidate")"',
    'case "$resolved" in',
    '  "$workspace"|"$workspace"/*) ;;',
    '  *) echo "Path outside workspace is not allowed: $requested" >&2; exit 64 ;;',
    "esac",
  ].join("\n");

export const runDevboxCommand = async (
  runtime: DevboxRuntime,
  command: string,
  timeoutSeconds = getDevboxCommandTimeoutSeconds()
): Promise<DevboxExecResult> => {
  const response = await execDevbox(runtime.namespace, runtime.name, {
    command: ["bash", "-lc", command],
    timeoutSeconds,
  });
  return response.data;
};

export const runWorkspaceCommand = async (
  runtime: DevboxRuntime,
  command: string,
  timeoutSeconds?: number
): Promise<DevboxExecResult> =>
  await runDevboxCommand(
    runtime,
    [
      "set -euo pipefail",
      'export PATH="$HOME/.local/bin:$PATH"',
      "unset GITHUB_TOKEN GH_TOKEN GITHUB_AUTH_TOKEN",
      `cd ${shellQuote(runtime.workspaceDir)}`,
      command,
    ].join("\n"),
    timeoutSeconds
  );

export const refreshDevboxRuntime = async (
  runtime: DevboxRuntime
): Promise<void> => {
  await refreshDevboxPause(runtime.namespace, runtime.name, {
    pauseAt: pauseAt(),
  });
};

const cloneWorkspaceCommand = (input: CreateDevboxRuntimeInput): string => {
  const repo = authenticatedRepoUrl(input.repoFullName, input.token);
  return [
    "set -euo pipefail",
    `workspace_dir=${shellQuote(DEVBOX_WORKSPACE_DIR)}`,
    'mkdir -p "$workspace_dir"',
    'git config --global --get-all safe.directory | grep -Fx "$workspace_dir" >/dev/null 2>&1 || git config --global --add safe.directory "$workspace_dir"',
    'if [ ! -d "$workspace_dir/.git" ]; then',
    '  tmpdir="$(mktemp -d)"',
    '  cleanup() { rm -rf "$tmpdir"; }',
    "  trap cleanup EXIT",
    `  git clone --depth 1 --branch ${shellQuote(input.branch)} ${shellQuote(repo)} "$tmpdir/repo"`,
    '  find "$workspace_dir" -mindepth 1 -maxdepth 1 -exec rm -rf {} +',
    '  cp -a "$tmpdir/repo"/. "$workspace_dir"/',
    "else",
    '  rm -f "$workspace_dir/.git/index.lock" "$workspace_dir/.git/shallow.lock"',
    '  git -C "$workspace_dir" reset --hard || true',
    '  git -C "$workspace_dir" clean -ffdx || true',
    "fi",
    `git -C "$workspace_dir" fetch --depth 1 ${shellQuote(repo)} ${shellQuote(input.branch)}`,
    'git -C "$workspace_dir" reset --hard FETCH_HEAD',
    'git -C "$workspace_dir" clean -ffdx',
    `git -C "$workspace_dir" remote set-url origin ${shellQuote(publicRepoUrl(input.repoFullName))}`,
    'rm -f "$HOME/.config/gh/hosts.yml"',
    "if id devbox >/dev/null 2>&1; then",
    '  if [ "$(id -u)" = "0" ]; then',
    '    chown -R devbox:devbox "$workspace_dir"',
    "  elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then",
    '    sudo chown -R devbox:devbox "$workspace_dir"',
    "  fi",
    "fi",
  ].join("\n");
};

const buildRuntime = (name: string, namespace: string): DevboxRuntime => ({
  name,
  namespace,
  workspaceDir: DEVBOX_WORKSPACE_DIR,
});

const formatErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const patchDevboxRuntimeStorageLimit = async (
  runtime: DevboxRuntime
): Promise<void> => {
  const storageLimit = getDevboxStorageLimit();
  const body = [
    { op: "add", path: "/spec/storageLimit", value: storageLimit },
    {
      op: "add",
      path: "/spec/resource/ephemeral-storage",
      value: storageLimit,
    },
  ];

  for (let attempt = 0; ; attempt += 1) {
    try {
      await getDevboxCustomObjectsApi().patchNamespacedCustomObject({
        body,
        group: DEVBOX_CRD_GROUP,
        name: runtime.name,
        namespace: runtime.namespace,
        plural: DEVBOX_CRD_PLURAL,
        version: DEVBOX_CRD_VERSION,
      });
      return;
    } catch (error) {
      if (attempt >= DEVBOX_STORAGE_PATCH_MAX_RETRIES) {
        throw new Error(
          `Failed to patch DevBox storage limit: ${formatErrorMessage(error)}`,
          { cause: error }
        );
      }
      await setTimeout(DEVBOX_STORAGE_PATCH_RETRY_DELAY_MS);
    }
  }
};

export const getDevboxRuntimeInfo = async (
  runtime: DevboxRuntime
): Promise<DevboxInfo> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await getDevbox(runtime.namespace, runtime.name);
      return response.data;
    } catch (error) {
      if (
        !isDevboxRuntimePendingError(error) ||
        attempt >= DEVBOX_INFO_READY_MAX_RETRIES
      ) {
        throw error;
      }
      await setTimeout(DEVBOX_INFO_READY_RETRY_DELAY_MS);
    }
  }
};

export const resumeDevboxRuntime = async (
  runtime: DevboxRuntime
): Promise<void> => {
  try {
    await resumeDevbox(runtime.namespace, runtime.name);
  } catch (error) {
    if (!(error instanceof DevboxApiError && error.status === 409)) {
      throw error;
    }
  }
};

export const cloneDevboxRuntimeRepository = async (
  runtime: DevboxRuntime,
  input: CreateDevboxRuntimeInput
): Promise<void> => {
  const result = await runDevboxCommand(
    runtime,
    cloneWorkspaceCommand(input),
    GIT_COMMAND_TIMEOUT_SECONDS
  );

  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to clone repository (exit ${result.exitCode}): ${result.stderr || result.stdout}`
    );
  }
};

export const createDevboxRuntime = async (
  input: CreateDevboxRuntimeInput
): Promise<DevboxRuntime> => {
  const namespace = getDevboxNamespace();
  const hash = await runtimeHash(input);
  const name = runtimeName(hash);
  const upstreamID = runtimeUpstreamId(hash);
  const existingResponse = await listDevboxes(namespace, upstreamID);
  const [existing] = existingResponse.data.items;

  if (existing) {
    const runtime = buildRuntime(existing.name, namespace);
    if (existing.state.phase !== "Running") {
      await resumeDevboxRuntime(runtime);
    }
    await refreshDevboxRuntime(runtime);
    return runtime;
  }

  await createDevbox(namespace, {
    archiveAfterPauseTime: getDevboxArchiveAfterPauseTime(),
    env: {
      DEVBOX_REVIEW_REPOSITORY: input.repoFullName,
      DEVBOX_REVIEW_WORKSPACE: DEVBOX_WORKSPACE_DIR,
    },
    labels: [
      { key: "app.kubernetes.io/managed-by", value: "run-review" },
      { key: "app.kubernetes.io/component", value: "agent-runtime" },
    ],
    name,
    pauseAt: pauseAt(),
    upstreamID,
  });

  const runtime = buildRuntime(name, namespace);
  await patchDevboxRuntimeStorageLimit(runtime);
  return runtime;
};

export const pauseDevboxRuntime = async (
  runtime: DevboxRuntime
): Promise<void> => {
  await pauseDevbox(runtime.namespace, runtime.name);
};

export const installRuntimeDependencies = async (
  runtime: DevboxRuntime
): Promise<void> => {
  const ghInstall = await runWorkspaceCommand(
    runtime,
    "command -v gh >/dev/null 2>&1 || (" +
      "curl -sLO https://github.com/cli/cli/releases/download/v2.62.0/gh_2.62.0_linux_amd64.tar.gz &&" +
      " tar xzf gh_2.62.0_linux_amd64.tar.gz &&" +
      " mkdir -p ~/.local/bin &&" +
      " cp -f gh_2.62.0_linux_amd64/bin/gh ~/.local/bin/ &&" +
      " rm -rf gh_2.62.0_linux_amd64*)",
    GITHUB_CLI_INSTALL_TIMEOUT_SECONDS
  );

  if (ghInstall.exitCode !== 0) {
    throw new Error(
      `Failed to install GitHub CLI (exit ${ghInstall.exitCode}): ${ghInstall.stderr || ghInstall.stdout}`
    );
  }

  const installCommand = [
    "if [ -f bun.lock ]; then",
    "  command -v bun >/dev/null 2>&1 || npm install -g bun",
    "  bun install --frozen-lockfile",
    "elif [ -f pnpm-lock.yaml ]; then",
    "  command -v pnpm >/dev/null 2>&1 || npm install -g pnpm",
    "  pnpm install --frozen-lockfile",
    "elif [ -f yarn.lock ]; then",
    "  command -v yarn >/dev/null 2>&1 || npm install -g yarn",
    "  yarn install --frozen-lockfile",
    "else",
    "  npm install",
    "fi",
  ].join("\n");

  const result = await runWorkspaceCommand(
    runtime,
    installCommand,
    DEPENDENCY_INSTALL_TIMEOUT_SECONDS
  );

  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to install project dependencies (exit ${result.exitCode}): ${result.stderr || result.stdout}`
    );
  }
};

export const configureRuntimeGit = async (
  runtime: DevboxRuntime,
  repoFullName: string,
  token: string
): Promise<void> => {
  const remoteUrl = authenticatedRepoUrl(repoFullName, token);
  const command = [
    `git remote set-url origin ${shellQuote(remoteUrl)}`,
    "git config --local core.hooksPath /dev/null",
    "git config user.name run-review[bot]",
    "git config user.email run-review[bot]@users.noreply.github.com",
    `printf %s ${shellQuote(token)} | gh auth login --with-token`,
  ].join("\n");

  const result = await runWorkspaceCommand(
    runtime,
    command,
    GIT_COMMAND_TIMEOUT_SECONDS
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to configure git: ${result.stderr || result.stdout}`
    );
  }
};

export const hasRuntimeChanges = async (
  runtime: DevboxRuntime
): Promise<boolean> => {
  const result = await runWorkspaceCommand(
    runtime,
    "git status --porcelain",
    GIT_COMMAND_TIMEOUT_SECONDS
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to check git diff: ${result.stderr || result.stdout}`
    );
  }
  return Boolean(result.stdout.trim());
};

export const commitAndPushRuntimeChanges = async (
  runtime: DevboxRuntime,
  message: string,
  branchName?: string
): Promise<void> => {
  const branchArg = branchName ? ` origin ${shellQuote(branchName)}` : "";
  const result = await runWorkspaceCommand(
    runtime,
    [
      "git add -A",
      `git commit --no-verify -m ${shellQuote(message)}`,
      `git push${branchArg}`,
    ].join("\n"),
    GIT_COMMAND_TIMEOUT_SECONDS
  );

  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to commit and push changes (exit ${result.exitCode}): ${result.stderr || result.stdout}`
    );
  }
};

export const readRuntimeFile = async (
  runtime: DevboxRuntime,
  path: string
): Promise<string> => {
  const result = await runDevboxCommand(
    runtime,
    [resolveWorkspacePathCommand(runtime, path), 'cat -- "$resolved"'].join(
      "\n"
    ),
    FILE_COMMAND_TIMEOUT_SECONDS
  );
  if (result.exitCode !== 0) {
    throw new Error(`Failed to read file: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
};

export const writeRuntimeFile = async (
  runtime: DevboxRuntime,
  path: string,
  content: string
): Promise<void> => {
  const encoded = Buffer.from(content, "utf8").toString("base64");
  const result = await runDevboxCommand(
    runtime,
    [
      "set -euo pipefail",
      resolveWorkspacePathCommand(runtime, path),
      'mkdir -p -- "$(dirname -- "$resolved")"',
      "base64 -d > \"$resolved\" <<'EOF'",
      encoded,
      "EOF",
    ].join("\n"),
    FILE_COMMAND_TIMEOUT_SECONDS
  );
  if (result.exitCode !== 0) {
    throw new Error(`Failed to write file: ${result.stderr || result.stdout}`);
  }
};
