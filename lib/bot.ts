import type { GitHubRawMessage } from "@chat-adapter/github";
import { createGitHubAdapter } from "@chat-adapter/github";
import { createMemoryState } from "@chat-adapter/state-memory";
import { createRedisState } from "@chat-adapter/state-redis";
import { Chat, emoji } from "chat";
import type { Message, Thread } from "chat";

import { env } from "@/lib/env";
import { enqueueReviewJob } from "@/lib/jobs/enqueue";
import type { ReviewJobData, ThreadMessage } from "@/lib/jobs/types";

import { getAppInfo, getInstallationOctokit } from "./github";

const collectMessages = async (
  thread: Thread<unknown, unknown>
): Promise<ThreadMessage[]> => {
  const messages: ThreadMessage[] = [];

  for await (const msg of thread.allMessages) {
    messages.push({
      content: msg.text,
      role: msg.author.isMe ? "assistant" : "user",
    });
  }

  return messages;
};

interface ThreadState {
  baseBranch: string;
  installationId: number;
  prBranch: string;
  prNumber: number;
  repoFullName: string;
}

const state = env.REDIS_URL
  ? createRedisState({ url: env.REDIS_URL })
  : createMemoryState();

let botInstance: Chat | null = null;

const getInstallationId = async (repoFullName: string): Promise<number> => {
  const installationId = await state.get<number>(
    `github:install:${repoFullName}`
  );

  if (!installationId) {
    throw new Error(
      `Missing GitHub App installation ID for repository ${repoFullName}`
    );
  }

  return installationId;
};

const handleMention = async (thread: Thread, message: Message) => {
  await thread.adapter.addReaction(thread.id, message.id, emoji.eyes);

  const messages = await collectMessages(thread);
  const raw = message.raw as GitHubRawMessage;

  const repoFullName = raw.repository.full_name;
  const { prNumber } = raw;
  const installationId = await getInstallationId(repoFullName);

  const octokit = await getInstallationOctokit(installationId);
  const [owner, repo] = repoFullName.split("/");

  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    pull_number: prNumber,
    repo,
  });

  await thread.setState({
    baseBranch: pr.base.ref,
    installationId,
    prBranch: pr.head.ref,
    prNumber,
    repoFullName,
  } satisfies ThreadState);

  const jobId = await enqueueReviewJob({
    baseBranch: pr.base.ref,
    installationId,
    messages,
    prBranch: pr.head.ref,
    prNumber,
    repoFullName,
    threadId: thread.id,
    triggerId: message.id,
  } satisfies ReviewJobData);

  console.log(`[bot] queued review job ${jobId}`);
};

const initBot = async (): Promise<Chat> => {
  if (botInstance) {
    return botInstance;
  }

  if (
    !env.GITHUB_APP_ID ||
    !env.GITHUB_APP_PRIVATE_KEY ||
    !env.GITHUB_APP_WEBHOOK_SECRET
  ) {
    throw new Error("Missing required GitHub App environment variables");
  }

  const appInfo = await getAppInfo();

  botInstance = new Chat({
    adapters: {
      github: createGitHubAdapter({
        appId: env.GITHUB_APP_ID,
        botUserId: appInfo.botUserId,
        privateKey: env.GITHUB_APP_PRIVATE_KEY.replaceAll("\\n", "\n"),
        userName: appInfo.slug,
        webhookSecret: env.GITHUB_APP_WEBHOOK_SECRET,
      }),
    },
    logger: "debug",
    state,
    userName: appInfo.slug,
  });

  botInstance.onNewMention(handleMention);

  botInstance.onSubscribedMessage(async (thread, message) => {
    if (!message.isMention) {
      return;
    }

    await handleMention(thread, message);
  });

  botInstance.onReaction([emoji.thumbs_up, emoji.heart], async (event) => {
    if (!event.added || !event.message?.author.isMe) {
      return;
    }

    const threadState = (await event.thread.state) as ThreadState | null;

    if (!threadState) {
      return;
    }

    const messages = await collectMessages(event.thread);

    const jobId = await enqueueReviewJob({
      ...threadState,
      messages,
      threadId: event.thread.id,
      triggerId: event.message.id,
    } satisfies ReviewJobData);

    console.log(`[bot] queued review job ${jobId}`);
  });

  botInstance.onReaction([emoji.thumbs_down, emoji.confused], async (event) => {
    if (!event.added || !event.message?.author.isMe) {
      return;
    }

    await event.thread.post(
      `${emoji.eyes} Got it, skipping that. Mention me with feedback if you'd like a different approach.`
    );
  });

  return botInstance;
};

export const getBot = (): Promise<Chat> => initBot();
