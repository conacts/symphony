import type { SymphonyOrchestratorSnapshot } from "@symphony/orchestrator";
import type { SymphonyRuntimeWorkflowReadPort } from "./runtime-app-types.js";

export type RuntimeWorkflowTrackerStatesByIssueIdentifier = ReadonlyMap<
  string,
  string
>;

export async function loadRunningWorkflowTrackerStates(input: {
  snapshot: SymphonyOrchestratorSnapshot;
  workflowRead: Pick<SymphonyRuntimeWorkflowReadPort, "loadWorkflowLifecycleView">;
}): Promise<Map<string, string>> {
  const issueIdentifiers = [
    ...new Set(input.snapshot.running.map((entry) => entry.issue.identifier))
  ];
  const workflowTrackerStatesByIssueIdentifier = new Map<string, string>();

  for (const issueIdentifier of issueIdentifiers) {
    const workflowLifecycle = await input.workflowRead.loadWorkflowLifecycleView({
      issueIdentifier
    });
    if (workflowLifecycle) {
      workflowTrackerStatesByIssueIdentifier.set(
        issueIdentifier,
        workflowLifecycle.trackerState
      );
    }
  }

  return workflowTrackerStatesByIssueIdentifier;
}

export function resolveRuntimeIssueTrackerState(input: {
  issueIdentifier: string;
  trackedState: string;
  workflowTrackerState: string | null;
  hasWorkflowBackedRuntimeEntry: boolean;
}): string {
  if (input.workflowTrackerState !== null || input.hasWorkflowBackedRuntimeEntry) {
    return requireWorkflowTrackerState({
      issueIdentifier: input.issueIdentifier,
      workflowTrackerState: input.workflowTrackerState
    });
  }

  const trackedState = input.trackedState.trim();
  if (trackedState === "") {
    throw new Error(
      `Runtime issue ${input.issueIdentifier} has an empty tracked tracker state.`
    );
  }

  return trackedState;
}

export function requireWorkflowTrackerState(input: {
  issueIdentifier: string;
  workflowTrackerState: string | null;
}): string {
  if (input.workflowTrackerState === null) {
    throw new Error(
      `Runtime issue ${input.issueIdentifier} is missing workflow-authoritative tracker state.`
    );
  }

  const workflowTrackerState = input.workflowTrackerState.trim();
  if (workflowTrackerState === "") {
    throw new Error(
      `Runtime issue ${input.issueIdentifier} has an empty workflow-authoritative tracker state.`
    );
  }

  return workflowTrackerState;
}
