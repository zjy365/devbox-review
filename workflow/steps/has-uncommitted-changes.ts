import { parseError } from "@/lib/error";
import { hasRuntimeChanges } from "@/lib/runtime/devbox";
import type { DevboxRuntime } from "@/lib/runtime/devbox";

export const hasUncommittedChanges = async (
  runtime: DevboxRuntime
): Promise<boolean> => {
  "use step";

  try {
    return await hasRuntimeChanges(runtime);
  } catch (error) {
    throw new Error(
      `[hasUncommittedChanges] Failed to check runtime changes: ${parseError(error)}`,
      { cause: error }
    );
  }
};
