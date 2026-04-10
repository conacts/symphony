import type { WorkflowNodeId, WorkflowPayload } from "./base.js";
import type { WorkflowCommand } from "./command.js";
import type { WorkflowDecision } from "./decision.js";
import type { WorkflowSignal } from "./signal.js";

export type WorkflowJournalEvent<Node extends WorkflowNodeId = WorkflowNodeId> =
  | {
      kind: "signal_recorded";
      signal: WorkflowSignal;
      recordedAt: string;
    }
  | {
      kind: "decision_recorded";
      decision: WorkflowDecision<Node>;
      recordedAt: string;
    }
  | {
      kind: "command_emitted";
      decisionId: string;
      command: WorkflowCommand;
      recordedAt: string;
    }
  | {
      kind: "command_settled";
      commandId: string;
      status: "succeeded" | "failed";
      payload: WorkflowPayload;
      recordedAt: string;
    };

export type WorkflowHistory<Node extends WorkflowNodeId = WorkflowNodeId> =
  ReadonlyArray<WorkflowJournalEvent<Node>>;
