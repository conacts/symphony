import type { SymphonyAgentRuntimeConfig } from "@symphony/orchestrator";
import type {
  SymphonyAgentHarnessKind,
  SymphonyAgentHarnessModule
} from "./types.js";

export type HarnessModelRuntimePolicy =
  SymphonyAgentRuntimeConfig["codex"] extends infer TCodex
    ? TCodex extends {
        profile: infer TProfile;
        defaultModel: infer TModel;
        defaultReasoningEffort: infer TReasoning;
        provider: infer TProvider;
      }
      ? {
          profile: TProfile;
          defaultModel: TModel;
          defaultReasoningEffort: TReasoning;
          provider: TProvider;
        }
      : never
    : never;

export function resolveHarnessModelRuntimePolicy(
  runtimePolicy: SymphonyAgentRuntimeConfig,
  harnessKind: SymphonyAgentHarnessKind = runtimePolicy.agent.harness
): HarnessModelRuntimePolicy {
  switch (harnessKind) {
    case "codex":
      return runtimePolicy.codex;
    case "opencode":
      return runtimePolicy.opencode;
    case "pi":
      return runtimePolicy.pi;
  }
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
  return resolveHarnessModelRuntimePolicy(runtimePolicy, harness.definition.kind);
}
