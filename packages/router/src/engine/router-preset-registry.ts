import type { WorkflowRouterOptions, WorkflowRouter } from "./workflow-router.js";
import type { WorkflowNodeId } from "../types/base.js";

type MaybePromise<Value> = Value | Promise<Value>;
declare const workflowRouterPresetBrand: unique symbol;

export type WorkflowRouterPreset<
  Node extends WorkflowNodeId,
  Data,
  Policy,
> = {
  createRouter(
    input?: WorkflowRouterOptions
  ): MaybePromise<WorkflowRouter<Node, Data, Policy>>;
  createPolicy(): Policy;
  readonly [workflowRouterPresetBrand]?: {
    node: Node;
    data: Data;
    policy: Policy;
  };
};

type WorkflowRouterPresetLike = {
  createRouter(input?: WorkflowRouterOptions): MaybePromise<unknown>;
  createPolicy(): unknown;
};

type WorkflowRouterPresetMetadata<Preset extends WorkflowRouterPresetLike> =
  Preset extends {
    readonly [workflowRouterPresetBrand]?: infer Metadata;
  }
    ? NonNullable<Metadata>
    : never;

type WorkflowRouterPresetNode<Preset extends WorkflowRouterPresetLike> =
  WorkflowRouterPresetMetadata<Preset> extends {
    node: infer Node;
  }
    ? Node extends WorkflowNodeId
      ? Node
      : never
    : never;

type WorkflowRouterPresetData<Preset extends WorkflowRouterPresetLike> =
  WorkflowRouterPresetMetadata<Preset> extends {
    data: infer Data;
  }
    ? Data
    : never;

type WorkflowRouterPresetPolicy<Preset extends WorkflowRouterPresetLike> =
  WorkflowRouterPresetMetadata<Preset> extends {
    policy: infer Policy;
  }
    ? Policy
    : never;

export type ResolvedWorkflowRouterPreset<
  PresetId extends string,
  Node extends WorkflowNodeId,
  Data,
  Policy,
> = {
  presetId: PresetId;
  router: WorkflowRouter<Node, Data, Policy>;
  policy: Policy;
};

export class WorkflowRouterPresetRegistry<
  Presets extends Record<string, WorkflowRouterPresetLike>,
> {
  readonly #presets: Presets;

  constructor(presets: Presets) {
    const presetEntries = Object.entries(presets);
    if (presetEntries.length === 0) {
      throw new TypeError("Workflow router preset registry requires at least one preset.");
    }

    for (const [presetId, preset] of presetEntries) {
      const normalizedPresetId = presetId.trim();
      if (normalizedPresetId.length === 0) {
        throw new TypeError("Workflow router preset id is required.");
      }

      if (!preset) {
        throw new TypeError(
          `Workflow router preset ${JSON.stringify(normalizedPresetId)} is required.`
        );
      }
    }

    this.#presets = presets;
  }

  listPresetIds(): Array<keyof Presets & string> {
    return Object.keys(this.#presets) as Array<keyof Presets & string>;
  }

  hasPresetId(presetId: string): presetId is keyof Presets & string {
    return Object.hasOwn(this.#presets, presetId);
  }

  requirePresetId(presetId: string): asserts presetId is keyof Presets & string {
    if (this.hasPresetId(presetId)) {
      return;
    }

    throw new TypeError(
      `Unknown workflow router preset ${JSON.stringify(presetId)}. Expected one of ${this.listPresetIds()
        .map((registeredPresetId) => JSON.stringify(registeredPresetId))
        .join(", ")}.`
    );
  }

  async resolvePreset<
    PresetId extends keyof Presets & string,
  >(
    presetId: PresetId,
    input: WorkflowRouterOptions = {}
  ): Promise<
    ResolvedWorkflowRouterPreset<
      PresetId,
      WorkflowRouterPresetNode<Presets[PresetId]>,
      WorkflowRouterPresetData<Presets[PresetId]>,
      WorkflowRouterPresetPolicy<Presets[PresetId]>
    >
  > {
    this.requirePresetId(presetId);

    const preset = this.#presets[presetId];
    const router = await preset.createRouter(input);
    const policy = preset.createPolicy();

    return {
      presetId,
      router: router as unknown as WorkflowRouter<
        WorkflowRouterPresetNode<Presets[PresetId]>,
        WorkflowRouterPresetData<Presets[PresetId]>,
        WorkflowRouterPresetPolicy<Presets[PresetId]>
      >,
      policy: policy as WorkflowRouterPresetPolicy<Presets[PresetId]>
    };
  }
}

export function createWorkflowRouterPresetRegistry<
  const Presets extends Record<string, WorkflowRouterPresetLike>,
>(presets: Presets): WorkflowRouterPresetRegistry<Presets> {
  return new WorkflowRouterPresetRegistry(presets);
}
