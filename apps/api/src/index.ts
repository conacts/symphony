import { SYMPHONY_CONTRACTS_PACKAGE_NAME } from "@symphony/contracts";
import { SYMPHONY_CORE_PACKAGE_NAME } from "@symphony/core";
import { SYMPHONY_LOGGER_PACKAGE_NAME } from "@symphony/logger";
import {
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
    SYMPHONY_CORE_PACKAGE_NAME,
    SYMPHONY_CONTRACTS_PACKAGE_NAME,
    SYMPHONY_LOGGER_PACKAGE_NAME
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
  )
) {
  const services = await loadDefaultSymphonyRuntimeAppServices(env, environmentSource);
  return createSymphonyRuntimeApp(services);
}

export async function createDefaultSymphonyRuntimeApplication(
  env: SymphonyRuntimeAppEnv = loadSymphonyRuntimeAppEnv(),
  environmentSource: Record<string, string | undefined> = buildSymphonyRuntimeEnvironmentSource(
    env
  )
) {
  const services = await loadDefaultSymphonyRuntimeAppServices(env, environmentSource);
  return createSymphonyRuntimeApplication(services);
}

export type { SymphonyRuntimeAppServices };
export { createSymphonyRuntimeServer };
