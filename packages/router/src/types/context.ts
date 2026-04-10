import type { WorkflowNodeId } from "./base.js";
import type { WorkflowProjection } from "./projection.js";
import type { WorkflowSignal } from "./signal.js";

export type WorkflowEvaluationContext<
  Node extends WorkflowNodeId,
  Data,
  Policy,
> = {
  projection: WorkflowProjection<Node, Data>;
  signal: WorkflowSignal;
  policy: Policy;
};

export type WorkflowTransitionContext<
  Node extends WorkflowNodeId,
  Data,
  Policy,
> = WorkflowEvaluationContext<Node, Data, Policy> & {
  fromNode: Node | null;
  toNode: Node | null;
  edgeId: string | null;
};

