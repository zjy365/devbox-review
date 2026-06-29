import { tool } from "ai";
import { z } from "zod";

import { readRuntimeFile } from "@/lib/runtime/devbox";
import type { DevboxRuntime } from "@/lib/runtime/devbox";

const readFileStep = async (
  runtime: DevboxRuntime,
  path: string
): Promise<{ content: string }> => ({
  content: await readRuntimeFile(runtime, path),
});

export const createReadFileTool = (runtime: DevboxRuntime) =>
  tool({
    description: "Read the contents of a file from the DevBox runtime.",
    execute: ({ path }) => readFileStep(runtime, path),
    inputSchema: z.object({
      path: z.string().describe("The path to the file to read"),
    }),
  });
