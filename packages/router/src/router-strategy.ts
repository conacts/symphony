import { Effect } from "effect";
import type { WorkflowEdge } from "./router-edge.js";
import type {
  WorkflowEvaluationContext,
  WorkflowProjection
} from "./types/index.js";
import type { WorkflowNodeId } from "./types/base.js";
import type {
  AmbiguousTransitionError,
  WorkflowRouterError
} from "./router-errors.js";

export type WorkflowCandidateEdge<
  Node extends WorkflowNodeId,
  Data,
  Policy,
> = {
  edge: WorkflowEdge<Node, Data, Policy>;
  projection: WorkflowProjection<Node, Data>;
  signal: WorkflowEvaluationContext<Node, Data, Policy>["signal"];
  policy: Policy;
};

export type WorkflowRouteSelection = {
  edgeId: string | null;
  reasonCode?: string;
  metadata?: Record<string, unknown> | null;
};

export interface RouterStrategy<
  Node extends WorkflowNodeId,
  Data,
  Policy,
> {
  readonly kind: string;
  select(input: {
    candidates: WorkflowCandidateEdge<Node, Data, Policy>[];
    projection: WorkflowProjection<Node, Data>;
    signal: WorkflowEvaluationContext<Node, Data, Policy>["signal"];
    policy: Policy;
  }): Effect.Effect<
    WorkflowRouteSelection,
    WorkflowRouterError | AmbiguousTransitionError,
    never
  >;
}
