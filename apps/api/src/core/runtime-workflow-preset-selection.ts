import type { SymphonyLoadedRuntimeManifest } from "@symphony/runtime-contract";
import {
  getDefaultRuntimeRouterPresetId,
  requireRuntimeRouterPresetId,
  type SymphonyRuntimeRouterPresetId
} from "./runtime-workflow-presets.js";

export type SymphonyRuntimeWorkflowPresetSelection = {
  presetId: SymphonyRuntimeRouterPresetId;
  source: "registry_default" | "runtime_manifest";
  repositoryKey: string | null;
  manifestPath: string | null;
};

export function createDefaultRuntimeWorkflowPresetSelection(): SymphonyRuntimeWorkflowPresetSelection {
  return {
    presetId: getDefaultRuntimeRouterPresetId(),
    source: "registry_default",
    repositoryKey: null,
    manifestPath: null
  };
}

export function resolveRuntimeWorkflowPresetSelection(input: {
  runtimeManifest: SymphonyLoadedRuntimeManifest | null;
}): SymphonyRuntimeWorkflowPresetSelection {
  const runtimeManifest = input.runtimeManifest;
  const workflowConfig = runtimeManifest?.manifest.workflow ?? null;

  if (!runtimeManifest || !workflowConfig) {
    return createDefaultRuntimeWorkflowPresetSelection();
  }

  try {
    return {
      presetId: requireRuntimeRouterPresetId(workflowConfig.defaultRouterPreset),
      source: "runtime_manifest",
      repositoryKey: runtimeManifest.manifest.repositoryKey,
      manifestPath: runtimeManifest.manifestPath
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown workflow router preset.";
    throw new TypeError(
      `Runtime manifest ${runtimeManifest.manifestPath} selects an invalid workflow preset ${JSON.stringify(workflowConfig.defaultRouterPreset)}. ${message}`,
      {
        cause: error
      }
    );
  }
}
