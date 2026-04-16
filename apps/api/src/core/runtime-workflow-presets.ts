import type { SymphonyTrackerConfig } from "@symphony/tracker";
import {
  runtimeIntelligentFlowRuntimeRouterPresetModule
} from "./runtime-intelligent-flow-routing.js";
import {
  createSymphonyRuntimeWorkflowPresetRegistry,
  type SymphonyResolvedRuntimeWorkflowPreset,
  type SymphonyRuntimeWorkflowPresetSelection,
  type SymphonyStoredRouteWorkflowRouterBinding
} from "./runtime-workflow-preset-registry.js";

const runtimeWorkflowPresetModules = {
  "intelligent-flow": runtimeIntelligentFlowRuntimeRouterPresetModule
} as const;

const runtimeWorkflowPresetRegistry =
  createSymphonyRuntimeWorkflowPresetRegistry({
    defaultPresetId: "intelligent-flow",
    modules: runtimeWorkflowPresetModules
  });

export type SymphonyRuntimeRouterPresetId =
  keyof typeof runtimeWorkflowPresetModules;

export const operationalRuntimeRouterPresetIds = [
  "intelligent-flow"
] as const satisfies readonly SymphonyRuntimeRouterPresetId[];

export type SymphonyOperationalRuntimeRouterPresetId =
  (typeof operationalRuntimeRouterPresetIds)[number];

export type SymphonyResolvedRuntimeRouterPreset<
  PresetId extends SymphonyRuntimeRouterPresetId,
> = SymphonyResolvedRuntimeWorkflowPreset<
  typeof runtimeWorkflowPresetModules,
  PresetId
>;

export type SymphonyRuntimeRouterPresetSelection =
  SymphonyRuntimeWorkflowPresetSelection<typeof runtimeWorkflowPresetModules>;

export type SymphonyRuntimeIntelligentFlowRouting =
  SymphonyResolvedRuntimeRouterPreset<"intelligent-flow">;

export function getDefaultRuntimeRouterPresetId(): SymphonyRuntimeRouterPresetId {
  return runtimeWorkflowPresetRegistry.getDefaultPresetId();
}

export function listRuntimeRouterPresetIds(): SymphonyRuntimeRouterPresetId[] {
  return runtimeWorkflowPresetRegistry.listPresetIds() as SymphonyRuntimeRouterPresetId[];
}

export function listOperationalRuntimeRouterPresetIds(): SymphonyOperationalRuntimeRouterPresetId[] {
  return [...operationalRuntimeRouterPresetIds];
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

export function isOperationalRuntimeRouterPresetId(
  presetId: SymphonyRuntimeRouterPresetId
): presetId is SymphonyOperationalRuntimeRouterPresetId {
  return operationalRuntimeRouterPresetIds.includes(
    presetId as SymphonyOperationalRuntimeRouterPresetId
  );
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
