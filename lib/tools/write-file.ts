import { tool } from "ai";
import { z } from "zod";

import { writeRuntimeFile } from "@/lib/runtime/devbox";
import type { DevboxRuntime } from "@/lib/runtime/devbox";

const writeFileStep = async (
  runtime: DevboxRuntime,
  path: string,
  content: string
): Promise<{ success: boolean }> => {
  "use step";

  await writeRuntimeFile(runtime, path, content);

  return { success: true };
};

export const createWriteFileTool = (runtime: DevboxRuntime) =>
  tool({
    description:
      "Write content to a file in the DevBox runtime. Creates parent directories if needed.",
    execute: ({ content, path }) => writeFileStep(runtime, path, content),
    inputSchema: z.object({
      content: z.string().describe("The content to write to the file"),
      path: z.string().describe("The path where the file should be written"),
    }),
  });
