export type SymphonyTrackerConfig = {
  kind: "linear" | "memory";
  endpoint: string;
  apiKey: string | null;
  projectSlug: string | null;
  teamKey: string | null;
  excludedProjectIds: string[];
  assignee: string | null;
  dispatchableStates: string[];
  terminalStates: string[];
  claimTransitionToState: string | null;
  claimTransitionFromStates: string[];
  startupFailureTransitionToState: string | null;
};

export type SymphonyWorkflowTrackerConfig = SymphonyTrackerConfig;

export function normalizeIssueState(stateName: string | null | undefined): string {
  return typeof stateName === "string" ? stateName.trim().toLowerCase() : "";
}
