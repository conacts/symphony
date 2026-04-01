export function buildSymphonyRuntimeEnv(
  overrides: Partial<
    Record<
      | "PORT"
      | "WORKFLOW_PATH"
      | "SYMPHONY_DB_FILE"
      | "SYMPHONY_SOURCE_REPO"
      | "SYMPHONY_ALLOWED_ORIGINS"
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
    SYMPHONY_ALLOWED_ORIGINS: "http://localhost:3000,http://127.0.0.1:3000",
    LINEAR_API_KEY: "test-linear-api-key",
    LOG_LEVEL: "debug",
    ...overrides
  };
}
