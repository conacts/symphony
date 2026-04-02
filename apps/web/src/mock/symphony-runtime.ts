import type {
  SymphonyForensicsIssueDetailResult,
  SymphonyForensicsIssueFilters,
  SymphonyForensicsIssueForensicsBundleResult,
  SymphonyForensicsIssueListResult,
  SymphonyForensicsIssueSummary,
  SymphonyForensicsIssueTimelineEntry,
  SymphonyForensicsRunDetailResult,
  SymphonyForensicsRunSummary,
  SymphonyRuntimeIssueResult,
  SymphonyRuntimeLogEntry,
  SymphonyRuntimeRefreshResult,
  SymphonyRuntimeStateResult
} from "@symphony/contracts";
import {
  buildSymphonyForensicsRunDetailResult,
  buildSymphonyRuntimeStateResult
} from "@/test-support/build-symphony-dashboard-view-fixtures";
import {
  buildSymphonyRuntimeIssueResult,
  buildSymphonyRuntimeRefreshResult
} from "@/test-support/build-symphony-runtime-operator";
import {
  loadSymphonyDashboardEnv,
  type EnvironmentSource
} from "@/core/env";

const mockIssues: SymphonyForensicsIssueSummary[] = [
  {
    issueId: "issue_123",
    issueIdentifier: "COL-165",
    latestRunStartedAt: "2026-03-31T18:00:00.000Z",
    latestRunId: "run_123",
    latestRunStatus: "finished",
    latestRunOutcome: "completed",
    runCount: 3,
    completedRunCount: 1,
    problemRunCount: 2,
    problemRate: 2 / 3,
    latestProblemOutcome: "max_turns",
    lastCompletedOutcome: "completed",
    retryCount: 2,
    latestRetryAttempt: 3,
    rateLimitedCount: 1,
    maxTurnsCount: 1,
    startupFailureCount: 0,
    totalInputTokens: 6000,
    totalOutputTokens: 2500,
    totalTokens: 8500,
    avgDurationSeconds: 420,
    avgTurns: 5.3,
    avgEvents: 12,
    latestErrorClass: "max_turns",
    latestErrorMessage: "Reached max turns before completion.",
    latestActivityAt: "2026-03-31T18:05:00.000Z",
    flags: ["rate_limited", "max_turns", "many_retries"],
    insertedAt: "2026-03-31T18:00:00.000Z",
    updatedAt: "2026-03-31T18:05:00.000Z"
  },
  {
    issueId: "issue_456",
    issueIdentifier: "COL-166",
    latestRunStartedAt: "2026-03-31T19:10:00.000Z",
    latestRunId: "run_456",
    latestRunStatus: "retrying",
    latestRunOutcome: "rate_limited",
    runCount: 4,
    completedRunCount: 1,
    problemRunCount: 3,
    problemRate: 0.75,
    latestProblemOutcome: "rate_limited",
    lastCompletedOutcome: "completed",
    retryCount: 3,
    latestRetryAttempt: 2,
    rateLimitedCount: 2,
    maxTurnsCount: 0,
    startupFailureCount: 0,
    totalInputTokens: 4200,
    totalOutputTokens: 1800,
    totalTokens: 6000,
    avgDurationSeconds: 315,
    avgTurns: 4.2,
    avgEvents: 9,
    latestErrorClass: "rate_limit_exceeded",
    latestErrorMessage: "Upstream rate limit reached.",
    latestActivityAt: "2026-03-31T19:18:00.000Z",
    flags: ["rate_limited", "many_retries"],
    insertedAt: "2026-03-31T19:00:00.000Z",
    updatedAt: "2026-03-31T19:18:00.000Z"
  },
  {
    issueId: "issue_789",
    issueIdentifier: "COL-167",
    latestRunStartedAt: "2026-03-31T17:25:00.000Z",
    latestRunId: "run_789",
    latestRunStatus: "finished",
    latestRunOutcome: "startup_failure",
    runCount: 2,
    completedRunCount: 0,
    problemRunCount: 2,
    problemRate: 1,
    latestProblemOutcome: "startup_failure",
    lastCompletedOutcome: null,
    retryCount: 1,
    latestRetryAttempt: 1,
    rateLimitedCount: 0,
    maxTurnsCount: 0,
    startupFailureCount: 2,
    totalInputTokens: 900,
    totalOutputTokens: 110,
    totalTokens: 1010,
    avgDurationSeconds: 95,
    avgTurns: 1.5,
    avgEvents: 3,
    latestErrorClass: "workspace_boot_failure",
    latestErrorMessage: "Workspace bootstrap failed.",
    latestActivityAt: "2026-03-31T17:27:00.000Z",
    flags: ["startup_failure", "no_success"],
    insertedAt: "2026-03-31T17:20:00.000Z",
    updatedAt: "2026-03-31T17:27:00.000Z"
  }
];

const mockRunsByIssueIdentifier: Record<string, SymphonyForensicsRunSummary[]> = {
  "COL-165": [
    {
      runId: "run_123",
      issueId: "issue_123",
      issueIdentifier: "COL-165",
      attempt: 3,
      status: "finished",
      outcome: "completed",
      workerHost: "worker-a",
      workspacePath: "/tmp/workspaces/col-165",
      startedAt: "2026-03-31T18:00:00.000Z",
      endedAt: "2026-03-31T18:07:00.000Z",
      commitHashStart: "abc123",
      commitHashEnd: "def456",
      turnCount: 6,
      eventCount: 14,
      lastEventType: "message.output",
      lastEventAt: "2026-03-31T18:07:00.000Z",
      durationSeconds: 420,
      errorClass: null,
      errorMessage: null,
      inputTokens: 3000,
      outputTokens: 1300,
      totalTokens: 4300
    },
    {
      runId: "run_122",
      issueId: "issue_123",
      issueIdentifier: "COL-165",
      attempt: 2,
      status: "finished",
      outcome: "max_turns",
      workerHost: "worker-a",
      workspacePath: "/tmp/workspaces/col-165",
      startedAt: "2026-03-31T17:40:00.000Z",
      endedAt: "2026-03-31T17:47:00.000Z",
      commitHashStart: "aaa111",
      commitHashEnd: "bbb222",
      turnCount: 8,
      eventCount: 16,
      lastEventType: "agent.max_turns",
      lastEventAt: "2026-03-31T17:47:00.000Z",
      durationSeconds: 420,
      errorClass: "max_turns",
      errorMessage: "Reached max turns before completion.",
      inputTokens: 2200,
      outputTokens: 900,
      totalTokens: 3100
    },
    {
      runId: "run_121",
      issueId: "issue_123",
      issueIdentifier: "COL-165",
      attempt: 1,
      status: "finished",
      outcome: "rate_limited",
      workerHost: "worker-a",
      workspacePath: "/tmp/workspaces/col-165",
      startedAt: "2026-03-31T17:20:00.000Z",
      endedAt: "2026-03-31T17:26:00.000Z",
      commitHashStart: "999aaa",
      commitHashEnd: "aaa999",
      turnCount: 4,
      eventCount: 9,
      lastEventType: "upstream.rate_limit",
      lastEventAt: "2026-03-31T17:26:00.000Z",
      durationSeconds: 360,
      errorClass: "rate_limit_exceeded",
      errorMessage: "Rate limit exceeded.",
      inputTokens: 800,
      outputTokens: 300,
      totalTokens: 1100
    }
  ],
  "COL-166": [
    {
      runId: "run_456",
      issueId: "issue_456",
      issueIdentifier: "COL-166",
      attempt: 4,
      status: "retrying",
      outcome: "rate_limited",
      workerHost: "worker-b",
      workspacePath: "/tmp/workspaces/col-166",
      startedAt: "2026-03-31T19:10:00.000Z",
      endedAt: "2026-03-31T19:15:00.000Z",
      commitHashStart: "ccc333",
      commitHashEnd: "ddd444",
      turnCount: 5,
      eventCount: 11,
      lastEventType: "upstream.rate_limit",
      lastEventAt: "2026-03-31T19:15:00.000Z",
      durationSeconds: 300,
      errorClass: "rate_limit_exceeded",
      errorMessage: "Upstream rate limit reached.",
      inputTokens: 1400,
      outputTokens: 500,
      totalTokens: 1900
    },
    {
      runId: "run_455",
      issueId: "issue_456",
      issueIdentifier: "COL-166",
      attempt: 3,
      status: "finished",
      outcome: "completed",
      workerHost: "worker-b",
      workspacePath: "/tmp/workspaces/col-166",
      startedAt: "2026-03-31T18:45:00.000Z",
      endedAt: "2026-03-31T18:49:00.000Z",
      commitHashStart: "eee555",
      commitHashEnd: "fff666",
      turnCount: 3,
      eventCount: 7,
      lastEventType: "message.output",
      lastEventAt: "2026-03-31T18:49:00.000Z",
      durationSeconds: 240,
      errorClass: null,
      errorMessage: null,
      inputTokens: 900,
      outputTokens: 400,
      totalTokens: 1300
    }
  ],
  "COL-167": [
    {
      runId: "run_789",
      issueId: "issue_789",
      issueIdentifier: "COL-167",
      attempt: 2,
      status: "finished",
      outcome: "startup_failure",
      workerHost: "worker-c",
      workspacePath: "/tmp/workspaces/col-167",
      startedAt: "2026-03-31T17:25:00.000Z",
      endedAt: "2026-03-31T17:27:00.000Z",
      commitHashStart: "ggg777",
      commitHashEnd: "hhh888",
      turnCount: 1,
      eventCount: 2,
      lastEventType: "workspace.bootstrap.failed",
      lastEventAt: "2026-03-31T17:27:00.000Z",
      durationSeconds: 120,
      errorClass: "workspace_boot_failure",
      errorMessage: "Workspace bootstrap failed.",
      inputTokens: 500,
      outputTokens: 60,
      totalTokens: 560
    },
    {
      runId: "run_788",
      issueId: "issue_789",
      issueIdentifier: "COL-167",
      attempt: 1,
      status: "finished",
      outcome: "startup_failure",
      workerHost: "worker-c",
      workspacePath: "/tmp/workspaces/col-167",
      startedAt: "2026-03-31T17:20:00.000Z",
      endedAt: "2026-03-31T17:21:35.000Z",
      commitHashStart: "iii999",
      commitHashEnd: "jjj000",
      turnCount: 2,
      eventCount: 4,
      lastEventType: "workspace.bootstrap.failed",
      lastEventAt: "2026-03-31T17:21:35.000Z",
      durationSeconds: 95,
      errorClass: "workspace_boot_failure",
      errorMessage: "Dependency install failed.",
      inputTokens: 400,
      outputTokens: 50,
      totalTokens: 450
    }
  ]
};

const mockRuntimeIssueByIdentifier: Record<string, SymphonyRuntimeIssueResult> = {
  "COL-165": buildSymphonyRuntimeIssueResult({
    issueIdentifier: "COL-165",
    issueId: "issue_123",
    workspace: buildLocalRuntimeWorkspace("/tmp/workspaces/col-165", "worker-a"),
    tracked: {
      title: "Stabilize issue forensic drilldown",
      state: "In Progress",
      branchName: "symphony/COL-165",
      url: "https://linear.app/coldets/issue/COL-165/stabilize-issue-forensic-drilldown",
      projectName: "Symphony",
      projectSlug: "symphony",
      teamKey: "COL"
    },
    running: {
      workerHost: "worker-a",
      workspacePath: "/tmp/workspaces/col-165",
      sessionId: "session-165",
      launchTarget: buildHostPathLaunchTarget("/tmp/workspaces/col-165"),
      turnCount: 6,
      state: "In Progress",
      startedAt: "2026-03-31T18:00:00.000Z",
      lastEvent: "message.output",
      lastMessage: "Preparing final summary",
      lastEventAt: "2026-03-31T18:06:00.000Z",
      tokens: {
        inputTokens: 1200,
        outputTokens: 700,
        totalTokens: 1900
      }
    }
  }),
  "COL-166": buildSymphonyRuntimeIssueResult({
    issueIdentifier: "COL-166",
    issueId: "issue_456",
    status: "retrying",
    workspace: buildDockerRuntimeWorkspace({
      hostPath: "/tmp/workspaces/col-166",
      runtimePath: "/home/agent/workspace",
      workerHost: "worker-b",
      containerId: "container-166",
      containerName: "symphony-col-166"
    }),
    attempts: {
      restartCount: 1,
      currentRetryAttempt: 2
    },
    running: null,
    retry: {
      attempt: 2,
      dueAt: "2026-03-31T19:21:00.000Z",
      error: "Upstream rate limit reached.",
      workerHost: "worker-b",
      workspacePath: "/tmp/workspaces/col-166",
      launchTarget: buildContainerLaunchTarget({
        hostWorkspacePath: "/tmp/workspaces/col-166",
        runtimeWorkspacePath: "/home/agent/workspace",
        containerId: "container-166",
        containerName: "symphony-col-166",
        shell: "sh"
      })
    },
    lastError: "Upstream rate limit reached.",
    tracked: {
      title: "Reduce upstream throttling during retries",
      state: "Blocked",
      branchName: "symphony/COL-166",
      url: "https://linear.app/coldets/issue/COL-166/reduce-upstream-throttling-during-retries",
      projectName: "Symphony",
      projectSlug: "symphony",
      teamKey: "COL"
    }
  }),
  "COL-167": buildSymphonyRuntimeIssueResult({
    issueIdentifier: "COL-167",
    issueId: "issue_789",
    workspace: buildLocalRuntimeWorkspace("/tmp/workspaces/col-167", "worker-c"),
    tracked: {
      title: "Repair workspace bootstrap flow",
      state: "Todo",
      branchName: "symphony/COL-167",
      url: "https://linear.app/coldets/issue/COL-167/repair-workspace-bootstrap-flow",
      projectName: "Symphony",
      projectSlug: "symphony",
      teamKey: "COL"
    },
    running: {
      workerHost: "worker-c",
      workspacePath: "/tmp/workspaces/col-167",
      sessionId: "session-167",
      launchTarget: buildHostPathLaunchTarget("/tmp/workspaces/col-167"),
      turnCount: 2,
      state: "Bootstrapping",
      startedAt: "2026-03-31T17:25:00.000Z",
      lastEvent: "workspace.bootstrap.failed",
      lastMessage: "Retrying workspace bootstrap",
      lastEventAt: "2026-03-31T17:26:40.000Z",
      tokens: {
        inputTokens: 70,
        outputTokens: 20,
        totalTokens: 90
      }
    }
  })
};

function buildLocalRuntimeWorkspace(
  path: string,
  workerHost: string
): SymphonyRuntimeIssueResult["workspace"] {
  return {
    backendKind: "local",
    workerHost,
    prepareDisposition: "reused",
    executionTargetKind: "host_path",
    materializationKind: "directory",
    containerDisposition: "not_applicable",
    hostPath: path,
    runtimePath: path,
    containerId: null,
    containerName: null,
    path,
    executionTarget: {
      kind: "host_path",
      path
    },
    materialization: {
      kind: "directory",
      hostPath: path
    }
  };
}

function buildDockerRuntimeWorkspace(input: {
  hostPath: string;
  runtimePath: string;
  workerHost: string;
  containerId: string;
  containerName: string;
}): SymphonyRuntimeIssueResult["workspace"] {
  return {
    backendKind: "docker",
    workerHost: input.workerHost,
    prepareDisposition: "reused",
    executionTargetKind: "container",
    materializationKind: "bind_mount",
    containerDisposition: "reused",
    hostPath: input.hostPath,
    runtimePath: input.runtimePath,
    containerId: input.containerId,
    containerName: input.containerName,
    path: null,
    executionTarget: {
      kind: "container",
      workspacePath: input.runtimePath,
      containerId: input.containerId,
      containerName: input.containerName,
      hostPath: input.hostPath
    },
    materialization: {
      kind: "bind_mount",
      hostPath: input.hostPath,
      containerPath: input.runtimePath
    }
  };
}

function buildHostPathLaunchTarget(
  path: string
): NonNullable<SymphonyRuntimeIssueResult["running"]>["launchTarget"] {
  return {
    kind: "host_path",
    hostWorkspacePath: path,
    runtimeWorkspacePath: path
  };
}

function buildContainerLaunchTarget(input: {
  hostWorkspacePath: string;
  runtimeWorkspacePath: string;
  containerId: string;
  containerName: string;
  shell: string;
}): NonNullable<SymphonyRuntimeIssueResult["running"]>["launchTarget"] {
  return {
    kind: "container",
    hostWorkspacePath: input.hostWorkspacePath,
    runtimeWorkspacePath: input.runtimeWorkspacePath,
    containerId: input.containerId,
    containerName: input.containerName,
    shell: input.shell
  };
}

function requireMockTimestamp(
  value: string | null,
  fieldName: string,
  runId: string
): string {
  if (value) {
    return value;
  }

  throw new Error(`Mock run ${runId} is missing required timestamp ${fieldName}.`);
}

const mockRuntimeLogsByIssueIdentifier: Record<string, SymphonyRuntimeLogEntry[]> = {
  "COL-165": [
    {
      entryId: "log_165_1",
      level: "info",
      source: "runtime",
      eventType: "run.started",
      message: "Started run run_123.",
      issueId: "issue_123",
      issueIdentifier: "COL-165",
      runId: "run_123",
      payload: {
        workerHost: "worker-a"
      },
      recordedAt: "2026-03-31T18:00:00.000Z"
    },
    {
      entryId: "log_165_2",
      level: "warn",
      source: "codex",
      eventType: "retry.recovered",
      message: "Recovered from prior max-turns failure.",
      issueId: "issue_123",
      issueIdentifier: "COL-165",
      runId: "run_123",
      payload: null,
      recordedAt: "2026-03-31T18:03:00.000Z"
    }
  ],
  "COL-166": [
    {
      entryId: "log_166_1",
      level: "warn",
      source: "runtime",
      eventType: "retry.scheduled",
      message: "Scheduled retry after upstream rate limit.",
      issueId: "issue_456",
      issueIdentifier: "COL-166",
      runId: "run_456",
      payload: {
        dueAt: "2026-03-31T19:21:00.000Z"
      },
      recordedAt: "2026-03-31T19:16:00.000Z"
    }
  ],
  "COL-167": [
    {
      entryId: "log_167_1",
      level: "error",
      source: "workspace",
      eventType: "workspace.bootstrap.failed",
      message: "Workspace bootstrap failed during dependency install.",
      issueId: "issue_789",
      issueIdentifier: "COL-167",
      runId: "run_789",
      payload: {
        step: "pnpm install"
      },
      recordedAt: "2026-03-31T17:26:30.000Z"
    }
  ]
};

const mockTimelineByIssueIdentifier: Record<string, SymphonyForensicsIssueTimelineEntry[]> = {
  "COL-165": [
    {
      entryId: "timeline_165_1",
      issueId: "issue_123",
      issueIdentifier: "COL-165",
      runId: "run_123",
      turnId: null,
      source: "orchestrator",
      eventType: "run.started",
      message: "Orchestrator admitted the retry attempt.",
      payload: {
        attempt: 3
      },
      recordedAt: "2026-03-31T18:00:00.000Z"
    },
    {
      entryId: "timeline_165_2",
      issueId: "issue_123",
      issueIdentifier: "COL-165",
      runId: "run_123",
      turnId: "turn_123",
      source: "codex",
      eventType: "message.output",
      message: "Prepared the final patch summary.",
      payload: {
        text: "Prepared final summary"
      },
      recordedAt: "2026-03-31T18:06:00.000Z"
    }
  ],
  "COL-166": [
    {
      entryId: "timeline_166_1",
      issueId: "issue_456",
      issueIdentifier: "COL-166",
      runId: "run_456",
      turnId: null,
      source: "runtime",
      eventType: "retry.scheduled",
      message: "Backoff window started.",
      payload: {
        attempt: 2
      },
      recordedAt: "2026-03-31T19:16:00.000Z"
    }
  ],
  "COL-167": [
    {
      entryId: "timeline_167_1",
      issueId: "issue_789",
      issueIdentifier: "COL-167",
      runId: "run_789",
      turnId: null,
      source: "workspace",
      eventType: "workspace.bootstrap.failed",
      message: "Dependency install failed.",
      payload: {
        command: "pnpm install"
      },
      recordedAt: "2026-03-31T17:26:30.000Z"
    }
  ]
};

export function isMockRuntimeEnabled(
  env?: EnvironmentSource
): boolean {
  return loadSymphonyDashboardEnv(env).useMockRuntime === true;
}

export function buildMockRuntimeStateResult(): SymphonyRuntimeStateResult {
  return buildSymphonyRuntimeStateResult({
    counts: {
      running: 2,
      retrying: 1
    },
    running: [
      {
        issueId: "issue_123",
        issueIdentifier: "COL-165",
        state: "In Progress",
        workerHost: "worker-a",
        workspacePath: "/tmp/workspaces/col-165",
        sessionId: "session-165",
        workspace: buildLocalRuntimeWorkspace("/tmp/workspaces/col-165", "worker-a"),
        launchTarget: buildHostPathLaunchTarget("/tmp/workspaces/col-165"),
        turnCount: 6,
        lastEvent: "message.output",
        lastMessage: "Preparing final summary",
        startedAt: "2026-03-31T18:00:00.000Z",
        lastEventAt: "2026-03-31T18:06:00.000Z",
        tokens: {
          inputTokens: 1200,
          outputTokens: 700,
          totalTokens: 1900
        }
      },
      {
        issueId: "issue_789",
        issueIdentifier: "COL-167",
        state: "Bootstrapping",
        workerHost: "worker-c",
        workspacePath: "/tmp/workspaces/col-167",
        sessionId: "session-167",
        workspace: buildLocalRuntimeWorkspace("/tmp/workspaces/col-167", "worker-c"),
        launchTarget: buildHostPathLaunchTarget("/tmp/workspaces/col-167"),
        turnCount: 2,
        lastEvent: "workspace.bootstrap.failed",
        lastMessage: "Retrying workspace bootstrap",
        startedAt: "2026-03-31T17:25:00.000Z",
        lastEventAt: "2026-03-31T17:26:40.000Z",
        tokens: {
          inputTokens: 70,
          outputTokens: 20,
          totalTokens: 90
        }
      }
    ],
    retrying: [
      {
        issueId: "issue_456",
        issueIdentifier: "COL-166",
        attempt: 2,
        dueAt: "2026-03-31T19:21:00.000Z",
        error: "Upstream rate limit reached.",
        workerHost: "worker-b",
        workspacePath: "/tmp/workspaces/col-166",
        workspace: buildDockerRuntimeWorkspace({
          hostPath: "/tmp/workspaces/col-166",
          runtimePath: "/home/agent/workspace",
          workerHost: "worker-b",
          containerId: "container-166",
          containerName: "symphony-col-166"
        }),
        launchTarget: buildContainerLaunchTarget({
          hostWorkspacePath: "/tmp/workspaces/col-166",
          runtimeWorkspacePath: "/home/agent/workspace",
          containerId: "container-166",
          containerName: "symphony-col-166",
          shell: "sh"
        })
      }
    ],
    codexTotals: {
      inputTokens: 5270,
      outputTokens: 2970,
      totalTokens: 8240,
      secondsRunning: 1_245
    },
    rateLimits: {
      openai: {
        remaining: 3,
        resetAt: "2026-03-31T19:25:00.000Z"
      }
    }
  });
}

export function buildMockRuntimeRefreshResult(): SymphonyRuntimeRefreshResult {
  return buildSymphonyRuntimeRefreshResult({
    requestedAt: new Date().toISOString()
  });
}

export function buildMockIssueListResult(
  input: URLSearchParams
): SymphonyForensicsIssueListResult {
  const filters = buildIssueFilters(input);
  const issues = sortIssues(
    mockIssues.filter((issue) => issueMatchesFilters(issue, filters)),
    filters.sortBy,
    filters.sortDirection
  );

  return {
    issues,
    totals: buildIssueTotals(issues),
    filters,
    facets: {
      outcomes: uniqueValues(
        mockIssues.flatMap((issue) =>
          [issue.latestRunOutcome, issue.latestProblemOutcome, issue.lastCompletedOutcome].filter(
            (value): value is string => value !== null
          )
        )
      ),
      errorClasses: uniqueValues(
        mockIssues
          .map((issue) => issue.latestErrorClass)
          .filter((value): value is string => value !== null)
      )
    }
  };
}

export function buildMockIssueDetailResult(
  issueIdentifier: string,
  input: URLSearchParams
): SymphonyForensicsIssueDetailResult | null {
  const issue = findIssue(issueIdentifier);

  if (!issue) {
    return null;
  }

  const limit = parsePositiveInt(input.get("limit")) ?? 200;
  const runs = (mockRunsByIssueIdentifier[issueIdentifier] ?? []).slice(0, limit);

  return {
    issueIdentifier,
    runs,
    summary: {
      runCount: issue.runCount,
      latestProblemOutcome: issue.latestProblemOutcome,
      lastCompletedOutcome: issue.lastCompletedOutcome
    },
    filters: {
      limit
    }
  };
}

export function buildMockIssueForensicsBundleResult(
  issueIdentifier: string,
  input: URLSearchParams
): SymphonyForensicsIssueForensicsBundleResult | null {
  const issue = findIssue(issueIdentifier);

  if (!issue) {
    return null;
  }

  const filters = buildIssueFilters(input);
  const recentRuns = mockRunsByIssueIdentifier[issueIdentifier] ?? [];
  const timeline = mockTimelineByIssueIdentifier[issueIdentifier] ?? [];
  const runtimeLogs = mockRuntimeLogsByIssueIdentifier[issueIdentifier] ?? [];
  const latestFailureRun = recentRuns.find((run) => run.outcome !== "completed") ?? null;

  return {
    issue,
    recentRuns: recentRuns.slice(0, parsePositiveInt(input.get("recentRunLimit")) ?? 5),
    distributions: {
      outcomes: buildDistribution(recentRuns.map((run) => run.outcome)),
      errorClasses: buildDistribution(recentRuns.map((run) => run.errorClass)),
      timelineEvents: buildDistribution(timeline.map((entry) => entry.eventType))
    },
    latestFailure:
      latestFailureRun === null
        ? null
        : {
            runId: latestFailureRun.runId,
            startedAt: latestFailureRun.startedAt,
            outcome: latestFailureRun.outcome,
            errorClass: latestFailureRun.errorClass,
            errorMessage: latestFailureRun.errorMessage,
            timelineEntries: timeline.slice(0, parsePositiveInt(input.get("timelineLimit")) ?? 10),
            runtimeLogs: runtimeLogs.slice(0, parsePositiveInt(input.get("runtimeLogLimit")) ?? 10)
          },
    timeline: timeline.slice(0, parsePositiveInt(input.get("timelineLimit")) ?? 10),
    runtimeLogs: runtimeLogs.slice(0, parsePositiveInt(input.get("runtimeLogLimit")) ?? 10),
    filters
  };
}

export function buildMockRunDetailResult(
  runId: string
): SymphonyForensicsRunDetailResult | null {
  const issue = mockIssues.find((candidate) =>
    (mockRunsByIssueIdentifier[candidate.issueIdentifier] ?? []).some(
      (run) => run.runId === runId
    )
  );

  if (!issue) {
    return null;
  }

  if (runId === "run_123") {
    return buildSymphonyForensicsRunDetailResult({
      issue: {
        issueId: issue.issueId,
        issueIdentifier: issue.issueIdentifier,
        latestRunStartedAt: issue.latestRunStartedAt,
        latestRunId: issue.latestRunId,
        latestRunStatus: issue.latestRunStatus,
        latestRunOutcome: issue.latestRunOutcome,
        runCount: issue.runCount,
        latestProblemOutcome: issue.latestProblemOutcome,
        lastCompletedOutcome: issue.lastCompletedOutcome,
        insertedAt: issue.insertedAt,
        updatedAt: issue.updatedAt
      }
    });
  }

  const run = (mockRunsByIssueIdentifier[issue.issueIdentifier] ?? []).find(
    (candidate) => candidate.runId === runId
  );

  if (!run) {
    return null;
  }

  const runEndedAt = requireMockTimestamp(run.endedAt, "endedAt", run.runId);
  const runLastEventAt = requireMockTimestamp(
    run.lastEventAt,
    "lastEventAt",
    run.runId
  );

  return buildSymphonyForensicsRunDetailResult({
    issue: {
      issueId: issue.issueId,
      issueIdentifier: issue.issueIdentifier,
      latestRunStartedAt: issue.latestRunStartedAt,
      latestRunId: issue.latestRunId,
      latestRunStatus: issue.latestRunStatus,
      latestRunOutcome: issue.latestRunOutcome,
      runCount: issue.runCount,
      latestProblemOutcome: issue.latestProblemOutcome,
      lastCompletedOutcome: issue.lastCompletedOutcome,
      insertedAt: issue.insertedAt,
      updatedAt: issue.updatedAt
    },
    run: {
      ...run,
      repoStart: {
        branch: `symphony/${issue.issueIdentifier}`
      },
      repoEnd: {
        branch: `symphony/${issue.issueIdentifier}`
      },
      metadata: {
        mocked: true
      },
      insertedAt: run.startedAt,
      updatedAt: runEndedAt
    },
    turns: [
      {
        turnId: `turn_${run.runId}`,
        runId: run.runId,
        turnSequence: 1,
        codexThreadId: null,
        codexTurnId: null,
        codexSessionId: `session_${run.runId}`,
        promptText: `Investigate ${issue.issueIdentifier}`,
        status: "completed",
        startedAt: run.startedAt,
        endedAt: runEndedAt,
        tokens: {},
        metadata: {
          mocked: true
        },
        insertedAt: run.startedAt,
        updatedAt: runEndedAt,
        eventCount: 1,
        events: [
          {
            eventId: `event_${run.runId}`,
            turnId: `turn_${run.runId}`,
            runId: run.runId,
            eventSequence: 1,
            eventType: run.lastEventType ?? "message.output",
            recordedAt: runLastEventAt,
            payload: {
              summary: run.errorMessage ?? "Mock event payload"
            },
            payloadTruncated: false,
            payloadBytes: 64,
            summary: run.errorMessage ?? "Mock event payload",
            codexThreadId: null,
            codexTurnId: null,
            codexSessionId: `session_${run.runId}`,
            insertedAt: runLastEventAt
          }
        ]
      }
    ]
  });
}

export function buildMockRuntimeIssueResult(
  issueIdentifier: string
): SymphonyRuntimeIssueResult | null {
  return mockRuntimeIssueByIdentifier[issueIdentifier] ?? null;
}

export function createMockEnvelope<T>(data: T) {
  return {
    schemaVersion: "1" as const,
    ok: true as const,
    data,
    meta: {
      durationMs: 0,
      generatedAt: new Date().toISOString()
    }
  };
}

function buildIssueFilters(input: URLSearchParams): SymphonyForensicsIssueFilters {
  return {
    limit: parsePositiveInt(input.get("limit")),
    timeRange: parseTimeRange(input.get("timeRange")),
    startedAfter: toNullableString(input.get("startedAfter")),
    startedBefore: toNullableString(input.get("startedBefore")),
    outcome: toNullableString(input.get("outcome")),
    errorClass: toNullableString(input.get("errorClass")),
    hasFlags: parseCsv(input.get("hasFlag")) as SymphonyForensicsIssueFilters["hasFlags"],
    sortBy: parseSortBy(input.get("sortBy")),
    sortDirection: parseSortDirection(input.get("sortDirection"))
  };
}

function issueMatchesFilters(
  issue: SymphonyForensicsIssueSummary,
  filters: SymphonyForensicsIssueFilters
): boolean {
  if (
    filters.outcome &&
    ![issue.latestRunOutcome, issue.latestProblemOutcome, issue.lastCompletedOutcome].includes(
      filters.outcome
    )
  ) {
    return false;
  }

  if (filters.errorClass && issue.latestErrorClass !== filters.errorClass) {
    return false;
  }

  if (filters.hasFlags.some((flag) => !issue.flags.includes(flag))) {
    return false;
  }

  return true;
}

function sortIssues(
  issues: SymphonyForensicsIssueSummary[],
  sortBy: SymphonyForensicsIssueFilters["sortBy"],
  sortDirection: SymphonyForensicsIssueFilters["sortDirection"]
): SymphonyForensicsIssueSummary[] {
  const sorted = [...issues].sort((left, right) => {
    const leftValue = getSortValue(left, sortBy);
    const rightValue = getSortValue(right, sortBy);

    if (leftValue < rightValue) {
      return -1;
    }

    if (leftValue > rightValue) {
      return 1;
    }

    return 0;
  });

  return sortDirection === "desc" ? sorted.reverse() : sorted;
}

function getSortValue(
  issue: SymphonyForensicsIssueSummary,
  sortBy: SymphonyForensicsIssueFilters["sortBy"]
) {
  switch (sortBy) {
    case "problemRate":
      return issue.problemRate;
    case "totalTokens":
      return issue.totalTokens;
    case "retries":
      return issue.retryCount;
    case "runCount":
      return issue.runCount;
    case "avgDuration":
      return issue.avgDurationSeconds;
    case "lastActive":
    default:
      return issue.latestActivityAt ?? "";
  }
}

function buildIssueTotals(issues: SymphonyForensicsIssueSummary[]) {
  return issues.reduce(
    (totals, issue) => ({
      issueCount: totals.issueCount + 1,
      runCount: totals.runCount + issue.runCount,
      completedRunCount: totals.completedRunCount + issue.completedRunCount,
      problemRunCount: totals.problemRunCount + issue.problemRunCount,
      rateLimitedCount: totals.rateLimitedCount + issue.rateLimitedCount,
      maxTurnsCount: totals.maxTurnsCount + issue.maxTurnsCount,
      startupFailureCount: totals.startupFailureCount + issue.startupFailureCount,
      inputTokens: totals.inputTokens + issue.totalInputTokens,
      outputTokens: totals.outputTokens + issue.totalOutputTokens,
      totalTokens: totals.totalTokens + issue.totalTokens
    }),
    {
      issueCount: 0,
      runCount: 0,
      completedRunCount: 0,
      problemRunCount: 0,
      rateLimitedCount: 0,
      maxTurnsCount: 0,
      startupFailureCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0
    }
  );
}

function buildDistribution(values: Array<string | null>) {
  return values.reduce<Record<string, number>>((result, value) => {
    if (!value) {
      return result;
    }

    result[value] = (result[value] ?? 0) + 1;
    return result;
  }, {});
}

function findIssue(issueIdentifier: string) {
  return mockIssues.find((issue) => issue.issueIdentifier === issueIdentifier) ?? null;
}

function parsePositiveInt(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseCsv(value: string | null) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function toNullableString(value: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function uniqueValues(values: string[]) {
  return [...new Set(values)];
}

function parseTimeRange(value: string | null): SymphonyForensicsIssueFilters["timeRange"] {
  if (value === "24h" || value === "7d" || value === "30d") {
    return value;
  }

  return "all";
}

function parseSortBy(value: string | null): SymphonyForensicsIssueFilters["sortBy"] {
  if (
    value === "problemRate" ||
    value === "totalTokens" ||
    value === "retries" ||
    value === "runCount" ||
    value === "avgDuration"
  ) {
    return value;
  }

  return "lastActive";
}

function parseSortDirection(
  value: string | null
): SymphonyForensicsIssueFilters["sortDirection"] {
  return value === "asc" ? "asc" : "desc";
}
