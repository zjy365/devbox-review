import { parseError } from "@/lib/error";
import { installRuntimeDependencies } from "@/lib/runtime/devbox";
import type { DevboxRuntime } from "@/lib/runtime/devbox";

export const installDependencies = async (
  runtime: DevboxRuntime
): Promise<void> => {
  "use step";

  try {
    await installRuntimeDependencies(runtime);
  } catch (error) {
    throw new Error(
      `Failed to install project dependencies: ${parseError(error)}`,
      { cause: error }
    );
  }
};
