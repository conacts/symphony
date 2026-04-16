import type {
  SymphonyAgentRuntimeCompletion,
  SymphonyAgentRuntimeUpdate
} from "@symphony/orchestrator";
import type { SymphonyRunMode } from "@symphony/runtime-contract";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import type { JsonObject } from "@symphony/contracts";
import type {
  SymphonyRuntimeWorkflowLifecycleView
} from "../runtime-workflow-lifecycle-view.js";

export type RunCallbacks = {
  onUpdate(issueId: string, update: SymphonyAgentRuntimeUpdate): void | Promise<void>;
  onComplete(
    issueId: string,
    completion: SymphonyAgentRuntimeCompletion
  ): void | Promise<void>;
};

export type ActiveRun = {
  stopped: boolean;
  client: import("@symphony/agent-harnesses").HarnessSessionClient | null;
  completionOverride: Extract<
    SymphonyAgentRuntimeCompletion,
    { kind: "delivered" | "awaiting_input" | "blocked" }
  > | null;
  completionReported: boolean;
};

export type WorkflowLifecycleReaders = {
  loadWorkflowLifecycleView(input: {
    issueIdentifier: string;
    runId?: string | null;
  }): Promise<SymphonyRuntimeWorkflowLifecycleView | null>;
  observeActiveWorkflowIssueState(input: {
    issueIdentifier: string;
    recordedAt: string;
  }): Promise<boolean>;
  isCapabilityManagedRun?(input: {
    issueIdentifier: string;
    runId?: string | null;
    runMode: SymphonyRunMode;
  }): Promise<boolean>;
};

export type RuntimeFailureClassification = {
  completion: SymphonyAgentRuntimeCompletion;
  level: "info" | "warn" | "error";
  eventType: string;
  message: string;
  payload: JsonObject;
};

export type WorkflowIssueStateObservationInput = {
  issue: SymphonyTrackerIssue;
  recordedAt: string;
  observeActiveWorkflowIssueState: WorkflowLifecycleReaders["observeActiveWorkflowIssueState"];
  loadWorkflowLifecycleView: WorkflowLifecycleReaders["loadWorkflowLifecycleView"];
};
