import type { SymphonyOrchestratorSnapshot } from "@symphony/orchestrator";
import { summarizePreparedWorkspace } from "@symphony/workspace";
import type { SymphonyLogger } from "@symphony/logger";
import type { SymphonyRealtimeHub } from "../realtime/symphony-realtime-hub.js";
import {
  requireWorkflowTrackerState,
  type RuntimeWorkflowTrackerStatesByIssueIdentifier
} from "./runtime-workflow-tracker-state.js";

type RuntimeRealtimeWorkflowTrackerStates = {
  before: RuntimeWorkflowTrackerStatesByIssueIdentifier;
  after: RuntimeWorkflowTrackerStatesByIssueIdentifier;
};

export function publishRealtimeSnapshotDiff(
  realtime: SymphonyRealtimeHub,
  before: SymphonyOrchestratorSnapshot,
  after: SymphonyOrchestratorSnapshot,
  logger: SymphonyLogger,
  workflowTrackerStates: RuntimeRealtimeWorkflowTrackerStates
): void {
  if (
    !snapshotRequiresRealtimeInvalidation(
      before,
      after,
      workflowTrackerStates
    )
  ) {
    logger.debug("Skipped realtime invalidation because snapshot did not change");
    return;
  }

  logger.debug("Publishing realtime invalidation for snapshot change", {
    beforeRunningCount: before.running.length,
    afterRunningCount: after.running.length,
    beforeRetryingCount: before.retrying.length,
    afterRetryingCount: after.retrying.length
  });
  realtime.publishSnapshotUpdated();
  realtime.publishProblemRunsUpdated();

  const trackerIssueKeys = new Set<string>();
  const runs = new Map<string, string | undefined>();

  for (const entry of before.running) {
    trackerIssueKeys.add(entry.issue.identifier);
    if (entry.runId) {
      runs.set(entry.runId, entry.issue.identifier);
    }
  }

  for (const entry of before.retrying) {
    trackerIssueKeys.add(entry.identifier);
  }

  for (const entry of after.running) {
    trackerIssueKeys.add(entry.issue.identifier);
    if (entry.runId) {
      runs.set(entry.runId, entry.issue.identifier);
    }
  }

  for (const entry of after.retrying) {
    trackerIssueKeys.add(entry.identifier);
  }

  for (const trackerIssueKey of trackerIssueKeys) {
    realtime.publishIssueUpdated(trackerIssueKey);
  }

  for (const [runId, trackerIssueKey] of runs) {
    realtime.publishRunUpdated(runId, trackerIssueKey);
  }
}

export function snapshotRequiresRealtimeInvalidation(
  before: SymphonyOrchestratorSnapshot,
  after: SymphonyOrchestratorSnapshot,
  workflowTrackerStates: RuntimeRealtimeWorkflowTrackerStates
): boolean {
  return (
    JSON.stringify(
      buildRealtimeComparableSnapshot(before, workflowTrackerStates.before)
    ) !==
    JSON.stringify(
      buildRealtimeComparableSnapshot(after, workflowTrackerStates.after)
    )
  );
}

function buildRealtimeComparableSnapshot(
  snapshot: SymphonyOrchestratorSnapshot,
  workflowTrackerStatesByIssueIdentifier: RuntimeWorkflowTrackerStatesByIssueIdentifier
): Record<string, unknown> {
  return {
    running: snapshot.running.map((entry) => ({
      issueId: entry.issueId,
      trackerIssueKey: entry.issue.identifier,
      trackerState: requireWorkflowTrackerState({
        issueIdentifier: entry.issue.identifier,
        workflowTrackerState:
          workflowTrackerStatesByIssueIdentifier.get(entry.issue.identifier) ?? null
      }),
      runId: entry.runId,
      threadId: entry.threadId,
      workerHost: entry.workerHost,
      workspace: summarizePreparedWorkspace(entry.workspace),
      launchTarget: entry.launchTarget,
      workspacePath: entry.workspacePath,
      retryAttempt: entry.retryAttempt,
      turnCount: entry.turnCount,
      lastAgentMessage: entry.lastAgentMessage,
      lastAgentTimestamp: entry.lastAgentTimestamp,
      lastAgentEvent: entry.lastAgentEvent,
      agentInputTokens: entry.agentInputTokens,
      agentOutputTokens: entry.agentOutputTokens,
      agentTotalTokens: entry.agentTotalTokens,
      agentLastReportedInputTokens: entry.agentLastReportedInputTokens,
      agentLastReportedOutputTokens: entry.agentLastReportedOutputTokens,
      agentLastReportedTotalTokens: entry.agentLastReportedTotalTokens,
      lastRateLimits: entry.lastRateLimits,
      agentRuntimeProcessId: entry.agentRuntimeProcessId,
      startedAt: entry.startedAt
    })),
    retrying: snapshot.retrying.map((entry) => ({
      issueId: entry.issueId,
      attempt: entry.attempt,
      dueAtMs: entry.dueAtMs,
      retryToken: entry.retryToken,
      identifier: entry.identifier,
      error: entry.error,
      workerHost: entry.workerHost,
      workspace: summarizePreparedWorkspace(entry.workspace),
      launchTarget: entry.launchTarget,
      workspacePath: entry.workspacePath,
      delayType: entry.delayType
    })),
    agentTotals: snapshot.agentTotals,
    rateLimits: snapshot.rateLimits
  };
}
