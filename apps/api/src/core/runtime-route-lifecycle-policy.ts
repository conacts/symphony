import type { SymphonyTrackerConfig } from "@symphony/tracker";
import { normalizeIssueState } from "@symphony/tracker";

export type SymphonyNonRunningTrackerIngressPolicy = {
  dispatchableSeedStates: string[];
  presetRequiredSeedStates: string[];
  seedStates: string[];
  observableStates: string[];
};

export function buildNonRunningTrackerIngressPolicy(input: {
  presetId: string;
  trackerConfig: SymphonyTrackerConfig;
  presetRequiredSeedStates: readonly string[];
}): SymphonyNonRunningTrackerIngressPolicy {
  const dispatchableSeedStates = mergeTrackerPolicyStates(
    input.trackerConfig.dispatchableStates
  );
  const presetRequiredSeedStates = normalizePresetRequiredSeedStates({
    presetId: input.presetId,
    states: input.presetRequiredSeedStates
  });
  const seedStates = mergeTrackerPolicyStates([
    ...dispatchableSeedStates,
    ...presetRequiredSeedStates
  ]);
  const observableStates = mergeTrackerPolicyStates([
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

function mergeTrackerPolicyStates(
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

function normalizePresetRequiredSeedStates(input: {
  presetId: string;
  states: readonly string[];
}): string[] {
  const normalizedStates: string[] = [];
  const seenStates = new Map<string, string>();

  for (const rawState of input.states) {
    const state = rawState.trim();
    const normalizedState = normalizeIssueState(state);

    if (normalizedState.length === 0) {
      throw new TypeError(
        `Runtime workflow preset ${JSON.stringify(input.presetId)} declares an empty required non-running tracker seed state.`
      );
    }

    const existingState = seenStates.get(normalizedState);
    if (existingState) {
      throw new TypeError(
        `Runtime workflow preset ${JSON.stringify(input.presetId)} declares duplicate required non-running tracker seed states ${JSON.stringify(existingState)} and ${JSON.stringify(rawState)}.`
      );
    }

    seenStates.set(normalizedState, state);
    normalizedStates.push(state);
  }

  return normalizedStates;
}
