import type { WorkflowNodeId } from "./base.js";
import type { WorkflowHistory } from "./journal.js";
import type {
  WorkflowProjection,
  WorkflowRouteResult
} from "./projection.js";
import type { WorkflowSignal } from "./signal.js";

export type WorkflowSimulationStep<
  Node extends WorkflowNodeId,
  Data,
> = {
  signal: WorkflowSignal;
  result: WorkflowRouteResult<Node, Data>;
};

export type WorkflowSimulationResult<
  Node extends WorkflowNodeId,
  Data,
> = {
  history: WorkflowHistory<Node>;
  projection: WorkflowProjection<Node, Data>;
  steps: ReadonlyArray<WorkflowSimulationStep<Node, Data>>;
};
