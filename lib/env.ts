import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  experimental__runtimeEnv: {},
  server: {
    DEVBOX_API_BASE_URL: z.string().url().optional(),
    DEVBOX_ARCHIVE_AFTER_PAUSE_TIME: z.string().min(1).optional(),
    DEVBOX_COMMAND_TIMEOUT_SECONDS: z.string().min(1).optional(),
    DEVBOX_JWT_SIGNING_KEY: z.string().min(1).optional(),
    DEVBOX_JWT_TTL_SECONDS: z.string().min(1).optional(),
    DEVBOX_NAMESPACE: z.string().min(1).optional(),
    DEVBOX_PAUSE_AFTER_MINUTES: z.string().min(1).optional(),
    DEVBOX_RUNTIME_IMAGE: z.string().min(1).optional(),
    DEVBOX_TOKEN: z.string().min(1).optional(),
    GITHUB_APP_ID: z.string().min(1).optional(),
    GITHUB_APP_INSTALLATION_ID: z.coerce.number().int().positive().optional(),
    GITHUB_APP_PRIVATE_KEY: z.string().min(1).optional(),
    GITHUB_APP_WEBHOOK_SECRET: z.string().min(1).optional(),
    REDIS_URL: z.string().url().optional(),
  },
  skipValidation: Boolean(process.env.SKIP_ENV_VALIDATION),
});
