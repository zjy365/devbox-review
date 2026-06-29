import { tool } from "ai";
import { z } from "zod";

import {
  DEVBOX_WORKSPACE_DIR,
  runWorkspaceCommand,
} from "@/lib/runtime/devbox";
import type { DevboxRuntime } from "@/lib/runtime/devbox";

const runBashStep = async (
  runtime: DevboxRuntime,
  command: string
): Promise<{ exitCode: number; stderr: string; stdout: string }> => {
  "use step";

  const result = await runWorkspaceCommand(runtime, command);

  return {
    exitCode: result.exitCode,
    stderr: result.stderr,
    stdout: result.stdout,
  };
};

export const createBashTool = (runtime: DevboxRuntime) =>
  tool({
    description: [
      "Execute bash commands in the DevBox runtime environment.",
      "",
      `WORKING DIRECTORY: ${DEVBOX_WORKSPACE_DIR}`,
      "All commands execute from this directory. Use relative paths from here.",
      "",
      "Common operations:",
      "  ls -la              # List files with details",
      "  find . -name '*.ts' # Find files by pattern",
      "  grep -r 'pattern' . # Search file contents",
      "  cat <file>          # View file contents",
    ].join("\n"),
    execute: ({ command }) => runBashStep(runtime, command),
    inputSchema: z.object({
      command: z.string().describe("The bash command to execute"),
    }),
  });
