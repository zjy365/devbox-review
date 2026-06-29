import { parseError } from "@/lib/error";
import { commitAndPushRuntimeChanges } from "@/lib/runtime/devbox";
import type { DevboxRuntime } from "@/lib/runtime/devbox";

export const commitAndPush = async (
  runtime: DevboxRuntime,
  message: string,
  branchName?: string
): Promise<void> => {
  "use step";

  try {
    await commitAndPushRuntimeChanges(runtime, message, branchName);
  } catch (error) {
    throw new Error(`Failed to commit and push: ${parseError(error)}`, {
      cause: error,
    });
  }
};
