export function buildSymphonyRuntimeEnv(
  overrides: Partial<
    Record<
      | "PORT"
      | "WORKFLOW_PATH"
      | "SYMPHONY_DB_FILE"
      | "SYMPHONY_SOURCE_REPO"
      | "LINEAR_API_KEY"
      | "LOG_LEVEL",
      string
    >
  > = {}
): Record<string, string | undefined> {
  return {
    PORT: "4500",
    WORKFLOW_PATH: "/tmp/WORKFLOW.md",
    SYMPHONY_DB_FILE: "/tmp/symphony.db",
    SYMPHONY_SOURCE_REPO: "/tmp/source-repo",
    LINEAR_API_KEY: "test-linear-api-key",
    LOG_LEVEL: "debug",
    ...overrides
  };
}
