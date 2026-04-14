import type { SymphonyAgentRuntimeCompletion } from "@symphony/orchestrator";
import type { SymphonyRunMode } from "@symphony/runtime-contract";
import type { WorkflowCommand, WorkflowSignal } from "@symphony/router";

export type SymphonyRuntimeTrackerStateObservedSignalInput = {
  id: string;
  occurredAt: string;
  trackerState: string;
  runId: string | null;
  runMode: SymphonyRunMode | null;
  causationId: string | null;
  correlationId: string | null;
};

export type SymphonyRuntimeRunStartedSignalInput = {
  id: string;
  occurredAt: string;
  runId: string | null;
  runMode: SymphonyRunMode;
  causationId: string | null;
  correlationId: string | null;
};

export type SymphonyRuntimeCompletionSignalInput = {
  id: string;
  occurredAt: string;
  runId: string | null;
  runMode: SymphonyRunMode;
  completion: SymphonyAgentRuntimeCompletion;
  causationId: string | null;
  correlationId: string | null;
};

export type SymphonyRuntimeDeliveryReportedSignalInput = {
  id: string;
  occurredAt: string;
  runId: string;
  status: string;
  causationId: string | null;
  correlationId: string | null;
};

export type SymphonyRuntimeStateRequestedSignalInput = {
  id: string;
  occurredAt: string;
  runId: string;
  requestKind: string;
  targetState: string;
  causationId: string | null;
  correlationId: string | null;
};

export type SymphonyRuntimeShutdownRequestedSignalInput = {
  id: string;
  occurredAt: string;
  runId: string;
  runMode: SymphonyRunMode;
  reason: string;
  causationId: string | null;
  correlationId: string | null;
};

export type SymphonyRuntimeWorkflowPresetAdapter = {
  createTrackerStateObservedSignal(
    input: SymphonyRuntimeTrackerStateObservedSignalInput
  ): WorkflowSignal;
  createRunStartedSignal(
    input: SymphonyRuntimeRunStartedSignalInput
  ): WorkflowSignal;
  createRuntimeCompletionSignal(
    input: SymphonyRuntimeCompletionSignalInput
  ): WorkflowSignal;
  createDeliveryReportedSignal(
    input: SymphonyRuntimeDeliveryReportedSignalInput
  ): WorkflowSignal;
  createStateRequestedSignal(
    input: SymphonyRuntimeStateRequestedSignalInput
  ): WorkflowSignal;
  createShutdownRequestedSignal(
    input: SymphonyRuntimeShutdownRequestedSignalInput
  ): WorkflowSignal;
  readTrackerStateFromProjection(input: {
    workflowId: string;
    data: unknown;
  }): string | null;
  shouldObserveUnchangedIdleTrackerState(input: {
    workflowId: string;
    currentNode: string;
    data: unknown;
    trackerState: string;
  }): boolean;
  readLastDispatchModeFromProjection(input: {
    workflowId: string;
    data: unknown;
  }): SymphonyRunMode | null;
  readActiveRunModeFromProjection(input: {
    workflowId: string;
    data: unknown;
  }): SymphonyRunMode;
  readTrackerTransitionState(command: WorkflowCommand): string;
  readDispatchRunMode(command: WorkflowCommand): SymphonyRunMode;
};
