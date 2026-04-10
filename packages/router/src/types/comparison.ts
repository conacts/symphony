import type { WorkflowNodeId } from "./base.js";
import type { WorkflowHistory } from "./journal.js";
import type { WorkflowSignal } from "./signal.js";
import type { WorkflowSimulationResult } from "./simulation.js";
import type { WorkflowRouter } from "../workflow-router.js";

export type WorkflowRouterCandidate<
  Node extends WorkflowNodeId,
  Data,
  Policy,
> = {
  id: string;
  router: WorkflowRouter<Node, Data, Policy>;
  policy: Policy;
  history?: WorkflowHistory<Node>;
};

export type WorkflowRouterComparisonEntry<
  Node extends WorkflowNodeId,
  Data,
> = {
  candidateId: string;
  simulation: WorkflowSimulationResult<Node, Data>;
};

export type WorkflowRouterComparisonSummary<
  Node extends WorkflowNodeId,
> = {
  diverged: boolean;
  finalNodeByCandidate: Record<string, Node | null>;
  reasonCodesByCandidate: Record<string, string[]>;
  pendingCommandCountsByCandidate: Record<string, number>;
};

export type WorkflowRouterComparisonResult<
  Node extends WorkflowNodeId,
  Data,
> = {
  workflowId: string;
  signals: ReadonlyArray<WorkflowSignal>;
  entries: ReadonlyArray<WorkflowRouterComparisonEntry<Node, Data>>;
  summary: WorkflowRouterComparisonSummary<Node>;
};
