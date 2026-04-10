import type { WorkflowCommand } from "./command.js";
import type {
  WorkflowNodeId,
  WorkflowTraceEntry
} from "./base.js";

export type WorkflowDecision<Node extends WorkflowNodeId = WorkflowNodeId> = {
  id: string;
  fromNode: Node | null;
  toNode: Node | null;
  edgeId: string | null;
  reasonCode: string;
  commands: WorkflowCommand[];
  trace: WorkflowTraceEntry[];
  selectionMetadata?: Record<string, unknown> | null;
};

