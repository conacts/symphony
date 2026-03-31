export function buildSymphonyDashboardEnv(
  overrides: Partial<
    Record<
      "SYMPHONY_RUNTIME_BASE_URL" | "NEXT_PUBLIC_SYMPHONY_RUNTIME_BASE_URL",
      string
    >
  > = {}
): Record<string, string | undefined> {
  return {
    SYMPHONY_RUNTIME_BASE_URL: "http://127.0.0.1:4500",
    NEXT_PUBLIC_SYMPHONY_RUNTIME_BASE_URL: "http://127.0.0.1:4500",
    ...overrides
  };
}
