import { runtimeSeconds } from "./symphony-orchestrator-codex-state.js";
import type {
  SymphonyClock,
  SymphonyRunningEntry,
  SymphonyOrchestratorSnapshot,
  SymphonyOrchestratorState
} from "./symphony-orchestrator-types.js";
import type { SymphonyOrchestratorConfig } from "./orchestrator-config.js";

export const systemClock: SymphonyClock = {
  now() {
    return new Date();
  },
  nowMs() {
    return Date.now();
  }
};

export function createSymphonyOrchestratorState(
  config: SymphonyOrchestratorConfig,
  clock: SymphonyClock = systemClock
): SymphonyOrchestratorState {
  return {
    pollIntervalMs: config.polling.intervalMs,
    maxConcurrentAgents: config.agent.maxConcurrentAgents,
    nextPollDueAtMs: clock.nowMs(),
    pollCheckInProgress: false,
    running: {},
    completed: new Set<string>(),
    claimed: new Set<string>(),
    retryAttempts: {},
    codexTotals: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      secondsRunning: 0
    },
    rateLimits: null
  };
}

export function createSymphonyOrchestratorSnapshot(
  state: SymphonyOrchestratorState,
  clock: SymphonyClock
): SymphonyOrchestratorSnapshot {
  const now = clock.now();

  return {
    running: Object.entries(state.running)
      .map(([issueId, entry]) => ({
        issueId,
        ...entry,
        runtimeSeconds: runtimeSeconds(entry.startedAt, now)
      }))
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt)),
    retrying: Object.entries(state.retryAttempts)
      .map(([issueId, retry]) => ({
        issueId,
        ...retry
      }))
      .sort((left, right) => left.dueAtMs - right.dueAtMs),
    claimedIssueIds: [...state.claimed].sort(),
    completedIssueIds: [...state.completed].sort(),
    pollIntervalMs: state.pollIntervalMs,
    maxConcurrentAgents: state.maxConcurrentAgents,
    nextPollDueAtMs: state.nextPollDueAtMs,
    pollCheckInProgress: state.pollCheckInProgress,
    codexTotals: state.codexTotals,
    rateLimits: state.rateLimits
  };
}

export function accumulateCodexTotals(
  state: SymphonyOrchestratorState,
  runningEntry: SymphonyRunningEntry,
  clock: SymphonyClock
): SymphonyOrchestratorState {
  return {
    ...state,
    codexTotals: {
      inputTokens: state.codexTotals.inputTokens + runningEntry.codexInputTokens,
      outputTokens: state.codexTotals.outputTokens + runningEntry.codexOutputTokens,
      totalTokens: state.codexTotals.totalTokens + runningEntry.codexTotalTokens,
      secondsRunning:
        state.codexTotals.secondsRunning +
        runtimeSeconds(runningEntry.startedAt, clock.now())
    }
  };
}
