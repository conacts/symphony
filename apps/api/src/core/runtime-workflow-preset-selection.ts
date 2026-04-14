import type { SymphonyLoadedRuntimeManifest } from "@symphony/runtime-contract";
import {
  getDefaultRuntimeRouterPresetId,
  isOperationalRuntimeRouterPresetId,
  listOperationalRuntimeRouterPresetIds,
  requireRuntimeRouterPresetId,
  type SymphonyRuntimeRouterPresetId
} from "./runtime-workflow-presets.js";

export type SymphonyRuntimeWorkflowPresetSelection = {
  presetId: SymphonyRuntimeRouterPresetId;
  source: "registry_default" | "runtime_manifest" | "bootstrap_override";
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
  overridePresetId?: string | null;
}): SymphonyRuntimeWorkflowPresetSelection {
  const runtimeManifest = input.runtimeManifest;
  if (!runtimeManifest) {
    throw new TypeError(
      "Runtime workflow preset selection requires a runtime manifest."
    );
  }

  if (input.overridePresetId) {
    try {
      const presetId = requireRuntimeRouterPresetId(input.overridePresetId);
      assertOperationalRuntimeRouterPresetId(presetId, {
        source: "bootstrap override",
        manifestPath: runtimeManifest.manifestPath
      });
      return {
        presetId,
        source: "bootstrap_override",
        repositoryKey: runtimeManifest.manifest.repositoryKey,
        manifestPath: runtimeManifest.manifestPath
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown workflow router preset.";
      throw new TypeError(
        `Runtime bootstrap requested an invalid workflow preset ${JSON.stringify(input.overridePresetId)}. ${message}`,
        {
          cause: error
        }
      );
    }
  }

  const workflowConfig = runtimeManifest.manifest.workflow;

  if (!workflowConfig) {
    throw new TypeError(
      `Runtime manifest ${runtimeManifest.manifestPath} does not define workflow configuration.`
    );
  }

  try {
    const presetId = requireRuntimeRouterPresetId(workflowConfig.defaultRouterPreset);
    assertOperationalRuntimeRouterPresetId(presetId, {
      source: "runtime manifest",
      manifestPath: runtimeManifest.manifestPath
    });
    return {
      presetId,
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

function assertOperationalRuntimeRouterPresetId(
  presetId: SymphonyRuntimeRouterPresetId,
  input: {
    source: string;
    manifestPath: string;
  }
): void {
  if (!isOperationalRuntimeRouterPresetId(presetId)) {
    const supportedPresetIds = listOperationalRuntimeRouterPresetIds()
      .map((supportedPresetId) => JSON.stringify(supportedPresetId))
      .join(", ");
    throw new TypeError(
      `Live runtime does not support workflow preset ${JSON.stringify(presetId)} from ${input.source} ${input.manifestPath}. Supported live presets: ${supportedPresetIds}.`
    );
  }
}
