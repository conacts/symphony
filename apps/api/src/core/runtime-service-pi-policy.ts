import type { SymphonyResolvedRuntimePolicy } from "@symphony/runtime-policy";
import type { SymphonyNormalizedRuntimeManifest } from "@symphony/runtime-contract";

export function applyRuntimeManifestPiPolicy(
  runtimePolicy: SymphonyResolvedRuntimePolicy,
  runtimeManifest: SymphonyNormalizedRuntimeManifest
): SymphonyResolvedRuntimePolicy {
  if (!runtimeManifest.pi) {
    return runtimePolicy;
  }

  const mergedPresets = {
    ...runtimePolicy.pi.presets,
    ...Object.fromEntries(
      Object.entries(runtimeManifest.pi.presets).map(([presetName, preset]) => [
        presetName,
        {
          model: preset.model,
          reasoningEffort: preset.reasoningEffort ?? null,
          authMode: preset.auth ?? "provider"
        }
      ])
    )
  };
  const defaultPreset = runtimeManifest.pi.defaultPreset;
  const defaultPresetConfig = mergedPresets[defaultPreset] ?? null;
  const defaultModel = defaultPresetConfig?.model ?? runtimePolicy.pi.defaultModel;
  const defaultReasoningEffort =
    defaultPresetConfig?.reasoningEffort ?? runtimePolicy.pi.defaultReasoningEffort;

  return {
    ...runtimePolicy,
    pi: {
      ...runtimePolicy.pi,
      defaultPreset,
      presets: mergedPresets,
      defaultModel,
      defaultReasoningEffort
    },
    agentRuntime: {
      ...runtimePolicy.agentRuntime,
      defaultPreset,
      presets: mergedPresets,
      defaultModel,
      defaultReasoningEffort
    }
  };
}
