import {
  extractRateLimits,
  extractTokenUsage,
  isTerminalTurnEvent
} from "./symphony-orchestrator-codex-state.js";
import { claimTransitionCommentBody } from "./symphony-orchestrator-comments.js";
import type {
  SymphonyAgentRuntimeUpdate,
  SymphonyRunningEntry
} from "./symphony-orchestrator-types.js";
import type {
  AgentRuntimeLaunchTarget
} from "./agent-runtime.js";
import type {
  SymphonyTracker,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import {
  workspaceHostPath,
  type PreparedWorkspace
} from "@symphony/workspace";
import type { SymphonyJsonObject } from "@symphony/run-journal";
import type { SymphonyOrchestratorConfig } from "./orchestrator-config.js";

export async function prepareIssueForDispatch(
  config: SymphonyOrchestratorConfig,
  tracker: SymphonyTracker,
  issue: SymphonyTrackerIssue
): Promise<SymphonyTrackerIssue> {
  const targetState = config.tracker.claimTransitionToState;
  const sourceStates = config.tracker.claimTransitionFromStates.map(
    (stateName) => stateName.trim().toLowerCase()
  );

  if (
    !targetState ||
    !sourceStates.includes(issue.state.trim().toLowerCase())
  ) {
    return issue;
  }

  await tracker.updateIssueState(issue.id, targetState);
  await tracker.createComment(issue.id, claimTransitionCommentBody(issue, targetState));

  return {
    ...issue,
    state: targetState
  };
}

export function createRunningEntry(input: {
  issue: SymphonyTrackerIssue;
  runId: string | null;
  sessionId: string | null;
  workerHost: string | null;
  workspace: PreparedWorkspace | null;
  launchTarget: AgentRuntimeLaunchTarget | null;
  attempt: number;
  startedAt: string;
}): SymphonyRunningEntry {
  return {
    issue: input.issue,
    runId: input.runId,
    sessionId: input.sessionId,
    workerHost: input.workerHost,
    workspace: input.workspace,
    launchTarget: input.launchTarget,
    workspacePath: workspaceHostPath(input.workspace),
    retryAttempt: input.attempt,
    turnCount: 0,
    lastCodexMessage: null,
    lastCodexTimestamp: null,
    lastCodexEvent: null,
    codexInputTokens: 0,
    codexOutputTokens: 0,
    codexTotalTokens: 0,
    codexLastReportedInputTokens: 0,
    codexLastReportedOutputTokens: 0,
    codexLastReportedTotalTokens: 0,
    lastRateLimits: null,
    codexAppServerPid: null,
    startedAt: input.startedAt
  };
}

export function applyAgentRuntimeUpdateToEntry(
  runningEntry: SymphonyRunningEntry,
  update: SymphonyAgentRuntimeUpdate
): {
  entry: SymphonyRunningEntry;
  rateLimits: SymphonyJsonObject | null;
} {
  const usage = extractTokenUsage(update);
  const rateLimits = extractRateLimits(update);
  const nextInput = usage?.inputTokens ?? runningEntry.codexInputTokens;
  const nextOutput = usage?.outputTokens ?? runningEntry.codexOutputTokens;
  const nextTotal = usage?.totalTokens ?? runningEntry.codexTotalTokens;

  return {
    entry: {
      ...runningEntry,
      sessionId: update.sessionId ?? runningEntry.sessionId,
      turnCount:
        isTerminalTurnEvent(update.event)
          ? runningEntry.turnCount + 1
          : runningEntry.turnCount,
      lastCodexEvent: update.event,
      lastCodexTimestamp: update.timestamp,
      lastCodexMessage: {
        event: update.event,
        message: update.payload ?? null,
        timestamp: update.timestamp
      },
      codexInputTokens: nextInput,
      codexOutputTokens: nextOutput,
      codexTotalTokens: nextTotal,
      codexLastReportedInputTokens: nextInput,
      codexLastReportedOutputTokens: nextOutput,
      codexLastReportedTotalTokens: nextTotal,
      lastRateLimits: rateLimits ?? runningEntry.lastRateLimits,
      codexAppServerPid: update.codexAppServerPid ?? runningEntry.codexAppServerPid
    },
    rateLimits
  };
}
