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
  workspaceBackend: "local" | "docker";
  dockerWorkspaceImage: string | null;
  dockerMaterializationMode: "bind_mount" | "volume";
  dockerWorkspacePath: string | null;
  dockerContainerNamePrefix: string | null;
  dockerShell: string | null;
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
      SYMPHONY_WORKSPACE_BACKEND: z.enum(["local", "docker"]).optional(),
      SYMPHONY_DOCKER_WORKSPACE_IMAGE: z.string().min(1).optional(),
      SYMPHONY_DOCKER_MATERIALIZATION_MODE: z
        .enum(["bind_mount", "volume"])
        .optional(),
      SYMPHONY_DOCKER_WORKSPACE_PATH: z.string().min(1).optional(),
      SYMPHONY_DOCKER_CONTAINER_NAME_PREFIX: z.string().min(1).optional(),
      SYMPHONY_DOCKER_SHELL: z.string().min(1).optional(),
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

  const workspaceBackend = parsed.SYMPHONY_WORKSPACE_BACKEND ?? "local";

  return {
    port: parsed.PORT,
    workflowPath: parsed.WORKFLOW_PATH ?? defaultSymphonyWorkflowPath(cwd),
    dbFile: parsed.SYMPHONY_DB_FILE ?? defaultSymphonyDbFile(cwd),
    sourceRepo: parsed.SYMPHONY_SOURCE_REPO ?? null,
    workspaceBackend,
    dockerWorkspaceImage: parsed.SYMPHONY_DOCKER_WORKSPACE_IMAGE ?? null,
    dockerMaterializationMode:
      parsed.SYMPHONY_DOCKER_MATERIALIZATION_MODE ?? "bind_mount",
    dockerWorkspacePath: parsed.SYMPHONY_DOCKER_WORKSPACE_PATH ?? null,
    dockerContainerNamePrefix:
      parsed.SYMPHONY_DOCKER_CONTAINER_NAME_PREFIX ?? null,
    dockerShell: parsed.SYMPHONY_DOCKER_SHELL ?? null,
    allowedOrigins: parseAllowedOrigins(parsed.SYMPHONY_ALLOWED_ORIGINS),
    linearApiKey: parsed.LINEAR_API_KEY,
    logLevel: resolveSymphonyLogLevel(parsed.LOG_LEVEL, "debug")
  };
}

export function buildSymphonyRuntimeEnvironmentSource(
  env: SymphonyRuntimeAppEnv,
  source: EnvironmentSource = process.env
): EnvironmentSource {
  return {
    ...Object.fromEntries(
      Object.entries(source).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    ),
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
