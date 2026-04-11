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
  if (!runtimeManifest) {
    throw new TypeError(
      "Runtime workflow preset selection requires a runtime manifest."
    );
  }

  const workflowConfig = runtimeManifest.manifest.workflow;

  if (!workflowConfig) {
    throw new TypeError(
      `Runtime manifest ${runtimeManifest.manifestPath} does not define workflow configuration.`
    );
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
