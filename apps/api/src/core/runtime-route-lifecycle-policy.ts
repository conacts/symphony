import type { SymphonyTrackerConfig } from "@symphony/tracker";
import { normalizeIssueState } from "@symphony/tracker";

export type SymphonyNonRunningTrackerIngressPolicy = {
  dispatchableSeedStates: string[];
  presetRequiredSeedStates: string[];
  seedStates: string[];
  observableStates: string[];
};

export function buildNonRunningTrackerIngressPolicy(input: {
  trackerConfig: SymphonyTrackerConfig;
  presetRequiredSeedStates: readonly string[];
}): SymphonyNonRunningTrackerIngressPolicy {
  const dispatchableSeedStates = mergeTrackerStates(
    input.trackerConfig.dispatchableStates
  );
  const presetRequiredSeedStates = mergeTrackerStates(
    input.presetRequiredSeedStates
  );
  const seedStates = mergeTrackerStates([
    ...dispatchableSeedStates,
    ...presetRequiredSeedStates
  ]);
  const observableStates = mergeTrackerStates([
    ...seedStates,
    ...input.trackerConfig.terminalStates,
    input.trackerConfig.pauseTransitionToState,
    input.trackerConfig.blockedTransitionToState,
    input.trackerConfig.startupFailureTransitionToState
  ]);

  return {
    dispatchableSeedStates,
    presetRequiredSeedStates,
    seedStates,
    observableStates
  };
}

function mergeTrackerStates(
  states: ReadonlyArray<string | null | undefined>
): string[] {
  const mergedStates: string[] = [];
  const seenStates = new Set<string>();

  for (const state of states) {
    if (typeof state !== "string") {
      continue;
    }

    const trimmedState = state.trim();
    const normalizedState = normalizeIssueState(trimmedState);
    if (normalizedState.length === 0 || seenStates.has(normalizedState)) {
      continue;
    }

    seenStates.add(normalizedState);
    mergedStates.push(trimmedState);
  }

  return mergedStates;
}
