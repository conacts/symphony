import {
  defaultSymphonyRunJournalFile,
  defaultSymphonyWorkflowPath
} from "@symphony/core";
import { createEnv, z } from "@symphony/env";

export const DEFAULT_SYMPHONY_RUNTIME_PORT = 4_400;

export type EnvironmentSource = Record<string, string | undefined>;

export type SymphonyRuntimeAppEnv = {
  port: number;
  workflowPath: string;
  runJournalFile: string;
  linearApiKey: string;
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
      SYMPHONY_RUN_JOURNAL_FILE: z.string().min(1).optional(),
      LINEAR_API_KEY: z
        .string({
          error: (issue) =>
            issue.input === undefined
              ? "LINEAR_API_KEY is required for @symphony/runtime."
              : undefined
        })
        .min(1, "LINEAR_API_KEY is required for @symphony/runtime.")
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

  return {
    port: parsed.PORT,
    workflowPath: parsed.WORKFLOW_PATH ?? defaultSymphonyWorkflowPath(cwd),
    runJournalFile:
      parsed.SYMPHONY_RUN_JOURNAL_FILE ?? defaultSymphonyRunJournalFile(cwd),
    linearApiKey: parsed.LINEAR_API_KEY
  };
}

export function buildSymphonyRuntimeEnvironmentSource(
  env: SymphonyRuntimeAppEnv
): EnvironmentSource {
  return {
    LINEAR_API_KEY: env.linearApiKey
  };
}
