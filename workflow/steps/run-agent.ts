import type { UIMessageChunk } from "ai";
import { getWritable } from "workflow";

import { createAgent } from "@/lib/agent";
import { parseError } from "@/lib/error";
import type { DevboxRuntime } from "@/lib/runtime/devbox";
import type { ThreadMessage } from "@/workflow";

import { discoverSkills } from "./discover-skills";
import { startTyping } from "./start-typing";

export interface AgentResult {
  errorMessage?: string;
  success: boolean;
}

export const runAgent = async (
  runtime: DevboxRuntime,
  threadMessages: ThreadMessage[],
  threadId: string,
  prNumber: number,
  repoFullName: string
): Promise<AgentResult> => {
  try {
    await startTyping(threadId, "Reviewing...");

    const skills = await discoverSkills([".agents/skills"]);

    const agent = createAgent(
      runtime,
      threadId,
      prNumber,
      repoFullName,
      skills
    );

    await agent.stream({
      maxSteps: 20,
      messages: threadMessages.map((msg) => ({
        content: msg.content,
        role: msg.role,
      })),
      onStepFinish: (step) => {
        console.log(
          `[agent] step: ${step.usage.inputTokens ?? 0} in / ${step.usage.outputTokens ?? 0} out`
        );
      },
      prepareStep: ({ messages }) => {
        const trimmed = messages.map((msg) => {
          if (msg.role !== "tool" || !Array.isArray(msg.content)) {
            return msg;
          }

          return {
            ...msg,
            content: msg.content.map((part) => {
              if (part.type !== "tool-result") {
                return part;
              }

              const text = JSON.stringify(part.output);

              if (text.length <= 10_000) {
                return part;
              }

              return {
                ...part,
                output: {
                  type: "text" as const,
                  value: `${text.slice(0, 10_000)}\n\n... (truncated ${text.length - 10_000} chars)`,
                },
              };
            }),
          };
        });

        return { messages: trimmed };
      },
      stopWhen: [
        ({ steps }) => {
          let totalTokens = 0;

          for (const step of steps) {
            totalTokens +=
              (step.usage.inputTokens ?? 0) + (step.usage.outputTokens ?? 0);
          }

          return totalTokens > 200_000;
        },
      ],
      writable: getWritable<UIMessageChunk>(),
    });

    return { success: true };
  } catch (error) {
    return {
      errorMessage: parseError(error),
      success: false,
    };
  }
};
