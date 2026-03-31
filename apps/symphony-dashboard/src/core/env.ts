export const DEFAULT_SYMPHONY_RUNTIME_BASE_URL = "http://127.0.0.1:4400";

export type EnvironmentSource = Record<string, string | undefined>;

export type SymphonyDashboardEnv = {
  runtimeBaseUrl: string;
};

export function loadSymphonyDashboardEnv(
  env: EnvironmentSource = process.env
): SymphonyDashboardEnv {
  const runtimeBaseUrl =
    env.NEXT_PUBLIC_SYMPHONY_RUNTIME_BASE_URL?.trim() ??
    env.SYMPHONY_RUNTIME_BASE_URL?.trim();

  return {
    runtimeBaseUrl:
      runtimeBaseUrl && runtimeBaseUrl.length > 0
        ? runtimeBaseUrl
        : DEFAULT_SYMPHONY_RUNTIME_BASE_URL
  };
}
