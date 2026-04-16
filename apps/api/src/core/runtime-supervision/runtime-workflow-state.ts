import type { SymphonyAgentRuntimeConfig } from "@symphony/orchestrator";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import type {
  WorkflowIssueStateObservationInput,
  WorkflowLifecycleReaders
} from "./runtime-supervision-types.js";

export async function observeActiveIssueStateThroughWorkflow(
  input: WorkflowIssueStateObservationInput
): Promise<SymphonyTrackerIssue> {
  const observed = await input.observeActiveWorkflowIssueState({
    issueIdentifier: input.issue.identifier,
    recordedAt: input.recordedAt
  });
  if (!observed) {
    throw new TypeError(
      `Workflow-backed active issue observation could not be recorded for ${input.issue.identifier}.`
    );
  }

  return {
    ...input.issue,
    state: await loadRequiredWorkflowTrackerState({
      issueIdentifier: input.issue.identifier,
      loadWorkflowLifecycleView: input.loadWorkflowLifecycleView,
      failureContext: `while observing active issue ${input.issue.identifier}`
    })
  };
}

export async function loadRequiredWorkflowTrackerState(input: {
  issueIdentifier: string;
  runId?: string | null;
  loadWorkflowLifecycleView: WorkflowLifecycleReaders["loadWorkflowLifecycleView"];
  failureContext: string;
}): Promise<string> {
  const workflowLifecycle = await input.loadWorkflowLifecycleView({
    issueIdentifier: input.issueIdentifier,
    runId: input.runId ?? null
  });
  const workflowState = workflowLifecycle?.trackerState ?? null;
  if (workflowState === null) {
    throw new TypeError(
      `Workflow history is missing the current tracker state for ${input.issueIdentifier} ${input.failureContext}.`
    );
  }

  return workflowState;
}

export function isActiveIssueState(
  runtimePolicy: SymphonyAgentRuntimeConfig,
  state: string
): boolean {
  const normalizedState = state.trim().toLowerCase();

  return runtimePolicy.tracker.dispatchableStates.some(
    (activeState) => activeState.trim().toLowerCase() === normalizedState
  );
}
