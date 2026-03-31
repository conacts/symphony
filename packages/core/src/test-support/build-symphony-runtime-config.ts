import type { SymphonyRuntimeConfig } from "../core/runtime-config.js";
import { buildSymphonyRepositoryTarget } from "./build-symphony-repository-target.js";

export function buildSymphonyRuntimeConfig(
  overrides: Partial<SymphonyRuntimeConfig> = {}
): SymphonyRuntimeConfig {
  return {
    repositoryTarget: overrides.repositoryTarget ?? buildSymphonyRepositoryTarget(),
    pollIntervalMs: overrides.pollIntervalMs ?? 5_000,
    realtimeEnabled: overrides.realtimeEnabled ?? true
  };
}
