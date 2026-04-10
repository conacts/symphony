import type { WorkflowCommand } from "./command.js";
import type { WorkflowDecision } from "./decision.js";
import type { WorkflowJournalEvent } from "./journal.js";
import type { WorkflowNodeId } from "./base.js";
import type { WorkflowSignal } from "./signal.js";

export type WorkflowProjection<Node extends WorkflowNodeId, Data> = {
  workflowId: string;
  currentNode: Node | null;
  pendingCommands: WorkflowCommand[];
  terminal: boolean;
  sequence: number;
  data: Data;
  lastSignal: WorkflowSignal | null;
  lastDecision: WorkflowDecision<Node> | null;
};

export type WorkflowRouteResult<Node extends WorkflowNodeId, Data> = {
  projectionBefore: WorkflowProjection<Node, Data>;
  signalEvent: Extract<WorkflowJournalEvent<Node>, { kind: "signal_recorded" }>;
  decision: WorkflowDecision<Node>;
  events: WorkflowJournalEvent<Node>[];
  projectionAfter: WorkflowProjection<Node, Data>;
};
