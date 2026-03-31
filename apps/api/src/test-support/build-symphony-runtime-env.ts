export function buildSymphonyRuntimeEnv(
  overrides: Partial<
    Record<
      | "PORT"
      | "WORKFLOW_PATH"
      | "SYMPHONY_RUN_JOURNAL_FILE"
      | "LINEAR_API_KEY"
      | "LOG_LEVEL",
      string
    >
  > = {}
): Record<string, string | undefined> {
  return {
    PORT: "4500",
    WORKFLOW_PATH: "/tmp/WORKFLOW.md",
    SYMPHONY_RUN_JOURNAL_FILE: "/tmp/run-journal.json",
    LINEAR_API_KEY: "test-linear-api-key",
    LOG_LEVEL: "debug",
    ...overrides
  };
}
