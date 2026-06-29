import { parseError } from "@/lib/error";
import { refreshDevboxRuntime } from "@/lib/runtime/devbox";
import type { DevboxRuntime } from "@/lib/runtime/devbox";

export const extendRuntime = async (runtime: DevboxRuntime): Promise<void> => {
  "use step";

  try {
    await refreshDevboxRuntime(runtime);
  } catch (error) {
    throw new Error(`Failed to refresh DevBox lease: ${parseError(error)}`, {
      cause: error,
    });
  }
};
