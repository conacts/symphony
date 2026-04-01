import type { SymphonyOrchestratorSnapshot } from "@symphony/core";
import type { SymphonyLogger } from "@symphony/logger";
import type { SymphonyRealtimeHub } from "../realtime/symphony-realtime-hub.js";

export function publishRealtimeSnapshotDiff(
  realtime: SymphonyRealtimeHub,
  before: SymphonyOrchestratorSnapshot,
  after: SymphonyOrchestratorSnapshot,
  logger: SymphonyLogger
): void {
  if (!snapshotRequiresRealtimeInvalidation(before, after)) {
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

  const issueIdentifiers = new Set<string>();
  const runs = new Map<string, string | undefined>();

  for (const entry of before.running) {
    issueIdentifiers.add(entry.issue.identifier);
    if (entry.runId) {
      runs.set(entry.runId, entry.issue.identifier);
    }
  }

  for (const entry of before.retrying) {
    issueIdentifiers.add(entry.identifier);
  }

  for (const entry of after.running) {
    issueIdentifiers.add(entry.issue.identifier);
    if (entry.runId) {
      runs.set(entry.runId, entry.issue.identifier);
    }
  }

  for (const entry of after.retrying) {
    issueIdentifiers.add(entry.identifier);
  }

  for (const issueIdentifier of issueIdentifiers) {
    realtime.publishIssueUpdated(issueIdentifier);
  }

  for (const [runId, issueIdentifier] of runs) {
    realtime.publishRunUpdated(runId, issueIdentifier);
  }
}

export function snapshotRequiresRealtimeInvalidation(
  before: SymphonyOrchestratorSnapshot,
  after: SymphonyOrchestratorSnapshot
): boolean {
  return (
    JSON.stringify(buildRealtimeComparableSnapshot(before)) !==
    JSON.stringify(buildRealtimeComparableSnapshot(after))
  );
}

function buildRealtimeComparableSnapshot(
  snapshot: SymphonyOrchestratorSnapshot
): Record<string, unknown> {
  return {
    running: snapshot.running.map((entry) => ({
      issueId: entry.issueId,
      issue: entry.issue,
      runId: entry.runId,
      sessionId: entry.sessionId,
      workerHost: entry.workerHost,
      workspacePath: entry.workspacePath,
      retryAttempt: entry.retryAttempt,
      turnCount: entry.turnCount,
      lastCodexMessage: entry.lastCodexMessage,
      lastCodexTimestamp: entry.lastCodexTimestamp,
      lastCodexEvent: entry.lastCodexEvent,
      codexInputTokens: entry.codexInputTokens,
      codexOutputTokens: entry.codexOutputTokens,
      codexTotalTokens: entry.codexTotalTokens,
      codexLastReportedInputTokens: entry.codexLastReportedInputTokens,
      codexLastReportedOutputTokens: entry.codexLastReportedOutputTokens,
      codexLastReportedTotalTokens: entry.codexLastReportedTotalTokens,
      lastRateLimits: entry.lastRateLimits,
      codexAppServerPid: entry.codexAppServerPid,
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
      workspacePath: entry.workspacePath,
      delayType: entry.delayType
    })),
    codexTotals: snapshot.codexTotals,
    rateLimits: snapshot.rateLimits
  };
}
