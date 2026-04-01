import {
  defaultSymphonyWorkflowPath
} from "@symphony/core";
import { defaultSymphonyDbFile } from "@symphony/db";
import { createEnv, z } from "@symphony/env";
import {
  resolveSymphonyLogLevel,
  type SymphonyLogLevel
} from "@symphony/logger";

export const DEFAULT_SYMPHONY_RUNTIME_PORT = 4_400;

export type EnvironmentSource = Record<string, string | undefined>;

export type SymphonyRuntimeAppEnv = {
  port: number;
  workflowPath: string;
  dbFile: string;
  sourceRepo: string | null;
  allowedOrigins: string[];
  linearApiKey: string;
  logLevel: SymphonyLogLevel;
};

export function loadSymphonyRuntimeAppEnv(
  env: EnvironmentSource = process.env,
  cwd = process.cwd()
): SymphonyRuntimeAppEnv {
  const parsed = createEnv({
    server: {
      PORT: z.coerce.number().int().positive().max(65_535).default(
        DEFAULT_SYMPHONY_RUNTIME_PORT
      ),
      WORKFLOW_PATH: z.string().min(1).optional(),
      SYMPHONY_DB_FILE: z.string().min(1).optional(),
      SYMPHONY_SOURCE_REPO: z.string().min(1).optional(),
      SYMPHONY_ALLOWED_ORIGINS: z.string().min(1).optional(),
      LOG_LEVEL: z.string().min(1).optional(),
      LINEAR_API_KEY: z
        .string({
          error: (issue) =>
            issue.input === undefined
              ? "LINEAR_API_KEY is required for @symphony/api."
              : undefined
        })
        .min(1, "LINEAR_API_KEY is required for @symphony/api.")
    },
    runtimeEnv: env,
    emptyStringAsUndefined: true,
    onValidationError: (issues) => {
      const details = issues.map((issue) => {
        const pathLabel =
          issue.path && issue.path.length > 0
            ? `${issue.path.map((segment) => String(segment)).join(".")}: `
            : "";

        return `${pathLabel}${issue.message}`;
      });

      throw new TypeError(
        `Invalid Symphony runtime environment: ${details.join("; ")}`
      );
    }
  });

  if (env.SYMPHONY_RUN_JOURNAL_FILE) {
    throw new TypeError(
      "Invalid Symphony runtime environment: SYMPHONY_RUN_JOURNAL_FILE is no longer supported; use SYMPHONY_DB_FILE."
    );
  }

  return {
    port: parsed.PORT,
    workflowPath: parsed.WORKFLOW_PATH ?? defaultSymphonyWorkflowPath(cwd),
    dbFile: parsed.SYMPHONY_DB_FILE ?? defaultSymphonyDbFile(cwd),
    sourceRepo: parsed.SYMPHONY_SOURCE_REPO ?? null,
    allowedOrigins: parseAllowedOrigins(parsed.SYMPHONY_ALLOWED_ORIGINS),
    linearApiKey: parsed.LINEAR_API_KEY,
    logLevel: resolveSymphonyLogLevel(parsed.LOG_LEVEL, "debug")
  };
}

export function buildSymphonyRuntimeEnvironmentSource(
  env: SymphonyRuntimeAppEnv
): EnvironmentSource {
  return {
    LINEAR_API_KEY: env.linearApiKey,
    SYMPHONY_SOURCE_REPO: env.sourceRepo ?? undefined
  };
}

function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
