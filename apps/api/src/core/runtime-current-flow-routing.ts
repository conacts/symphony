import {
  createSymphonyCurrentFlowRouterPreset,
  createWorkflowRouterPresetRegistry,
  type ResolvedWorkflowRouterPreset,
  type SymphonyCurrentFlowData,
  type SymphonyCurrentFlowNode,
  type SymphonyCurrentFlowPolicy,
  type WorkflowNodeId,
  type WorkflowRouter,
  type WorkflowRouterPreset
} from "@symphony/router";
import type { RouteWorkflowRecord } from "@symphony/db";
import type { SymphonyTrackerConfig } from "@symphony/tracker";

declare const runtimeRouterPresetModuleBrand: unique symbol;

export type SymphonyRuntimeCurrentFlowRouter = WorkflowRouter<
  SymphonyCurrentFlowNode,
  SymphonyCurrentFlowData,
  SymphonyCurrentFlowPolicy
>;

export type SymphonyRuntimeRouterPresetModule<
  PresetId extends string,
  Node extends WorkflowNodeId,
  Data,
  Policy,
> = {
  presetId: PresetId;
  preset: WorkflowRouterPreset<Node, Data, Policy>;
  assertTrackerContract(input: {
    trackerConfig: SymphonyTrackerConfig;
  }): void;
  readonly [runtimeRouterPresetModuleBrand]?: {
    node: Node;
    data: Data;
    policy: Policy;
  };
};

const currentFlowRuntimeRouterPresetModule =
  createCurrentFlowRuntimeRouterPresetModule();

const runtimeRouterPresetModules = {
  "current-flow": currentFlowRuntimeRouterPresetModule
} as const;

const runtimeRouterPresets = {
  "current-flow": currentFlowRuntimeRouterPresetModule.preset
} as const;

export const runtimeRouterPresetRegistry =
  createWorkflowRouterPresetRegistry(runtimeRouterPresets);

export type SymphonyRuntimeRouterPresetId = keyof typeof runtimeRouterPresets;

type RuntimeRouterPresetModuleById<PresetId extends SymphonyRuntimeRouterPresetId> =
  (typeof runtimeRouterPresetModules)[PresetId];

type RuntimeRouterPresetModuleNode<
  Module extends {
    readonly [runtimeRouterPresetModuleBrand]?: unknown;
  },
> = RuntimeRouterPresetModuleMetadata<Module> extends {
  node: infer Node;
}
  ? Node extends WorkflowNodeId
    ? Node
    : never
  : never;

type RuntimeRouterPresetModuleData<
  Module extends {
    readonly [runtimeRouterPresetModuleBrand]?: unknown;
  },
> = RuntimeRouterPresetModuleMetadata<Module> extends {
  data: infer Data;
}
  ? Data
  : never;

type RuntimeRouterPresetModulePolicy<
  Module extends {
    readonly [runtimeRouterPresetModuleBrand]?: unknown;
  },
> = RuntimeRouterPresetModuleMetadata<Module> extends {
  policy: infer Policy;
}
  ? Policy
  : never;

type RuntimeRouterPresetModuleMetadata<
  Module extends {
    readonly [runtimeRouterPresetModuleBrand]?: unknown;
  },
> = Module extends {
  readonly [runtimeRouterPresetModuleBrand]?: infer Metadata;
}
  ? NonNullable<Metadata>
  : never;

export type SymphonyResolvedRuntimeRouterPreset<
  PresetId extends SymphonyRuntimeRouterPresetId,
> = ResolvedWorkflowRouterPreset<
  PresetId,
  RuntimeRouterPresetModuleNode<RuntimeRouterPresetModuleById<PresetId>>,
  RuntimeRouterPresetModuleData<RuntimeRouterPresetModuleById<PresetId>>,
  RuntimeRouterPresetModulePolicy<RuntimeRouterPresetModuleById<PresetId>>
> & {
  module: RuntimeRouterPresetModuleById<PresetId>;
};

export type SymphonyRuntimeRouterPresetSelection = {
  [PresetId in SymphonyRuntimeRouterPresetId]: SymphonyResolvedRuntimeRouterPreset<PresetId>;
}[SymphonyRuntimeRouterPresetId];

export type SymphonyRuntimeCurrentFlowRouting =
  SymphonyResolvedRuntimeRouterPreset<"current-flow">;

export type SymphonyStoredRouteWorkflowRouterBinding = Pick<
  RouteWorkflowRecord,
  "workflowId" | "routerPresetId" | "routerName" | "routerVersion"
>;

export async function createRuntimeCurrentFlowRouting(input: {
  trackerConfig: SymphonyTrackerConfig;
  now?: () => Date;
}): Promise<SymphonyRuntimeCurrentFlowRouting> {
  return await resolveRuntimeRouterPreset({
    presetId: "current-flow",
    trackerConfig: input.trackerConfig,
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
}): Promise<SymphonyRuntimeRouterPresetSelection> {
  const requestedPresetId = input.presetId ?? "current-flow";

  if (!runtimeRouterPresetRegistry.hasPresetId(requestedPresetId)) {
    throw new TypeError(
      `Unknown workflow router preset ${JSON.stringify(requestedPresetId)}. Expected one of ${listRuntimeRouterPresetIds()
        .map((presetId) => JSON.stringify(presetId))
        .join(", ")}.`
    );
  }

  return await resolveRuntimeRouterPreset({
    presetId: requestedPresetId,
    trackerConfig: input.trackerConfig,
    now: input.now
  });
}

export async function resolveStoredRuntimeCurrentFlowRouting(input: {
  trackerConfig: SymphonyTrackerConfig;
  workflow: SymphonyStoredRouteWorkflowRouterBinding;
  now?: () => Date;
}): Promise<SymphonyRuntimeCurrentFlowRouting> {
  const routing = await selectRuntimeRouterPreset({
    trackerConfig: input.trackerConfig,
    presetId: input.workflow.routerPresetId,
    now: input.now
  });

  if (routing.presetId !== "current-flow") {
    throw new TypeError(
      `Route workflow ${input.workflow.workflowId} is bound to router preset ${input.workflow.routerPresetId}, but the current-flow runtime only supports "current-flow".`
    );
  }

  assertStoredRuntimeRouterDefinition({
    workflow: input.workflow,
    router: routing.router
  });

  return routing;
}

async function resolveRuntimeRouterPreset<
  PresetId extends SymphonyRuntimeRouterPresetId,
>(input: {
  presetId: PresetId;
  trackerConfig: SymphonyTrackerConfig;
  now?: () => Date;
}): Promise<SymphonyResolvedRuntimeRouterPreset<PresetId>> {
  const module = runtimeRouterPresetModules[input.presetId];
  module.assertTrackerContract({
    trackerConfig: input.trackerConfig
  });

  const resolvedPreset = await runtimeRouterPresetRegistry.resolvePreset(input.presetId, {
    now: input.now
  });

  return {
    ...resolvedPreset,
    module
  } as SymphonyResolvedRuntimeRouterPreset<PresetId>;
}

export function createRuntimeRouterPresetRegistry() {
  return runtimeRouterPresetRegistry;
}

export function getRuntimeRouterPresetModule<
  PresetId extends SymphonyRuntimeRouterPresetId,
>(presetId: PresetId): RuntimeRouterPresetModuleById<PresetId> {
  return runtimeRouterPresetModules[presetId];
}

function createCurrentFlowRuntimeRouterPresetModule(): SymphonyRuntimeRouterPresetModule<
  "current-flow",
  SymphonyCurrentFlowNode,
  SymphonyCurrentFlowData,
  SymphonyCurrentFlowPolicy
> {
  return {
    presetId: "current-flow",
    preset: createSymphonyCurrentFlowRouterPreset(),
    assertTrackerContract(input) {
      assertCurrentFlowTrackerContract(input.trackerConfig);
    }
  };
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

function assertStoredRuntimeRouterDefinition<
  Node extends WorkflowNodeId,
  Data,
  Policy,
>(input: {
  workflow: SymphonyStoredRouteWorkflowRouterBinding;
  router: WorkflowRouter<Node, Data, Policy>;
}): void {
  const definition = input.router.definition();

  if (input.workflow.routerName !== definition.name) {
    throw new TypeError(
      `Route workflow ${input.workflow.workflowId} is bound to router ${input.workflow.routerName}, but ${definition.name} was resolved from preset ${input.workflow.routerPresetId}.`
    );
  }

  if (input.workflow.routerVersion !== definition.version) {
    throw new TypeError(
      `Route workflow ${input.workflow.workflowId} is bound to router version ${input.workflow.routerVersion}, but ${definition.version} was resolved from preset ${input.workflow.routerPresetId}.`
    );
  }
}
