import type { SymphonyTrackerConfig } from "./tracker-config.js";

export function buildSymphonyTrackerConfig(
  overrides: Partial<SymphonyTrackerConfig> = {}
): SymphonyTrackerConfig {
  return {
    kind: "linear",
    endpoint: "https://api.linear.app/graphql",
    apiKey: "token",
    teamKey: "COL",
    excludedProjectIds: [],
    assignee: null,
    dispatchableStates: ["Todo", "Bootstrapping", "In Progress", "Rework", "Approved"],
    terminalStates: ["Canceled", "Done"],
    claimTransitionToState: "Bootstrapping",
    claimTransitionFromStates: ["Todo", "Rework"],
    startupFailureTransitionToState: "Failed",
    pauseTransitionToState: "Paused",
    blockedTransitionToState: "Blocked",
    ...overrides
  };
}
