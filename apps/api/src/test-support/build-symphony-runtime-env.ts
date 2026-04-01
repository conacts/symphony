import { buildSymphonyRuntimeEnv as buildBaseSymphonyRuntimeEnv } from "@symphony/test-support";

export function buildSymphonyRuntimeEnv(
  overrides: Partial<
    Record<
      | "PORT"
      | "WORKFLOW_PATH"
      | "SYMPHONY_DB_FILE"
      | "SYMPHONY_SOURCE_REPO"
      | "SYMPHONY_WORKSPACE_BACKEND"
      | "SYMPHONY_DOCKER_WORKSPACE_IMAGE"
      | "SYMPHONY_DOCKER_WORKSPACE_PATH"
      | "SYMPHONY_DOCKER_CONTAINER_NAME_PREFIX"
      | "SYMPHONY_DOCKER_SHELL"
      | "SYMPHONY_ALLOWED_ORIGINS"
      | "LINEAR_API_KEY"
      | "LOG_LEVEL",
      string | undefined
    >
  > = {}
): Record<string, string | undefined> {
  return buildBaseSymphonyRuntimeEnv(overrides as never);
}
