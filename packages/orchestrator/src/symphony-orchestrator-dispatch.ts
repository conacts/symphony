import {
  extractRateLimits,
  extractTokenUsage,
  isTerminalTurnEvent
} from "./symphony-orchestrator-agent-state.js";
import { claimTransitionCommentBody } from "./symphony-orchestrator-comments.js";
import type {
  SymphonyAgentRuntimeUpdate,
  SymphonyDispatchBootstrapRoutingResult,
  SymphonyRunningEntry,
  SymphonyWorkflowRoutingAdapter
} from "./symphony-orchestrator-types.js";
import type {
  AgentRuntimeLaunchTarget
} from "./agent-runtime.js";
import type {
  SymphonyTracker,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import type { SymphonyRunMode } from "@symphony/runtime-contract";
import {
  workspaceHostPath,
  type PreparedWorkspace
} from "@symphony/workspace";
import type { JsonObject } from "@symphony/contracts";
import type { SymphonyOrchestratorConfig } from "./orchestrator-config.js";

export async function prepareIssueForDispatch(
  config: Pick<SymphonyOrchestratorConfig, "tracker">,
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

export async function resolveDispatchBootstrap(input: {
  config: SymphonyOrchestratorConfig;
  tracker: SymphonyTracker;
  issue: SymphonyTrackerIssue;
  attempt: number;
  preferredWorkerHost: string | null;
  startedAt: string;
  runModeOverride?: SymphonyRunMode;
  workflowRoutingAdapter: SymphonyWorkflowRoutingAdapter;
}): Promise<SymphonyDispatchBootstrapRoutingResult> {
  if (input.runModeOverride) {
    return {
      issue: await prepareIssueForDispatch(
        input.config,
        input.tracker,
        input.issue
      ),
      runMode: input.runModeOverride
    };
  }

  return await input.workflowRoutingAdapter.routeDispatchBootstrap({
    issue: input.issue,
    attempt: input.attempt,
    preferredWorkerHost: input.preferredWorkerHost,
    startedAt: input.startedAt
  });
}

export function createRunningEntry(input: {
  issue: SymphonyTrackerIssue;
  runId: string | null;
  runMode: SymphonyRunMode;
  threadId: string | null;
  workerHost: string | null;
  workspace: PreparedWorkspace | null;
  launchTarget: AgentRuntimeLaunchTarget | null;
  attempt: number;
  startedAt: string;
}): SymphonyRunningEntry {
  return {
    issue: input.issue,
    runId: input.runId,
    runMode: input.runMode,
    threadId: input.threadId,
    workerHost: input.workerHost,
    workspace: input.workspace,
    launchTarget: input.launchTarget,
    workspacePath: workspaceHostPath(input.workspace),
    retryAttempt: input.attempt,
    turnCount: 0,
    lastAgentMessage: null,
    lastAgentTimestamp: null,
    lastAgentEvent: null,
    agentInputTokens: 0,
    agentOutputTokens: 0,
    agentTotalTokens: 0,
    agentLastReportedInputTokens: 0,
    agentLastReportedOutputTokens: 0,
    agentLastReportedTotalTokens: 0,
    lastRateLimits: null,
    agentRuntimeProcessId: null,
    startedAt: input.startedAt
  };
}

export function applyAgentRuntimeUpdateToEntry(
  runningEntry: SymphonyRunningEntry,
  update: SymphonyAgentRuntimeUpdate
): {
  entry: SymphonyRunningEntry;
  rateLimits: JsonObject | null;
} {
  const usage = extractTokenUsage(update);
  const rateLimits = extractRateLimits(update);
  const nextInput = usage?.inputTokens ?? runningEntry.agentInputTokens;
  const nextOutput = usage?.outputTokens ?? runningEntry.agentOutputTokens;
  const nextTotal = usage?.totalTokens ?? runningEntry.agentTotalTokens;

  return {
    entry: {
      ...runningEntry,
      threadId: update.threadId ?? runningEntry.threadId,
      turnCount:
        isTerminalTurnEvent(update.event)
          ? runningEntry.turnCount + 1
          : runningEntry.turnCount,
      lastAgentEvent: update.event,
      lastAgentTimestamp: update.timestamp,
      lastAgentMessage: {
        event: update.event,
        message: update.payload ?? null,
        timestamp: update.timestamp
      },
      agentInputTokens: nextInput,
      agentOutputTokens: nextOutput,
      agentTotalTokens: nextTotal,
      agentLastReportedInputTokens: nextInput,
      agentLastReportedOutputTokens: nextOutput,
      agentLastReportedTotalTokens: nextTotal,
      lastRateLimits: rateLimits ?? runningEntry.lastRateLimits,
      agentRuntimeProcessId: update.agentRuntimeProcessId ?? runningEntry.agentRuntimeProcessId
    },
    rateLimits
  };
}
