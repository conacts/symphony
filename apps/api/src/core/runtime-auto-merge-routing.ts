import {
  createSymphonyAutoMergeFlowRouterPreset,
  type SymphonyAutoMergeFlowData,
  type SymphonyAutoMergeFlowNode,
  type SymphonyAutoMergeFlowPolicy,
  type WorkflowRouter
} from "@symphony/router";
import {
  createRuntimeCurrentFlowPresetModule
} from "./runtime-current-flow-routing.js";

export type SymphonyRuntimeAutoMergeFlowRouter = WorkflowRouter<
  SymphonyAutoMergeFlowNode,
  SymphonyAutoMergeFlowData,
  SymphonyAutoMergeFlowPolicy
>;

export const runtimeAutoMergeRuntimeRouterPresetModule =
  createRuntimeCurrentFlowPresetModule({
    presetId: "auto-merge",
    preset: createSymphonyAutoMergeFlowRouterPreset()
  });
