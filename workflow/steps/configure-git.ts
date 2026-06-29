import { parseError } from "@/lib/error";
import { configureRuntimeGit } from "@/lib/runtime/devbox";
import type { DevboxRuntime } from "@/lib/runtime/devbox";

export const configureGit = async (
  runtime: DevboxRuntime,
  repoFullName: string,
  token: string
): Promise<void> => {
  "use step";

  try {
    await configureRuntimeGit(runtime, repoFullName, token);
  } catch (error) {
    throw new Error(`Failed to configure git: ${parseError(error)}`, {
      cause: error,
    });
  }
};
