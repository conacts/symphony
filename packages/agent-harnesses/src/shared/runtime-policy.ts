import type { SymphonyAgentRuntimeConfig } from "@symphony/orchestrator";
import type {
  SymphonyAgentHarnessKind,
  SymphonyAgentHarnessModule
} from "./types.js";

export type HarnessModelRuntimePolicy = SymphonyAgentRuntimeConfig["pi"];

export function resolveHarnessModelRuntimePolicy(
  runtimePolicy: SymphonyAgentRuntimeConfig,
  harnessKind: SymphonyAgentHarnessKind = runtimePolicy.agent.harness
): HarnessModelRuntimePolicy {
  void harnessKind;
  return runtimePolicy.pi;
}

export function resolveHarnessProviderEnvKey(
  runtimePolicy: SymphonyAgentRuntimeConfig,
  harnessKind: SymphonyAgentHarnessKind = runtimePolicy.agent.harness
): string | null {
  return resolveHarnessModelRuntimePolicy(runtimePolicy, harnessKind).provider?.envKey ?? null;
}

export function resolveHarnessModuleModelRuntimePolicy(
  runtimePolicy: SymphonyAgentRuntimeConfig,
  harness: Pick<SymphonyAgentHarnessModule, "definition">
): HarnessModelRuntimePolicy {
  void harness;
  return runtimePolicy.pi;
}
