import type { SymphonyTrackerConfig } from "@symphony/tracker";
import {
  runtimeAutoMergeRuntimeRouterPresetModule
} from "./runtime-auto-merge-routing.js";
import {
  runtimeIntelligentFlowRuntimeRouterPresetModule
} from "./runtime-intelligent-flow-routing.js";
import {
  runtimeCurrentFlowRuntimeRouterPresetModule
} from "./runtime-current-flow-routing.js";
import {
  createSymphonyRuntimeWorkflowPresetRegistry,
  type SymphonyResolvedRuntimeWorkflowPreset,
  type SymphonyRuntimeWorkflowPresetSelection,
  type SymphonyStoredRouteWorkflowRouterBinding
} from "./runtime-workflow-preset-registry.js";

const runtimeWorkflowPresetModules = {
  "auto-merge": runtimeAutoMergeRuntimeRouterPresetModule,
  "current-flow": runtimeCurrentFlowRuntimeRouterPresetModule,
  "intelligent-flow": runtimeIntelligentFlowRuntimeRouterPresetModule
} as const;

const runtimeWorkflowPresetRegistry =
  createSymphonyRuntimeWorkflowPresetRegistry({
    // Intelligent-flow is the default for new workflows. current-flow remains
    // registered for explicit replay/comparison and because auto-merge still
    // reuses its contract until that legacy path is extracted.
    defaultPresetId: "intelligent-flow",
    modules: runtimeWorkflowPresetModules
  });

export type SymphonyRuntimeRouterPresetId =
  keyof typeof runtimeWorkflowPresetModules;

export type SymphonyResolvedRuntimeRouterPreset<
  PresetId extends SymphonyRuntimeRouterPresetId,
> = SymphonyResolvedRuntimeWorkflowPreset<
  typeof runtimeWorkflowPresetModules,
  PresetId
>;

export type SymphonyRuntimeRouterPresetSelection =
  SymphonyRuntimeWorkflowPresetSelection<typeof runtimeWorkflowPresetModules>;

export type SymphonyRuntimeCurrentFlowRouting =
  SymphonyResolvedRuntimeRouterPreset<"current-flow">;
export type SymphonyRuntimeAutoMergeRouting =
  SymphonyResolvedRuntimeRouterPreset<"auto-merge">;
export type SymphonyRuntimeIntelligentFlowRouting =
  SymphonyResolvedRuntimeRouterPreset<"intelligent-flow">;

export function getDefaultRuntimeRouterPresetId(): SymphonyRuntimeRouterPresetId {
  return runtimeWorkflowPresetRegistry.getDefaultPresetId();
}

export function listRuntimeRouterPresetIds(): SymphonyRuntimeRouterPresetId[] {
  return runtimeWorkflowPresetRegistry.listPresetIds() as SymphonyRuntimeRouterPresetId[];
}

export function requireRuntimeRouterPresetId(
  presetId: string
): SymphonyRuntimeRouterPresetId {
  const presetIds = listRuntimeRouterPresetIds();
  if (presetIds.includes(presetId as SymphonyRuntimeRouterPresetId)) {
    return presetId as SymphonyRuntimeRouterPresetId;
  }

  throw new TypeError(
    `Unknown workflow router preset ${JSON.stringify(presetId)}. Expected one of ${presetIds
      .map((registeredPresetId) => JSON.stringify(registeredPresetId))
      .join(", ")}.`
  );
}

export async function createRuntimeCurrentFlowRouting(input: {
  trackerConfig: SymphonyTrackerConfig;
  now?: () => Date;
}): Promise<SymphonyRuntimeCurrentFlowRouting> {
  return await runtimeWorkflowPresetRegistry.resolvePreset({
    presetId: "current-flow",
    trackerConfig: input.trackerConfig,
    now: input.now
  });
}

export async function createRuntimeAutoMergeRouting(input: {
  trackerConfig: SymphonyTrackerConfig;
  now?: () => Date;
}): Promise<SymphonyRuntimeAutoMergeRouting> {
  return await runtimeWorkflowPresetRegistry.resolvePreset({
    presetId: "auto-merge",
    trackerConfig: input.trackerConfig,
    now: input.now
  });
}

export async function createRuntimeIntelligentFlowRouting(input: {
  trackerConfig: SymphonyTrackerConfig;
  now?: () => Date;
}): Promise<SymphonyRuntimeIntelligentFlowRouting> {
  return await runtimeWorkflowPresetRegistry.resolvePreset({
    presetId: "intelligent-flow",
    trackerConfig: input.trackerConfig,
    now: input.now
  });
}

export async function selectRuntimeRouterPreset(input: {
  trackerConfig: SymphonyTrackerConfig;
  presetId?: string;
  now?: () => Date;
}): Promise<SymphonyRuntimeRouterPresetSelection> {
  return await runtimeWorkflowPresetRegistry.selectPreset(input);
}

export async function resolveStoredRuntimeRouterPreset(input: {
  trackerConfig: SymphonyTrackerConfig;
  workflow: SymphonyStoredRouteWorkflowRouterBinding;
  now?: () => Date;
}): Promise<SymphonyRuntimeRouterPresetSelection> {
  return await runtimeWorkflowPresetRegistry.resolveStoredWorkflow(input);
}
