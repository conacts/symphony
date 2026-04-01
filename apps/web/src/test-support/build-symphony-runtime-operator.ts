import type {
  SymphonyRuntimeIssueResult,
  SymphonyRuntimeRefreshResult
} from "@symphony/contracts";

export function buildSymphonyRuntimeRefreshResult(
  overrides: Partial<SymphonyRuntimeRefreshResult> = {}
): SymphonyRuntimeRefreshResult {
  return {
    queued: true,
    coalesced: false,
    requestedAt: "2026-03-31T18:05:00.000Z",
    operations: ["poll", "reconcile"],
    ...overrides
  };
}

export function buildSymphonyRuntimeIssueResult(
  overrides: Partial<SymphonyRuntimeIssueResult> = {}
): SymphonyRuntimeIssueResult {
  return {
    issueIdentifier: "COL-167",
    issueId: "issue-167",
    status: "running",
    workspace: {
      path: "/tmp/symphony-COL-167",
      host: "local"
    },
    attempts: {
      restartCount: 0,
      currentRetryAttempt: 0
    },
    running: {
      workerHost: "local",
      workspacePath: "/tmp/symphony-COL-167",
      sessionId: "session-167",
      turnCount: 3,
      state: "In Progress",
      startedAt: "2026-03-31T18:00:00.000Z",
      lastEvent: "notification",
      lastMessage: "Working on implementation",
      lastEventAt: "2026-03-31T18:04:00.000Z",
      tokens: {
        inputTokens: 12,
        outputTokens: 8,
        totalTokens: 20
      }
    },
    retry: null,
    lastError: null,
    tracked: {
      title: "Preserve refresh and requeue parity",
      state: "In Progress",
      branchName: "symphony/COL-167",
      url: "https://linear.app/coldets/issue/COL-167/refresh-and-requeue",
      projectName: "Symphony",
      projectSlug: "symphony",
      teamKey: "COL"
    },
    operator: {
      refreshPath: "/api/v1/refresh",
      refreshDelegatesTo: ["poll", "reconcile"],
      githubPullRequestSearchUrl:
        "https://github.com/openai/symphony/pulls?q=is%3Apr+head%3Asymphony%2FCOL-167",
      requeueDelegatesTo: ["linear", "github_rework_comment"],
      requeueCommand: "/rework",
      requeueHelpText:
        "Refresh runs the normal poll/reconcile cycle now. Requeue still happens through /rework on GitHub or the admitted Linear state flow."
    },
    ...overrides
  };
}
