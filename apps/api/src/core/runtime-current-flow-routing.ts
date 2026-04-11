import {
  createSymphonyCurrentFlowRouterPreset,
  createWorkflowRouterPresetRegistry,
  type ResolvedWorkflowRouterPreset,
  type SymphonyCurrentFlowData,
  type SymphonyCurrentFlowNode,
  type SymphonyCurrentFlowPolicy,
  type WorkflowRouter
} from "@symphony/router";
import type { SymphonyTrackerConfig } from "@symphony/tracker";

export type SymphonyRuntimeCurrentFlowRouter = WorkflowRouter<
  SymphonyCurrentFlowNode,
  SymphonyCurrentFlowData,
  SymphonyCurrentFlowPolicy
>;

const runtimeRouterPresets = {
  "current-flow": createSymphonyCurrentFlowRouterPreset()
} as const;

export const runtimeRouterPresetRegistry =
  createWorkflowRouterPresetRegistry(runtimeRouterPresets);

export type SymphonyRuntimeRouterPresetId = keyof typeof runtimeRouterPresets;

export type SymphonyRuntimeCurrentFlowRouting = ResolvedWorkflowRouterPreset<
  "current-flow",
  SymphonyCurrentFlowNode,
  SymphonyCurrentFlowData,
  SymphonyCurrentFlowPolicy
>;

export async function createRuntimeCurrentFlowRouting(input: {
  trackerConfig: SymphonyTrackerConfig;
  now?: () => Date;
}): Promise<SymphonyRuntimeCurrentFlowRouting> {
  return await selectRuntimeRouterPreset({
    trackerConfig: input.trackerConfig,
    presetId: "current-flow",
    now: input.now
  });
}

export function listRuntimeRouterPresetIds(): SymphonyRuntimeRouterPresetId[] {
  return runtimeRouterPresetRegistry.listPresetIds();
}

export async function selectRuntimeRouterPreset(input: {
  trackerConfig: SymphonyTrackerConfig;
  presetId?: string;
  now?: () => Date;
}): Promise<SymphonyRuntimeCurrentFlowRouting> {
  const requestedPresetId = input.presetId ?? "current-flow";

  if (!runtimeRouterPresetRegistry.hasPresetId(requestedPresetId)) {
    throw new TypeError(
      `Unknown workflow router preset ${JSON.stringify(requestedPresetId)}. Expected one of ${listRuntimeRouterPresetIds()
        .map((presetId) => JSON.stringify(presetId))
        .join(", ")}.`
    );
  }

  const presetId: SymphonyRuntimeRouterPresetId = requestedPresetId;
  assertTrackerContractForRuntimeRouterPreset({
    presetId,
    trackerConfig: input.trackerConfig
  });

  const resolvedPreset = await runtimeRouterPresetRegistry.resolvePreset(presetId, {
    now: input.now
  });

  return resolvedPreset as SymphonyRuntimeCurrentFlowRouting;
}

function assertTrackerContractForRuntimeRouterPreset(input: {
  presetId: SymphonyRuntimeRouterPresetId;
  trackerConfig: SymphonyTrackerConfig;
}): void {
  switch (input.presetId) {
    case "current-flow":
      assertCurrentFlowTrackerContract(input.trackerConfig);
      return;
  }
}

export function createRuntimeRouterPresetRegistry() {
  return runtimeRouterPresetRegistry;
}

function assertCurrentFlowTrackerContract(
  trackerConfig: SymphonyTrackerConfig
): void {
  assertTrackerStateValue(
    "claimTransitionToState",
    trackerConfig.claimTransitionToState,
    "Bootstrapping"
  );
  assertTrackerStateValue(
    "startupFailureTransitionToState",
    trackerConfig.startupFailureTransitionToState,
    "Failed"
  );
  assertTrackerStateValue(
    "pauseTransitionToState",
    trackerConfig.pauseTransitionToState,
    "Paused"
  );
  assertTrackerStateValue(
    "blockedTransitionToState",
    trackerConfig.blockedTransitionToState,
    "Blocked"
  );
  assertTrackerStateIncluded(
    "claimTransitionFromStates",
    trackerConfig.claimTransitionFromStates,
    "Todo"
  );
  assertTrackerStateIncluded(
    "claimTransitionFromStates",
    trackerConfig.claimTransitionFromStates,
    "Rework"
  );
  assertTrackerStateIncluded(
    "terminalStates",
    trackerConfig.terminalStates,
    "Done"
  );
  assertTrackerStateIncluded(
    "terminalStates",
    trackerConfig.terminalStates,
    "Canceled"
  );
}

function assertTrackerStateValue(
  fieldName: string,
  value: string | null,
  expected: string
): void {
  if (value === expected) {
    return;
  }

  throw new TypeError(
    `Current-flow routing requires tracker.${fieldName} to be ${JSON.stringify(expected)}. Received ${JSON.stringify(value)}.`
  );
}

function assertTrackerStateIncluded(
  fieldName: string,
  states: string[],
  expectedState: string
): void {
  if (states.includes(expectedState)) {
    return;
  }

  throw new TypeError(
    `Current-flow routing requires tracker.${fieldName} to include ${JSON.stringify(expectedState)}. Received ${JSON.stringify(states)}.`
  );
}
