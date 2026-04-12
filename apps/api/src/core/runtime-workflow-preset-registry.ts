import type { RouteWorkflowRecord } from "@symphony/db";
import {
  createWorkflowRouterPresetRegistry,
  type ResolvedWorkflowRouterPreset,
  type WorkflowNodeId,
  type WorkflowRouterOptions,
  type WorkflowRouter,
  type WorkflowRouterPreset,
  type WorkflowRouterPresetRegistry
} from "@symphony/router";
import type { SymphonyTrackerConfig } from "@symphony/tracker";
import type { SymphonyRuntimeWorkflowPresetAdapter } from "./runtime-workflow-preset-adapter.js";

declare const runtimeWorkflowPresetModuleBrand: unique symbol;
type MaybePromise<Value> = Value | Promise<Value>;

export type SymphonyStoredRouteWorkflowRouterBinding = Pick<
  RouteWorkflowRecord,
  "workflowId" | "routerPresetId" | "routerName" | "routerVersion"
>;

export type SymphonyRuntimeWorkflowPresetModule<
  PresetId extends string,
  Node extends WorkflowNodeId,
  Data,
  Policy,
> = {
  presetId: PresetId;
  preset: WorkflowRouterPreset<Node, Data, Policy>;
  runtimeAdapter: SymphonyRuntimeWorkflowPresetAdapter;
  requiredNonRunningTrackerObservationStates: readonly string[];
  assertTrackerContract(input: {
    trackerConfig: SymphonyTrackerConfig;
  }): void;
  readonly [runtimeWorkflowPresetModuleBrand]?: {
    node: Node;
    data: Data;
    policy: Policy;
  };
};

type RuntimeWorkflowRouterPresetLike = {
  createRouter(input?: WorkflowRouterOptions): MaybePromise<unknown>;
  createPolicy(): unknown;
};

type RuntimeWorkflowPresetModuleLike = {
  presetId: string;
  preset: RuntimeWorkflowRouterPresetLike;
  runtimeAdapter: SymphonyRuntimeWorkflowPresetAdapter;
  requiredNonRunningTrackerObservationStates: readonly string[];
  assertTrackerContract(input: {
    trackerConfig: SymphonyTrackerConfig;
  }): void;
  readonly [runtimeWorkflowPresetModuleBrand]?: unknown;
};

type RuntimeWorkflowPresetModules = Record<string, RuntimeWorkflowPresetModuleLike>;

type RuntimeWorkflowPresetMetadata<
  Module extends {
    readonly [runtimeWorkflowPresetModuleBrand]?: unknown;
  },
> = Module extends {
  readonly [runtimeWorkflowPresetModuleBrand]?: infer Metadata;
}
  ? NonNullable<Metadata>
  : never;

type RuntimeWorkflowPresetModuleNode<
  Module extends {
    readonly [runtimeWorkflowPresetModuleBrand]?: unknown;
  },
> = RuntimeWorkflowPresetMetadata<Module> extends {
  node: infer Node;
}
  ? Node extends WorkflowNodeId
    ? Node
    : never
  : never;

type RuntimeWorkflowPresetModuleData<
  Module extends {
    readonly [runtimeWorkflowPresetModuleBrand]?: unknown;
  },
> = RuntimeWorkflowPresetMetadata<Module> extends {
  data: infer Data;
}
  ? Data
  : never;

type RuntimeWorkflowPresetModulePolicy<
  Module extends {
    readonly [runtimeWorkflowPresetModuleBrand]?: unknown;
  },
> = RuntimeWorkflowPresetMetadata<Module> extends {
  policy: infer Policy;
}
  ? Policy
  : never;

type RuntimeWorkflowPresetModulePresets<
  Modules extends RuntimeWorkflowPresetModules,
> = {
  [PresetId in keyof Modules & string]: Modules[PresetId]["preset"];
};

export type SymphonyResolvedRuntimeWorkflowPreset<
  Modules extends RuntimeWorkflowPresetModules,
  PresetId extends keyof Modules & string,
> = ResolvedWorkflowRouterPreset<
  PresetId,
  RuntimeWorkflowPresetModuleNode<Modules[PresetId]>,
  RuntimeWorkflowPresetModuleData<Modules[PresetId]>,
  RuntimeWorkflowPresetModulePolicy<Modules[PresetId]>
> & {
  module: Modules[PresetId];
};

export type SymphonyRuntimeWorkflowPresetSelection<
  Modules extends RuntimeWorkflowPresetModules,
> = {
  [PresetId in keyof Modules & string]: SymphonyResolvedRuntimeWorkflowPreset<
    Modules,
    PresetId
  >;
}[keyof Modules & string];

export class SymphonyRuntimeWorkflowPresetRegistry<
  Modules extends RuntimeWorkflowPresetModules,
  DefaultPresetId extends keyof Modules & string,
> {
  readonly #defaultPresetId: DefaultPresetId;
  readonly #modules: Modules;
  readonly #presetRegistry: WorkflowRouterPresetRegistry<
    RuntimeWorkflowPresetModulePresets<Modules>
  >;

  constructor(input: { defaultPresetId: DefaultPresetId; modules: Modules }) {
    const moduleEntries = Object.entries(input.modules);
    if (moduleEntries.length === 0) {
      throw new TypeError(
        "Runtime workflow preset registry requires at least one module."
      );
    }

    for (const [registeredPresetId, module] of moduleEntries) {
      const normalizedPresetId = registeredPresetId.trim();
      if (normalizedPresetId.length === 0) {
        throw new TypeError("Runtime workflow preset registration key is required.");
      }

      if (!module) {
        throw new TypeError(
          `Runtime workflow preset module ${JSON.stringify(normalizedPresetId)} is required.`
        );
      }

      if (module.presetId !== normalizedPresetId) {
        throw new TypeError(
          `Runtime workflow preset module ${JSON.stringify(module.presetId)} does not match registered preset id ${JSON.stringify(normalizedPresetId)}.`
        );
      }
    }

    if (!Object.hasOwn(input.modules, input.defaultPresetId)) {
      throw new TypeError(
        `Runtime workflow preset default ${JSON.stringify(input.defaultPresetId)} is not registered.`
      );
    }

    this.#defaultPresetId = input.defaultPresetId;
    this.#modules = input.modules;
    this.#presetRegistry = createWorkflowRouterPresetRegistry(
      buildRuntimeWorkflowPresetRecord(input.modules)
    );
  }

  getDefaultPresetId(): DefaultPresetId {
    return this.#defaultPresetId;
  }

  listPresetIds(): Array<keyof Modules & string> {
    return this.#presetRegistry.listPresetIds();
  }

  hasPresetId(presetId: string): presetId is keyof Modules & string {
    return this.#presetRegistry.hasPresetId(presetId);
  }

  requirePresetId(presetId: string): asserts presetId is keyof Modules & string {
    this.#presetRegistry.requirePresetId(presetId);
  }

  getModule<PresetId extends keyof Modules & string>(
    presetId: PresetId
  ): Modules[PresetId] {
    return this.#modules[presetId];
  }

  async resolvePreset<PresetId extends keyof Modules & string>(input: {
    presetId: PresetId;
    trackerConfig: SymphonyTrackerConfig;
    now?: () => Date;
  }): Promise<SymphonyResolvedRuntimeWorkflowPreset<Modules, PresetId>> {
    const module = this.#modules[input.presetId];
    module.assertTrackerContract({
      trackerConfig: input.trackerConfig
    });

    const resolvedPreset = await this.#presetRegistry.resolvePreset(input.presetId, {
      now: input.now
    });

    return {
      ...resolvedPreset,
      module
    } as SymphonyResolvedRuntimeWorkflowPreset<Modules, PresetId>;
  }

  async selectPreset(input: {
    trackerConfig: SymphonyTrackerConfig;
    presetId?: string;
    now?: () => Date;
  }): Promise<SymphonyRuntimeWorkflowPresetSelection<Modules>> {
    const presetId = input.presetId ?? this.#defaultPresetId;
    this.requirePresetId(presetId);

    return await this.resolvePreset({
      presetId,
      trackerConfig: input.trackerConfig,
      now: input.now
    });
  }

  async resolveStoredWorkflow(input: {
    trackerConfig: SymphonyTrackerConfig;
    workflow: SymphonyStoredRouteWorkflowRouterBinding;
    now?: () => Date;
  }): Promise<SymphonyRuntimeWorkflowPresetSelection<Modules>> {
    const routing = await this.selectPreset({
      trackerConfig: input.trackerConfig,
      presetId: input.workflow.routerPresetId,
      now: input.now
    });

    assertStoredRuntimeRouterDefinition({
      workflow: input.workflow,
      router: routing.router
    });

    return routing;
  }
}

export function createSymphonyRuntimeWorkflowPresetRegistry<
  const Modules extends RuntimeWorkflowPresetModules,
  const DefaultPresetId extends keyof Modules & string,
>(input: {
  defaultPresetId: DefaultPresetId;
  modules: Modules;
}): SymphonyRuntimeWorkflowPresetRegistry<Modules, DefaultPresetId> {
  return new SymphonyRuntimeWorkflowPresetRegistry(input);
}

function buildRuntimeWorkflowPresetRecord<
  Modules extends RuntimeWorkflowPresetModules,
>(
  modules: Modules
): RuntimeWorkflowPresetModulePresets<Modules> {
  return Object.fromEntries(
    Object.entries(modules).map(([presetId, module]) => [presetId, module.preset])
  ) as RuntimeWorkflowPresetModulePresets<Modules>;
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
