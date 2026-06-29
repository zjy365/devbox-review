import { parseError } from "@/lib/error";
import { cloneDevboxRuntimeRepository } from "@/lib/runtime/devbox";
import type {
  CreateDevboxRuntimeInput,
  DevboxRuntime,
} from "@/lib/runtime/devbox";

export const cloneRuntimeRepository = async (
  runtime: DevboxRuntime,
  input: CreateDevboxRuntimeInput
): Promise<void> => {
  "use step";

  try {
    await cloneDevboxRuntimeRepository(runtime, input);
  } catch (error) {
    throw new Error(`Failed to clone repository: ${parseError(error)}`, {
      cause: error,
    });
  }
};
