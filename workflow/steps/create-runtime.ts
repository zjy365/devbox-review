import { parseError } from "@/lib/error";
import { createDevboxRuntime } from "@/lib/runtime/devbox";
import type { DevboxRuntime } from "@/lib/runtime/devbox";

export const createRuntime = async (
  repoFullName: string,
  token: string,
  branch: string
): Promise<DevboxRuntime> => {
  "use step";

  try {
    return await createDevboxRuntime({ branch, repoFullName, token });
  } catch (error) {
    throw new Error(`Failed to create DevBox runtime: ${parseError(error)}`, {
      cause: error,
    });
  }
};
