import type { DevboxInfo } from "@/lib/devbox/types";
import { parseError } from "@/lib/error";
import { getDevboxRuntimeInfo } from "@/lib/runtime/devbox";
import type { DevboxRuntime } from "@/lib/runtime/devbox";

export const getRuntimeInfo = async (
  runtime: DevboxRuntime
): Promise<DevboxInfo> => {
  "use step";

  try {
    return await getDevboxRuntimeInfo(runtime);
  } catch (error) {
    throw new Error(`Failed to get DevBox runtime info: ${parseError(error)}`, {
      cause: error,
    });
  }
};
