import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { env } from "@/lib/env";
import { getModelName, getModelProvider } from "@/lib/jobs/settings";
import type { ReviewJobData } from "@/lib/jobs/types";
import { addPRComment } from "@/lib/review/github";
import {
  DEVBOX_WORKSPACE_DIR,
  readRuntimeFile,
  runWorkspaceCommand,
  writeRuntimeFile,
} from "@/lib/runtime/devbox";
import type { DevboxRuntime } from "@/lib/runtime/devbox";

const MAX_TOOL_OUTPUT_CHARS = 20_000;
const AGENT_COMMAND_TIMEOUT_SECONDS = 600;
const RUNREVIEW_AGENT_DIR = "/tmp/runreview-pi";
const TRUSTED_SKILLS_DIR = resolve(process.cwd(), ".agents/skills");

const isTrustedSkillPath = (path: string): boolean => {
  const resolvedPath = resolve(path);
  return (
    resolvedPath === TRUSTED_SKILLS_DIR ||
    resolvedPath.startsWith(`${TRUSTED_SKILLS_DIR}/`)
  );
};

const textResult = (text: string, details: unknown) => ({
  content: [{ text, type: "text" as const }],
  details,
});

const truncate = (value: string): string => {
  if (value.length <= MAX_TOOL_OUTPUT_CHARS) {
    return value;
  }

  return `${value.slice(0, MAX_TOOL_OUTPUT_CHARS)}\n\n... truncated ${value.length - MAX_TOOL_OUTPUT_CHARS} chars`;
};

const buildSystemPrompt = (
  job: ReviewJobData
): string => `You are RunReview, an autonomous GitHub pull request review agent.

Repository: ${job.repoFullName}
Pull request: #${job.prNumber}
Base branch: ${job.baseBranch}
Head branch: ${job.prBranch}
Workspace: ${DEVBOX_WORKSPACE_DIR}

You run inside a Sealos DevBox through tools exposed by the host worker. Never assume local host files are available.

Your job:
- Understand the user's latest request in the GitHub thread.
- Inspect the pull request code and repository context.
- Make focused code changes when the user asks for changes.
- Run relevant checks or tests when practical.
- Post a clear final GitHub reply using the reply tool.

Rules:
- Use bash for repository commands. Commands already run from ${DEVBOX_WORKSPACE_DIR}.
- Use read and write for precise file access.
- Do not expose secrets, tokens, or environment variables in comments.
- If you modify files, leave a concise final reply explaining what changed and what verification ran.
- If you cannot complete the request, reply with the blocker and the command or evidence that proves it.
- Always call reply before finishing.`;

const buildUserPrompt = (job: ReviewJobData): string => {
  const conversation = job.messages
    .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
    .join("\n\n---\n\n");

  return `GitHub thread conversation:

${conversation || "(No prior messages collected.)"}

Handle the latest user request for PR #${job.prNumber}.`;
};

const createResourceLoader = async (
  systemPrompt: string,
  settingsManager: SettingsManager
) => {
  const resourceLoader = new DefaultResourceLoader({
    additionalSkillPaths: [TRUSTED_SKILLS_DIR],
    agentDir: RUNREVIEW_AGENT_DIR,
    appendSystemPromptOverride: () => [],
    cwd: DEVBOX_WORKSPACE_DIR,
    noContextFiles: true,
    noExtensions: true,
    noPromptTemplates: true,
    noSkills: true,
    noThemes: true,
    settingsManager,
    systemPromptOverride: () => systemPrompt,
  });

  await resourceLoader.reload();
  return resourceLoader;
};

const createBashTool = (runtime: DevboxRuntime) =>
  defineTool({
    description:
      "Run a shell command in the checked-out repository inside the Sealos DevBox.",
    async execute(_toolCallId, params) {
      const timeoutSeconds =
        params.timeoutSeconds ?? AGENT_COMMAND_TIMEOUT_SECONDS;
      const result = await runWorkspaceCommand(
        runtime,
        params.command,
        timeoutSeconds
      );
      const output = [
        result.stdout ? `STDOUT:\n${result.stdout}` : "",
        result.stderr ? `STDERR:\n${result.stderr}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      return textResult(
        truncate(output || `(exit ${result.exitCode})`),
        result
      );
    },
    executionMode: "sequential",
    label: "DevBox Bash",
    name: "bash",
    parameters: Type.Object({
      command: Type.String(),
      timeoutSeconds: Type.Optional(Type.Number()),
    }),
    promptSnippet: "bash(command): run a shell command in the DevBox workspace",
  });

const createReadFileTool = (runtime: DevboxRuntime) =>
  defineTool({
    description:
      "Read a text file from the repository workspace inside the Sealos DevBox, or a trusted RunReview skill file when the path is under the advertised skills directory.",
    async execute(_toolCallId, params) {
      if (isTrustedSkillPath(params.path)) {
        const content = await readFile(params.path, "utf8");
        return textResult(truncate(content), {
          path: params.path,
          source: "trusted-skill",
        });
      }

      const content = await readRuntimeFile(runtime, params.path);
      return textResult(truncate(content), {
        path: params.path,
        source: "devbox",
      });
    },
    label: "Read File",
    name: "read",
    parameters: Type.Object({
      path: Type.String(),
    }),
    promptSnippet:
      "read(path): read a file from the DevBox workspace or a listed trusted skill path",
  });

const createWriteFileTool = (runtime: DevboxRuntime) =>
  defineTool({
    description:
      "Write a complete text file into the repository workspace inside the Sealos DevBox.",
    async execute(_toolCallId, params) {
      await writeRuntimeFile(runtime, params.path, params.content);
      return textResult(`Wrote ${params.content.length} bytes`, {
        path: params.path,
      });
    },
    executionMode: "sequential",
    label: "Write File",
    name: "write",
    parameters: Type.Object({
      content: Type.String(),
      path: Type.String(),
    }),
    promptSnippet:
      "write(path, content): replace a text file in the DevBox workspace",
  });

const createReplyTool = (installationId: number, threadId: string) =>
  defineTool({
    description: "Post a Markdown reply to the GitHub pull request thread.",
    async execute(_toolCallId, params) {
      await addPRComment(installationId, threadId, params.body);
      return textResult("Posted reply to GitHub", { threadId });
    },
    executionMode: "sequential",
    label: "Reply",
    name: "reply",
    parameters: Type.Object({
      body: Type.String(),
    }),
    promptSnippet: "reply(body): post the final GitHub PR reply",
  });

const resolveApiKey = (): string => {
  if (!env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY environment variable");
  }

  return env.OPENAI_API_KEY;
};

export const runPiReviewAgent = async (
  runtime: DevboxRuntime,
  job: ReviewJobData
): Promise<void> => {
  await runWorkspaceCommand(runtime, "git status --short", 60);

  const provider = getModelProvider();
  const modelName = getModelName();
  const apiKey = resolveApiKey();

  const authStorage = AuthStorage.inMemory();
  authStorage.setRuntimeApiKey(provider, apiKey);

  const modelRegistry = ModelRegistry.inMemory(authStorage);
  if (env.OPENAI_BASE_URL) {
    modelRegistry.registerProvider(provider, { baseUrl: env.OPENAI_BASE_URL });
  }

  const findModel = modelRegistry["find"].bind(modelRegistry);
  const model = findModel(provider, modelName);

  if (!model) {
    throw new Error(`Pi model not found: ${provider}/${modelName}`);
  }

  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: true, maxRetries: 2 },
  });
  const systemPrompt = buildSystemPrompt(job);
  const resourceLoader = await createResourceLoader(
    systemPrompt,
    settingsManager
  );

  const { session } = await createAgentSession({
    agentDir: RUNREVIEW_AGENT_DIR,
    authStorage,
    customTools: [
      createBashTool(runtime),
      createReadFileTool(runtime),
      createWriteFileTool(runtime),
      createReplyTool(job.installationId, job.threadId),
    ],
    cwd: DEVBOX_WORKSPACE_DIR,
    model,
    modelRegistry,
    noTools: "builtin",
    resourceLoader,
    sessionManager: SessionManager.inMemory(DEVBOX_WORKSPACE_DIR),
    settingsManager,
    thinkingLevel: "off",
  });

  try {
    session.subscribe((event) => {
      if (
        event.type === "message_update" &&
        event.assistantMessageEvent.type === "text_delta"
      ) {
        process.stdout.write(event.assistantMessageEvent.delta);
      }
    });

    await session.prompt(buildUserPrompt(job));
    process.stdout.write("\n");
  } finally {
    session.dispose();
  }
};
