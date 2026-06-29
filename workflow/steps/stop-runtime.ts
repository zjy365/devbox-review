import { parseError } from "@/lib/error";
import { pauseDevboxRuntime } from "@/lib/runtime/devbox";
import type { DevboxRuntime } from "@/lib/runtime/devbox";

export const stopRuntime = async (runtime: DevboxRuntime): Promise<void> => {
  "use step";

  try {
    await pauseDevboxRuntime(runtime);
  } catch (error) {
    throw new Error(`Failed to pause DevBox runtime: ${parseError(error)}`, {
      cause: error,
    });
  }
};
