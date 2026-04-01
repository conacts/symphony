import path from "node:path";
import {
  issueBranchName,
  symphonyWorkspaceDirectoryName,
  type SymphonyOrchestratorSnapshot,
  type SymphonyRunExport,
  type SymphonyTrackerIssue
} from "@symphony/core";
import type {
  SymphonyForensicsIssueDetailResult,
  SymphonyForensicsIssueListResult,
  SymphonyForensicsProblemRunsResult,
  SymphonyForensicsRunDetailResult,
  SymphonyRuntimeIssueResult,
  SymphonyRuntimeRefreshResult,
  SymphonyRuntimeStateResult
} from "@symphony/contracts";
import type { SymphonyResolvedWorkflowConfig } from "@symphony/core";

export function serializeRuntimeState(
  snapshot: SymphonyOrchestratorSnapshot
): SymphonyRuntimeStateResult {
  return {
    counts: {
      running: snapshot.running.length,
      retrying: snapshot.retrying.length
    },
    running: snapshot.running.map((entry) => ({
      issueId: entry.issueId,
      issueIdentifier: entry.issue.identifier,
      state: entry.issue.state,
      workerHost: entry.workerHost,
      workspacePath: entry.workspacePath,
      sessionId: entry.sessionId,
      turnCount: entry.turnCount,
      lastEvent: entry.lastCodexEvent,
      lastMessage: summarizeMessage(entry.lastCodexMessage?.message ?? null),
      startedAt: entry.startedAt,
      lastEventAt: entry.lastCodexTimestamp,
      tokens: {
        inputTokens: entry.codexInputTokens,
        outputTokens: entry.codexOutputTokens,
        totalTokens: entry.codexTotalTokens
      }
    })),
    retrying: snapshot.retrying.map((entry) => ({
      issueId: entry.issueId,
      issueIdentifier: entry.identifier,
      attempt: entry.attempt,
      dueAt: new Date(entry.dueAtMs).toISOString(),
      error: entry.error,
      workerHost: entry.workerHost,
      workspacePath: entry.workspacePath
    })),
    codexTotals: snapshot.codexTotals,
    rateLimits: snapshot.rateLimits
  };
}

export function serializeRuntimeIssue(
  snapshot: SymphonyOrchestratorSnapshot,
  workflowConfig: SymphonyResolvedWorkflowConfig,
  issueIdentifier: string,
  trackedIssue: SymphonyTrackerIssue | null
): SymphonyRuntimeIssueResult | null {
  const running = snapshot.running.find(
    (entry) => entry.issue.identifier === issueIdentifier
  );
  const retry = snapshot.retrying.find(
    (entry) => entry.identifier === issueIdentifier
  );

  if (!running && !retry) {
    return null;
  }

  const resolvedTrackedIssue = trackedIssue ?? buildFallbackTrackedIssue({
    issueIdentifier,
    running,
    retry
  });
  const branchName =
    resolvedTrackedIssue.branchName ?? issueBranchName(issueIdentifier);
  const githubPullRequestSearchUrl = buildGitHubPullRequestSearchUrl(
    workflowConfig.github.repo,
    branchName
  );

  const workspacePath =
    running?.workspacePath ??
    retry?.workspacePath ??
    path.join(
      workflowConfig.workspace.root,
      symphonyWorkspaceDirectoryName(issueIdentifier)
    );

  return {
    issueIdentifier,
    issueId: running?.issueId ?? retry!.issueId,
    status: running ? "running" : "retrying",
    workspace: {
      path: workspacePath,
      host: running?.workerHost ?? retry?.workerHost ?? null
    },
    attempts: {
      restartCount: Math.max((retry?.attempt ?? 0) - 1, 0),
      currentRetryAttempt: retry?.attempt ?? 0
    },
    running: running
      ? {
          workerHost: running.workerHost,
          workspacePath: running.workspacePath,
          sessionId: running.sessionId,
          turnCount: running.turnCount,
          state: running.issue.state,
          startedAt: running.startedAt,
          lastEvent: running.lastCodexEvent,
          lastMessage: summarizeMessage(running.lastCodexMessage?.message ?? null),
          lastEventAt: running.lastCodexTimestamp,
          tokens: {
            inputTokens: running.codexInputTokens,
            outputTokens: running.codexOutputTokens,
            totalTokens: running.codexTotalTokens
          }
        }
      : null,
    retry: retry
      ? {
          attempt: retry.attempt,
          dueAt: new Date(retry.dueAtMs).toISOString(),
          error: retry.error,
          workerHost: retry.workerHost,
          workspacePath: retry.workspacePath
        }
      : null,
    logs: {
      codexSessionLogs: []
    },
    recentEvents: running?.lastCodexTimestamp
      ? [
          {
            at: running.lastCodexTimestamp,
            event: running.lastCodexEvent ?? null,
            message: summarizeMessage(running.lastCodexMessage?.message ?? null)
          }
        ]
      : [],
    lastError: retry?.error ?? null,
    tracked: {
      title: resolvedTrackedIssue.title,
      state: resolvedTrackedIssue.state,
      branchName: resolvedTrackedIssue.branchName,
      url: resolvedTrackedIssue.url,
      projectName: resolvedTrackedIssue.projectName,
      projectSlug: resolvedTrackedIssue.projectSlug,
      teamKey: resolvedTrackedIssue.teamKey
    },
    operator: {
      refreshPath: "/api/v1/refresh",
      refreshDelegatesTo: ["poll", "reconcile"],
      githubPullRequestSearchUrl,
      requeueDelegatesTo: ["linear", "github_rework_comment"],
      requeueCommand: "/rework",
      requeueHelpText:
        "Refresh runs the normal poll/reconcile cycle now. Requeue still happens through /rework on GitHub or the admitted Linear state flow."
    }
  };
}

export function serializeForensicsIssueList(
  result: SymphonyForensicsIssueListResult
): SymphonyForensicsIssueListResult {
  return result;
}

export function serializeForensicsIssueDetail(
  result: SymphonyForensicsIssueDetailResult
): SymphonyForensicsIssueDetailResult {
  return result;
}

export function serializeForensicsProblemRuns(
  result: SymphonyForensicsProblemRunsResult
): SymphonyForensicsProblemRunsResult {
  return result;
}

export function serializeForensicsRunDetail(
  result: SymphonyRunExport
): SymphonyForensicsRunDetailResult {
  const allEvents = result.turns.flatMap((turn) => turn.events);
  const sortedEvents = [...allEvents].sort((left, right) => {
    const recordedAtOrder = (right.recordedAt ?? "").localeCompare(left.recordedAt ?? "");

    if (recordedAtOrder !== 0) {
      return recordedAtOrder;
    }

    return right.eventSequence - left.eventSequence;
  });
  const lastEvent = sortedEvents[0];

  return {
    issue: result.issue,
    run: {
      ...result.run,
      turnCount: result.turns.length,
      eventCount: allEvents.length,
      lastEventType: lastEvent?.eventType ?? null,
      lastEventAt: lastEvent?.recordedAt ?? null,
      durationSeconds:
        result.run.startedAt && result.run.endedAt
          ? Math.max(
              0,
              Math.floor(
                (Date.parse(result.run.endedAt) - Date.parse(result.run.startedAt)) /
                  1_000
              )
            )
          : null
    },
    turns: result.turns
  };
}

export function serializeRefreshResult(
  requestedAt: string
): SymphonyRuntimeRefreshResult {
  return {
    queued: true,
    coalesced: false,
    requestedAt,
    operations: ["poll", "reconcile"]
  };
}

function summarizeMessage(message: unknown): string | null {
  if (typeof message === "string") {
    return message;
  }

  if (message === null || message === undefined) {
    return null;
  }

  if (
    typeof message === "object" &&
    "method" in message &&
    typeof message.method === "string"
  ) {
    return message.method;
  }

  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

function buildFallbackTrackedIssue(input: {
  issueIdentifier: string;
  running:
    | SymphonyOrchestratorSnapshot["running"][number]
    | undefined;
  retry:
    | SymphonyOrchestratorSnapshot["retrying"][number]
    | undefined;
}): SymphonyTrackerIssue {
  return {
    id: input.running?.issueId ?? input.retry?.issueId ?? input.issueIdentifier,
    identifier: input.issueIdentifier,
    title: input.running?.issue.title ?? input.issueIdentifier,
    description: input.running?.issue.description ?? null,
    priority: input.running?.issue.priority ?? null,
    state: input.running?.issue.state ?? "Retrying",
    branchName: input.running?.issue.branchName ?? issueBranchName(input.issueIdentifier),
    url: input.running?.issue.url ?? null,
    projectId: input.running?.issue.projectId ?? null,
    projectName: input.running?.issue.projectName ?? null,
    projectSlug: input.running?.issue.projectSlug ?? null,
    teamKey: input.running?.issue.teamKey ?? null,
    assigneeId: input.running?.issue.assigneeId ?? null,
    blockedBy: input.running?.issue.blockedBy ?? [],
    labels: input.running?.issue.labels ?? [],
    assignedToWorker: input.running?.issue.assignedToWorker ?? true,
    createdAt: input.running?.issue.createdAt ?? null,
    updatedAt: input.running?.issue.updatedAt ?? null
  };
}

function buildGitHubPullRequestSearchUrl(
  repository: string | null,
  branchName: string | null
): string | null {
  if (!repository || !branchName) {
    return null;
  }

  const url = new URL(`https://github.com/${repository}/pulls`);
  url.searchParams.set("q", `is:pr head:${branchName}`);
  return url.toString();
}
