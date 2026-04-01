import type { SymphonyOrchestratorSnapshot } from "@symphony/core/orchestration";
import type { SymphonyRunExport } from "@symphony/core/journal";
import {
  issueBranchName,
  type SymphonyTrackerIssue
} from "@symphony/core/tracker";
import type {
  SymphonyForensicsIssueDetailResult,
  SymphonyForensicsIssueListResult,
  SymphonyForensicsProblemRunsResult,
  SymphonyForensicsRunDetailResult,
  SymphonyRuntimeIssueResult,
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

  if (!running && !retry && !trackedIssue) {
    return null;
  }

  const tracked =
    trackedIssue ??
    running?.issue ?? {
      id: retry?.issueId ?? issueIdentifier,
      identifier: issueIdentifier,
      title: issueIdentifier,
      description: null,
      priority: null,
      state: "Retrying",
      branchName: issueBranchName(issueIdentifier),
      url: null,
      projectId: null,
      projectName: null,
      projectSlug: null,
      teamKey: null,
      assigneeId: null,
      blockedBy: [],
      labels: [],
      assignedToWorker: true,
      createdAt: null,
      updatedAt: null
    };
  const branchName = tracked.branchName ?? issueBranchName(issueIdentifier);
  const githubPullRequestSearchUrl = buildGitHubPullRequestSearchUrl(
    workflowConfig.github.repo,
    branchName
  );
  const workspace = running?.workspace ?? retry?.workspace ?? null;

  return {
    issueIdentifier,
    issueId: running?.issueId ?? retry?.issueId ?? tracked.id,
    status: running ? "running" : retry ? "retrying" : "tracked",
    workspace: serializeRuntimeWorkspace(
      workspace,
      running?.workerHost ?? retry?.workerHost ?? null,
      running?.workspacePath ?? retry?.workspacePath ?? null
    ),
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
    lastError: retry?.error ?? null,
    tracked: {
      title: tracked.title,
      state: tracked.state,
      branchName: tracked.branchName,
      url: tracked.url,
      projectName: tracked.projectName,
      projectSlug: tracked.projectSlug,
      teamKey: tracked.teamKey
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

function serializeRuntimeWorkspace(
  workspace: SymphonyOrchestratorSnapshot["running"][number]["workspace"] | null,
  workerHost: string | null,
  compatibilityPath: string | null
): SymphonyRuntimeIssueResult["workspace"] {
  if (!workspace) {
    return {
      backendKind: null,
      path: compatibilityPath,
      host: workerHost,
      executionTarget: null,
      materialization: null
    };
  }

  return {
    backendKind: workspace.backendKind,
    path: workspace.path ?? compatibilityPath,
    host: workerHost ?? workspace.workerHost,
    executionTarget: {
      ...workspace.executionTarget
    },
    materialization: {
      ...workspace.materialization
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
  const tokenTotals = result.turns.reduce(
    (totals, turn) => {
      const inputTokens = parseTokenCount(turn.tokens?.inputTokens);
      const outputTokens = parseTokenCount(turn.tokens?.outputTokens);
      const totalTokens = parseTokenCount(turn.tokens?.totalTokens);

      return {
        inputTokens: totals.inputTokens + inputTokens,
        outputTokens: totals.outputTokens + outputTokens,
        totalTokens: totals.totalTokens + (totalTokens || inputTokens + outputTokens)
      };
    },
    {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0
    }
  );
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
      inputTokens: tokenTotals.inputTokens,
      outputTokens: tokenTotals.outputTokens,
      totalTokens: tokenTotals.totalTokens,
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

function parseTokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
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
