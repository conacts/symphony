import { SYMPHONY_CONTRACTS_PACKAGE_NAME } from "@symphony/contracts";
import { SYMPHONY_LOGGER_PACKAGE_NAME } from "@symphony/logger";
import {
  buildSymphonyHostCommandEnvironmentSource,
  buildSymphonyRuntimeEnvironmentSource,
  loadSymphonyRuntimeAppEnv,
  type SymphonyRuntimeAppEnv
} from "./core/env.js";
import {
  loadDefaultSymphonyRuntimeAppServices,
  type SymphonyRuntimeAppServices
} from "./core/runtime-services.js";
import {
  createSymphonyRuntimeApp,
  createSymphonyRuntimeApplication
} from "./http/app.js";
import { createSymphonyRuntimeServer } from "./server.js";

export const SYMPHONY_RUNTIME_APP_BOUNDARY = {
  packageName: "@symphony/api",
  dependsOn: [
    "@symphony/core",
    SYMPHONY_CONTRACTS_PACKAGE_NAME,
    "@symphony/db",
    SYMPHONY_LOGGER_PACKAGE_NAME,
    "@symphony/runtime-contract"
  ]
} as const;

export function describeSymphonyRuntimeApp(
  env: SymphonyRuntimeAppEnv = loadSymphonyRuntimeAppEnv()
) {
  return {
    ...SYMPHONY_RUNTIME_APP_BOUNDARY,
    env
  };
}

export async function createDefaultSymphonyRuntimeApp(
  env: SymphonyRuntimeAppEnv = loadSymphonyRuntimeAppEnv(),
  environmentSource: Record<string, string | undefined> = buildSymphonyRuntimeEnvironmentSource(
    env
  ),
  hostCommandEnvSource: Record<string, string | undefined> = buildSymphonyHostCommandEnvironmentSource()
) {
  const services = await loadDefaultSymphonyRuntimeAppServices(
    env,
    environmentSource,
    hostCommandEnvSource
  );
  return createSymphonyRuntimeApp(services, {
    allowedOrigins: env.allowedOrigins
  });
}

export async function createDefaultSymphonyRuntimeApplication(
  env: SymphonyRuntimeAppEnv = loadSymphonyRuntimeAppEnv(),
  environmentSource: Record<string, string | undefined> = buildSymphonyRuntimeEnvironmentSource(
    env
  ),
  hostCommandEnvSource: Record<string, string | undefined> = buildSymphonyHostCommandEnvironmentSource()
) {
  const services = await loadDefaultSymphonyRuntimeAppServices(
    env,
    environmentSource,
    hostCommandEnvSource
  );
  return createSymphonyRuntimeApplication(services, {
    allowedOrigins: env.allowedOrigins
  });
}

export type { SymphonyRuntimeAppServices };
export { createSymphonyRuntimeServer };
