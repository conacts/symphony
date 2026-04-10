export type WorkflowNodeId = string;

export type WorkflowSignalSource =
  | "tracker"
  | "runtime"
  | "review"
  | "ci"
  | "operator"
  | "router";

export type WorkflowPayload = Record<string, unknown> | null;

export type WorkflowTraceEntryKind =
  | "signal_received"
  | "candidate_edge"
  | "guard_passed"
  | "guard_failed"
  | "strategy_selected"
  | "no_match";

export type WorkflowTraceEntry = {
  kind: WorkflowTraceEntryKind;
  ref: string;
  detail?: Record<string, unknown> | null;
};

