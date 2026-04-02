import { randomUUID } from "node:crypto";
import { workspaceHostPath, type PreparedWorkspace } from "../workspace/workspace-backend.js";
import type { AgentRuntimeLaunchTarget } from "../runtime/agent-runtime.js";
import type {
  SymphonyOrchestratorState,
  SymphonyRetryEntry
} from "./symphony-orchestrator-types.js";
import { failureRetryDelay } from "./symphony-orchestrator-failures.js";

export const continuationRetryDelayMs = 1_000;

export function createRetryEntry(input: {
  attempt: number;
  nowMs: number;
  identifier: string;
  error?: string;
  workerHost?: string | null;
  workspace?: PreparedWorkspace | null;
  launchTarget?: AgentRuntimeLaunchTarget | null;
  delayType: "continuation" | "failure";
  maxRetryBackoffMs: number;
}): SymphonyRetryEntry {
  const delayMs =
    input.delayType === "continuation"
      ? continuationRetryDelayMs
      : failureRetryDelay(input.attempt, input.maxRetryBackoffMs);

  return {
    attempt: input.attempt,
    dueAtMs: input.nowMs + delayMs,
    retryToken: randomUUID(),
    identifier: input.identifier,
    error: input.error ?? null,
    workerHost: input.workerHost ?? null,
    workspace: input.workspace ?? null,
    launchTarget: input.launchTarget ?? null,
    workspacePath: workspaceHostPath(input.workspace ?? null),
    delayType: input.delayType
  };
}

export function stateSlotsAvailable(
  state: SymphonyOrchestratorState,
  issueState: string,
  maxConcurrentAgentsByState: Record<string, number>
): boolean {
  const normalizedState = issueState.trim().toLowerCase();
  const configuredLimit = maxConcurrentAgentsByState[normalizedState];

  if (!configuredLimit) {
    return true;
  }

  const runningInState = Object.values(state.running).filter(
    (entry) => entry.issue.state.trim().toLowerCase() === normalizedState
  ).length;

  return runningInState < configuredLimit;
}
