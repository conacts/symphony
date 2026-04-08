import type {
  SymphonyForensicsIssueDetailResult,
  SymphonyForensicsIssueFilters,
  SymphonyForensicsIssueForensicsBundleResult,
  SymphonyForensicsIssueListResult,
  SymphonyForensicsProblemRunsResult,
  SymphonyForensicsIssueSummary,
  SymphonyForensicsIssueTimelineEntry,
  SymphonyForensicsRunDetailResult,
  SymphonyForensicsRunSummary,
  SymphonyRuntimeHealthResult,
  SymphonyRuntimeIssueResult,
  SymphonyRuntimeLogEntry,
  SymphonyRuntimeLogsResult,
  SymphonyRuntimeRefreshResult,
  SymphonyRuntimeStateResult
} from "@symphony/contracts";
import {
  buildSymphonyForensicsProblemRunsResult,
  buildSymphonyForensicsRunDetailResult,
  buildSymphonyRuntimeHealthResult,
  buildSymphonyRuntimeLogsResult,
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

const DEFAULT_REPOSITORY_KEY = "symphony";

const rawMockIssueTemplates = [
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
    latestDeliveryStatus: "completed",
    latestDeliveryReportedAt: "2026-03-31T18:06:00.000Z",
    latestDeliveryRunId: "run_123",
    latestDeliveryPrUrl: "https://github.com/example/repo/pull/165",
    deliveredRunCount: 1,
    retryCount: 2,
    latestRetryAttempt: 3,
    rateLimitedCount: 1,
    maxTurnsCount: 1,
    startupFailureCount: 0,
    totalInputTokens: 6000,
    totalCachedInputTokens: 0,
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
    latestDeliveryStatus: "completed",
    latestDeliveryReportedAt: "2026-03-31T19:06:00.000Z",
    latestDeliveryRunId: "run_455",
    latestDeliveryPrUrl: "https://github.com/example/repo/pull/166",
    deliveredRunCount: 1,
    retryCount: 3,
    latestRetryAttempt: 2,
    rateLimitedCount: 2,
    maxTurnsCount: 0,
    startupFailureCount: 0,
    totalInputTokens: 4200,
    totalCachedInputTokens: 0,
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
    latestDeliveryStatus: null,
    latestDeliveryReportedAt: null,
    latestDeliveryRunId: null,
    latestDeliveryPrUrl: null,
    deliveredRunCount: 0,
    retryCount: 1,
    latestRetryAttempt: 1,
    rateLimitedCount: 0,
    maxTurnsCount: 0,
    startupFailureCount: 2,
    totalInputTokens: 900,
    totalCachedInputTokens: 0,
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
  },
  {
    issueId: "issue_234",
    issueIdentifier: "COL-168",
    latestRunStartedAt: "2026-03-30T16:20:00.000Z",
    latestRunId: "run_234",
    latestRunStatus: "finished",
    latestRunOutcome: "completed",
    runCount: 5,
    completedRunCount: 3,
    problemRunCount: 2,
    problemRate: 0.4,
    latestProblemOutcome: "completed",
    lastCompletedOutcome: "completed",
    latestDeliveryStatus: "completed",
    latestDeliveryReportedAt: "2026-03-30T16:31:00.000Z",
    latestDeliveryRunId: "run_234",
    latestDeliveryPrUrl: "https://github.com/example/repo/pull/168",
    deliveredRunCount: 3,
    retryCount: 1,
    latestRetryAttempt: 2,
    rateLimitedCount: 0,
    maxTurnsCount: 1,
    startupFailureCount: 0,
    totalInputTokens: 9400,
    totalCachedInputTokens: 1800,
    totalOutputTokens: 4100,
    totalTokens: 15300,
    avgDurationSeconds: 360,
    avgTurns: 4.8,
    avgEvents: 11,
    latestErrorClass: "max_turns",
    latestErrorMessage: "Reached max turns before completion.",
    latestActivityAt: "2026-03-30T16:29:00.000Z",
    flags: ["max_turns"],
    insertedAt: "2026-03-30T16:20:00.000Z",
    updatedAt: "2026-03-30T16:29:00.000Z"
  },
  {
    issueId: "issue_345",
    issueIdentifier: "COL-169",
    latestRunStartedAt: "2026-03-29T14:15:00.000Z",
    latestRunId: "run_345",
    latestRunStatus: "retrying",
    latestRunOutcome: "rate_limited",
    runCount: 4,
    completedRunCount: 2,
    problemRunCount: 2,
    problemRate: 0.5,
    latestProblemOutcome: "rate_limited",
    lastCompletedOutcome: "completed",
    latestDeliveryStatus: "completed",
    latestDeliveryReportedAt: "2026-03-29T14:28:00.000Z",
    latestDeliveryRunId: "run_345",
    latestDeliveryPrUrl: "https://github.com/example/repo/pull/169",
    deliveredRunCount: 2,
    retryCount: 2,
    latestRetryAttempt: 2,
    rateLimitedCount: 2,
    maxTurnsCount: 0,
    startupFailureCount: 0,
    totalInputTokens: 8600,
    totalCachedInputTokens: 1400,
    totalOutputTokens: 3600,
    totalTokens: 13600,
    avgDurationSeconds: 305,
    avgTurns: 4.1,
    avgEvents: 10,
    latestErrorClass: "rate_limit_exceeded",
    latestErrorMessage: "Upstream rate limit reached.",
    latestActivityAt: "2026-03-29T14:20:00.000Z",
    flags: ["rate_limited", "many_retries"],
    insertedAt: "2026-03-29T14:15:00.000Z",
    updatedAt: "2026-03-29T14:20:00.000Z"
  }
] satisfies Array<Omit<SymphonyForensicsIssueSummary, "repositoryKey">>;

const rawMockIssues = [
  ...rawMockIssueTemplates,
  ...rawMockIssueTemplates.map((issue, index) => {
    const issueNumber = 170 + index;
    const shiftedStart = new Date(
      Date.parse(issue.latestRunStartedAt) - (index + 1) * 24 * 60 * 60 * 1000
    ).toISOString();
    const shiftedActivity = new Date(
      Date.parse(issue.latestActivityAt) - (index + 1) * 24 * 60 * 60 * 1000
    ).toISOString();

    return {
      ...issue,
      issueId: `issue_${issueNumber}`,
      issueIdentifier: `COL-${issueNumber}`,
      latestRunStartedAt: shiftedStart,
      latestRunId: `run_${issueNumber}`,
      latestDeliveryReportedAt:
        issue.latestDeliveryReportedAt === null ? null : shiftedActivity,
      latestDeliveryRunId:
        issue.latestDeliveryRunId === null ? null : `run_${issueNumber}`,
      latestDeliveryPrUrl:
        issue.latestDeliveryPrUrl === null
          ? null
          : `https://github.com/example/repo/pull/${issueNumber}`,
      latestActivityAt: shiftedActivity,
      insertedAt: shiftedStart,
      updatedAt: shiftedActivity
    };
  })
] satisfies Array<Omit<SymphonyForensicsIssueSummary, "repositoryKey">>;

const mockIssues: SymphonyForensicsIssueSummary[] = rawMockIssues.map((issue) => ({
  ...issue,
  repositoryKey: DEFAULT_REPOSITORY_KEY
}));

function withMockAgentRunSummary(
  run: Omit<
    SymphonyForensicsRunSummary,
    | "agentHarness"
    | "agentStatus"
    | "model"
    | "agentFailureKind"
    | "agentFailureOrigin"
    | "agentFailureMessagePreview"
    | "cachedInputTokens"
    | "repositoryKey"
    | "machineLoad"
    | "deliveryStatus"
    | "deliveryReportedAt"
    | "deliveryPrUrl"
  >
): SymphonyForensicsRunSummary {
  return {
    ...run,
    repositoryKey: DEFAULT_REPOSITORY_KEY,
    agentHarness: "pi",
    model: "xiaomi/mimo-v2-pro",
    agentStatus:
      run.status === "retrying"
        ? "failed"
        : run.outcome === "completed"
          ? "completed"
          : "failed",
    agentFailureKind:
      run.outcome === "completed" ? null : run.errorClass ?? run.outcome,
    agentFailureOrigin: run.outcome === "completed" ? null : "runtime",
    agentFailureMessagePreview: run.errorMessage,
    cachedInputTokens: 0,
    deliveryStatus: run.outcome === "completed" ? "completed" : null,
    deliveryReportedAt:
      run.outcome === "completed" ? "2026-03-31T18:06:00.000Z" : null,
    deliveryPrUrl:
      run.outcome === "completed"
        ? `https://github.com/example/repo/pull/${run.issueIdentifier.replace("COL-", "")}`
        : null,
    machineLoad: {
      sampleCount: 6,
      maxCpuPercent: run.outcome === "completed" ? 67 : 88,
      avgCpuPercent: run.outcome === "completed" ? 52 : 69,
      maxMemoryPercent: run.outcome === "completed" ? 64 : 82,
      avgMemoryPercent: run.outcome === "completed" ? 58 : 75,
      maxDiskPercent: 47,
      avgDiskPercent: 47,
      hadHighCpu: run.outcome !== "completed",
      hadHighMemory: run.outcome !== "completed",
      hadHighDisk: false
    }
  };
}

const mockRunsByIssueIdentifier: Record<string, SymphonyForensicsRunSummary[]> = {
  "COL-165": [
    withMockAgentRunSummary({
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
    }),
    withMockAgentRunSummary({
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
    }),
    withMockAgentRunSummary({
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
    })
  ],
  "COL-166": [
    withMockAgentRunSummary({
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
    }),
    withMockAgentRunSummary({
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
    })
  ],
  "COL-167": [
    withMockAgentRunSummary({
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
    }),
    withMockAgentRunSummary({
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
    })
  ],
  "COL-168": [
    withMockAgentRunSummary({
      runId: "run_234",
      issueId: "issue_234",
      issueIdentifier: "COL-168",
      attempt: 3,
      status: "finished",
      outcome: "completed",
      workerHost: "worker-d",
      workspacePath: "/tmp/workspaces/col-168",
      startedAt: "2026-03-30T16:20:00.000Z",
      endedAt: "2026-03-30T16:31:00.000Z",
      commitHashStart: "kkk111",
      commitHashEnd: "lll222",
      turnCount: 7,
      eventCount: 13,
      lastEventType: "message.output",
      lastEventAt: "2026-03-30T16:31:00.000Z",
      durationSeconds: 660,
      errorClass: null,
      errorMessage: null,
      inputTokens: 3400,
      outputTokens: 1500,
      totalTokens: 4900
    }),
    withMockAgentRunSummary({
      runId: "run_233",
      issueId: "issue_234",
      issueIdentifier: "COL-168",
      attempt: 2,
      status: "finished",
      outcome: "max_turns",
      workerHost: "worker-d",
      workspacePath: "/tmp/workspaces/col-168",
      startedAt: "2026-03-30T15:55:00.000Z",
      endedAt: "2026-03-30T16:03:00.000Z",
      commitHashStart: "mmm333",
      commitHashEnd: "nnn444",
      turnCount: 9,
      eventCount: 18,
      lastEventType: "agent.max_turns",
      lastEventAt: "2026-03-30T16:03:00.000Z",
      durationSeconds: 480,
      errorClass: "max_turns",
      errorMessage: "Reached max turns before completion.",
      inputTokens: 2600,
      outputTokens: 1100,
      totalTokens: 3700
    })
  ],
  "COL-169": [
    withMockAgentRunSummary({
      runId: "run_345",
      issueId: "issue_345",
      issueIdentifier: "COL-169",
      attempt: 2,
      status: "retrying",
      outcome: "rate_limited",
      workerHost: "worker-e",
      workspacePath: "/tmp/workspaces/col-169",
      startedAt: "2026-03-29T14:15:00.000Z",
      endedAt: "2026-03-29T14:20:00.000Z",
      commitHashStart: "ooo555",
      commitHashEnd: "ppp666",
      turnCount: 5,
      eventCount: 10,
      lastEventType: "upstream.rate_limit",
      lastEventAt: "2026-03-29T14:20:00.000Z",
      durationSeconds: 300,
      errorClass: "rate_limit_exceeded",
      errorMessage: "Upstream rate limit reached.",
      inputTokens: 2800,
      outputTokens: 900,
      totalTokens: 3700
    }),
    withMockAgentRunSummary({
      runId: "run_344",
      issueId: "issue_345",
      issueIdentifier: "COL-169",
      attempt: 1,
      status: "finished",
      outcome: "completed",
      workerHost: "worker-e",
      workspacePath: "/tmp/workspaces/col-169",
      startedAt: "2026-03-29T13:40:00.000Z",
      endedAt: "2026-03-29T13:51:00.000Z",
      commitHashStart: "qqq777",
      commitHashEnd: "rrr888",
      turnCount: 6,
      eventCount: 12,
      lastEventType: "message.output",
      lastEventAt: "2026-03-29T13:51:00.000Z",
      durationSeconds: 660,
      errorClass: null,
      errorMessage: null,
      inputTokens: 3200,
      outputTokens: 1500,
      totalTokens: 4700
    })
  ]
};

const mockRuntimeIssueByIdentifier: Record<string, SymphonyRuntimeIssueResult> = {
  "COL-165": buildSymphonyRuntimeIssueResult({
    issueIdentifier: "COL-165",
    issueId: "issue_123",
    workspace: buildRuntimeWorkspace("/tmp/workspaces/col-165", "worker-a"),
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
      launchTarget: buildBindMountLaunchTarget("/tmp/workspaces/col-165"),
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
      runtimePath: "/workspace",
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
        hostLaunchPath: "/tmp/workspaces/col-166",
        hostWorkspacePath: "/tmp/workspaces/col-166",
        runtimeWorkspacePath: "/workspace",
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
    workspace: buildRuntimeWorkspace("/tmp/workspaces/col-167", "worker-c"),
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
      launchTarget: buildBindMountLaunchTarget("/tmp/workspaces/col-167"),
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
  }),
  "COL-168": buildSymphonyRuntimeIssueResult({
    issueIdentifier: "COL-168",
    issueId: "issue_234",
    workspace: buildRuntimeWorkspace("/tmp/workspaces/col-168", "worker-d"),
    tracked: {
      title: "Broaden delivery trend visibility",
      state: "In Progress",
      branchName: "symphony/COL-168",
      url: "https://linear.app/coldets/issue/COL-168/broaden-delivery-trend-visibility",
      projectName: "Symphony",
      projectSlug: "symphony",
      teamKey: "COL"
    },
    running: {
      workerHost: "worker-d",
      workspacePath: "/tmp/workspaces/col-168",
      sessionId: "session-168",
      launchTarget: buildBindMountLaunchTarget("/tmp/workspaces/col-168"),
      turnCount: 7,
      state: "In Progress",
      startedAt: "2026-03-30T16:20:00.000Z",
      lastEvent: "message.output",
      lastMessage: "Preparing final summary",
      lastEventAt: "2026-03-30T16:30:00.000Z",
      tokens: {
        inputTokens: 1450,
        outputTokens: 780,
        totalTokens: 2230
      }
    }
  }),
  "COL-169": buildSymphonyRuntimeIssueResult({
    issueIdentifier: "COL-169",
    issueId: "issue_345",
    status: "retrying",
    workspace: buildDockerRuntimeWorkspace({
      hostPath: "/tmp/workspaces/col-169",
      runtimePath: "/workspace",
      workerHost: "worker-e",
      containerId: "container-169",
      containerName: "symphony-col-169"
    }),
    attempts: {
      restartCount: 1,
      currentRetryAttempt: 2
    },
    running: null,
    retry: {
      attempt: 2,
      dueAt: "2026-03-29T14:28:00.000Z",
      error: "Upstream rate limit reached.",
      workerHost: "worker-e",
      workspacePath: "/tmp/workspaces/col-169",
      launchTarget: buildContainerLaunchTarget({
        hostLaunchPath: "/tmp/workspaces/col-169",
        hostWorkspacePath: "/tmp/workspaces/col-169",
        runtimeWorkspacePath: "/workspace",
        containerId: "container-169",
        containerName: "symphony-col-169",
        shell: "sh"
      })
    },
    lastError: "Upstream rate limit reached.",
    tracked: {
      title: "Reduce repeated upstream throttling",
      state: "Blocked",
      branchName: "symphony/COL-169",
      url: "https://linear.app/coldets/issue/COL-169/reduce-repeated-upstream-throttling",
      projectName: "Symphony",
      projectSlug: "symphony",
      teamKey: "COL"
    }
  })
};

function buildRuntimeWorkspace(
  path: string,
  workerHost: string
): SymphonyRuntimeIssueResult["workspace"] {
  return {
    backendKind: "docker",
    workerHost,
    prepareDisposition: "reused",
    executionTargetKind: "container",
    materializationKind: "bind_mount",
    hostRepoMetadataAvailable: true,
    containerDisposition: "reused",
    networkDisposition: "reused",
    hostPath: path,
    runtimePath: "/workspace",
    containerId: "container-local",
    containerName: "symphony-local",
    networkName: "symphony-network-local",
    services: [],
    envBundleSummary: buildAmbientEnvBundleSummary(),
    manifestLifecycle: null,
    path: null,
    executionTarget: {
      kind: "container",
      workspacePath: "/workspace",
      containerId: "container-local",
      containerName: "symphony-local",
      hostPath: path
    },
    materialization: {
      kind: "bind_mount",
      hostPath: path,
      containerPath: "/workspace"
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
    hostRepoMetadataAvailable: true,
    containerDisposition: "reused",
    networkDisposition: "reused",
    hostPath: input.hostPath,
    runtimePath: input.runtimePath,
    containerId: input.containerId,
    containerName: input.containerName,
    networkName: `symphony-network-${input.containerName}`,
    services: [],
    envBundleSummary: buildAmbientEnvBundleSummary(),
    manifestLifecycle: null,
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

function buildAmbientEnvBundleSummary(): NonNullable<
  SymphonyRuntimeIssueResult["workspace"]
>["envBundleSummary"] {
  return {
    source: "ambient",
    injectedKeys: [],
    requiredHostKeys: [],
    optionalHostKeys: [],
    repoEnvPath: null,
    projectedRepoKeys: [],
    requiredRepoKeys: [],
    optionalRepoKeys: [],
    staticBindingKeys: [],
    runtimeBindingKeys: [],
    serviceBindingKeys: []
  };
}

function buildBindMountLaunchTarget(
  path: string
): NonNullable<SymphonyRuntimeIssueResult["running"]>["launchTarget"] {
  return {
    kind: "container",
    hostLaunchPath: path,
    hostWorkspacePath: path,
    runtimeWorkspacePath: "/workspace",
    containerId: "container-local",
    containerName: "symphony-local",
    shell: "sh"
  };
}

function buildContainerLaunchTarget(input: {
  hostLaunchPath: string;
  hostWorkspacePath: string;
  runtimeWorkspacePath: string;
  containerId: string;
  containerName: string;
  shell: string;
}): NonNullable<SymphonyRuntimeIssueResult["running"]>["launchTarget"] {
  return {
    kind: "container",
    hostLaunchPath: input.hostLaunchPath,
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
      repositoryKey: DEFAULT_REPOSITORY_KEY,
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
      repositoryKey: DEFAULT_REPOSITORY_KEY,
      level: "warn",
      source: "agent",
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
      repositoryKey: DEFAULT_REPOSITORY_KEY,
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
      repositoryKey: DEFAULT_REPOSITORY_KEY,
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
      repositoryKey: DEFAULT_REPOSITORY_KEY,
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
      repositoryKey: DEFAULT_REPOSITORY_KEY,
      issueId: "issue_123",
      issueIdentifier: "COL-165",
      runId: "run_123",
      turnId: "turn_123",
      source: "agent",
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
      repositoryKey: DEFAULT_REPOSITORY_KEY,
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
      repositoryKey: DEFAULT_REPOSITORY_KEY,
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
      running: 3,
      retrying: 2
    },
    running: [
      {
        issueId: "issue_123",
        issueIdentifier: "COL-165",
        state: "In Progress",
        workerHost: "worker-a",
        workspacePath: "/tmp/workspaces/col-165",
        sessionId: "session-165",
        workspace: buildRuntimeWorkspace("/tmp/workspaces/col-165", "worker-a"),
        launchTarget: buildBindMountLaunchTarget("/tmp/workspaces/col-165"),
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
        workspace: buildRuntimeWorkspace("/tmp/workspaces/col-167", "worker-c"),
        launchTarget: buildBindMountLaunchTarget("/tmp/workspaces/col-167"),
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
      },
      {
        issueId: "issue_234",
        issueIdentifier: "COL-168",
        state: "In Progress",
        workerHost: "worker-d",
        workspacePath: "/tmp/workspaces/col-168",
        sessionId: "session-168",
        workspace: buildRuntimeWorkspace("/tmp/workspaces/col-168", "worker-d"),
        launchTarget: buildBindMountLaunchTarget("/tmp/workspaces/col-168"),
        turnCount: 7,
        lastEvent: "message.output",
        lastMessage: "Preparing final summary",
        startedAt: "2026-03-30T16:20:00.000Z",
        lastEventAt: "2026-03-30T16:30:00.000Z",
        tokens: {
          inputTokens: 1450,
          outputTokens: 780,
          totalTokens: 2230
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
          runtimePath: "/workspace",
          workerHost: "worker-b",
          containerId: "container-166",
          containerName: "symphony-col-166"
        }),
        launchTarget: buildContainerLaunchTarget({
          hostLaunchPath: "/tmp/workspaces/col-166",
          hostWorkspacePath: "/tmp/workspaces/col-166",
          runtimeWorkspacePath: "/workspace",
          containerId: "container-166",
          containerName: "symphony-col-166",
          shell: "sh"
        })
      },
      {
        issueId: "issue_345",
        issueIdentifier: "COL-169",
        attempt: 2,
        dueAt: "2026-03-29T14:28:00.000Z",
        error: "Upstream rate limit reached.",
        workerHost: "worker-e",
        workspacePath: "/tmp/workspaces/col-169",
        workspace: buildDockerRuntimeWorkspace({
          hostPath: "/tmp/workspaces/col-169",
          runtimePath: "/workspace",
          workerHost: "worker-e",
          containerId: "container-169",
          containerName: "symphony-col-169"
        }),
        launchTarget: buildContainerLaunchTarget({
          hostLaunchPath: "/tmp/workspaces/col-169",
          hostWorkspacePath: "/tmp/workspaces/col-169",
          runtimeWorkspacePath: "/workspace",
          containerId: "container-169",
          containerName: "symphony-col-169",
          shell: "sh"
        })
      }
    ],
    agentTotals: {
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

export function buildMockRuntimeHealthResult(): SymphonyRuntimeHealthResult {
  return buildSymphonyRuntimeHealthResult({
    poller: {
      ...buildSymphonyRuntimeHealthResult().poller,
      lastStartedAt: new Date(Date.now() - 5_000).toISOString(),
      lastCompletedAt: new Date(Date.now() - 4_000).toISOString(),
      lastSucceededAt: new Date(Date.now() - 4_000).toISOString()
    }
  });
}

export function buildMockRuntimeLogsResult(
  input: URLSearchParams
): SymphonyRuntimeLogsResult {
  const issueIdentifier = input.get("issueIdentifier");
  const limit = parsePositiveInt(input.get("limit")) ?? 200;
  const allLogs = issueIdentifier
    ? (mockRuntimeLogsByIssueIdentifier[issueIdentifier] ?? [])
    : Object.values(mockRuntimeLogsByIssueIdentifier).flat();

  return buildSymphonyRuntimeLogsResult({
    logs: allLogs
      .slice()
      .sort((left, right) => compareTimestamps(right.recordedAt, left.recordedAt))
      .slice(0, limit),
    filters: {
      limit,
      repo: null,
      issueIdentifier
    }
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
      repositories: uniqueValues(mockIssues.map((issue) => issue.repositoryKey)),
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
    repositoryKey: issue.repositoryKey,
    issueIdentifier,
    runs,
    summary: {
      runCount: issue.runCount,
      latestProblemOutcome: issue.latestProblemOutcome,
      lastCompletedOutcome: issue.lastCompletedOutcome,
      latestDeliveryStatus: issue.latestDeliveryStatus,
      latestDeliveryReportedAt: issue.latestDeliveryReportedAt,
      latestDeliveryPrUrl: issue.latestDeliveryPrUrl,
      deliveredRunCount: issue.deliveredRunCount
    },
    filters: {
      limit,
      repo: null
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
    repositoryKey: issue.repositoryKey,
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

export function buildMockProblemRunsResult(
  input: URLSearchParams
): SymphonyForensicsProblemRunsResult {
  const limit = parsePositiveInt(input.get("limit")) ?? 200;
  const issueIdentifier = input.get("issueIdentifier");
  const outcome = input.get("outcome");
  const runs = Object.values(mockRunsByIssueIdentifier)
    .flat()
    .filter((run) => run.outcome !== "completed")
    .filter((run) =>
      issueIdentifier ? run.issueIdentifier === issueIdentifier : true
    )
    .filter((run) => (outcome ? run.outcome === outcome : true))
    .sort((left, right) => compareTimestamps(right.startedAt, left.startedAt))
    .slice(0, limit);

  const problemSummary = runs.reduce<Record<string, number>>((accumulator, run) => {
    const key = run.outcome ?? "unknown";
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});

  return buildSymphonyForensicsProblemRunsResult({
    problemRuns: runs,
    problemSummary,
    filters: {
      repo: null,
      outcome,
      issueIdentifier,
      limit
    }
  });
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
        repositoryKey: issue.repositoryKey,
        issueId: issue.issueId,
        issueIdentifier: issue.issueIdentifier,
        latestRunStartedAt: issue.latestRunStartedAt,
        latestRunId: issue.latestRunId,
        latestRunStatus: issue.latestRunStatus,
        latestRunOutcome: issue.latestRunOutcome,
        runCount: issue.runCount,
        latestProblemOutcome: issue.latestProblemOutcome,
        lastCompletedOutcome: issue.lastCompletedOutcome,
        latestDeliveryStatus: issue.latestDeliveryStatus,
        latestDeliveryReportedAt: issue.latestDeliveryReportedAt,
        latestDeliveryRunId: issue.latestDeliveryRunId,
        latestDeliveryPrUrl: issue.latestDeliveryPrUrl,
        deliveredRunCount: issue.deliveredRunCount,
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
      repositoryKey: issue.repositoryKey,
      issueId: issue.issueId,
      issueIdentifier: issue.issueIdentifier,
      latestRunStartedAt: issue.latestRunStartedAt,
      latestRunId: issue.latestRunId,
      latestRunStatus: issue.latestRunStatus,
      latestRunOutcome: issue.latestRunOutcome,
      runCount: issue.runCount,
      latestProblemOutcome: issue.latestProblemOutcome,
      lastCompletedOutcome: issue.lastCompletedOutcome,
      latestDeliveryStatus: issue.latestDeliveryStatus,
      latestDeliveryReportedAt: issue.latestDeliveryReportedAt,
      latestDeliveryRunId: issue.latestDeliveryRunId,
      latestDeliveryPrUrl: issue.latestDeliveryPrUrl,
      deliveredRunCount: issue.deliveredRunCount,
      insertedAt: issue.insertedAt,
      updatedAt: issue.updatedAt
    },
    run: {
      ...run,
      threadId: `thread_${run.runId}`,
      processId: `process_${run.runId}`,
      providerId: "openrouter",
      providerName: "OpenRouter",
      reasoningEffort: "high",
      profile: "mimo-v2-pro",
      authMode: "api_key_env",
      providerEnvKey: "OPENROUTER_API_KEY",
      launchTarget: {
        kind: "container",
        hostLaunchPath: `/tmp/workspaces/${issue.issueIdentifier.toLowerCase()}`,
        hostWorkspacePath: `/tmp/workspaces/${issue.issueIdentifier.toLowerCase()}`,
        runtimeWorkspacePath: "/workspace",
        containerId: `container_${run.runId}`,
        containerName: `symphony-${issue.issueIdentifier.toLowerCase()}`,
        shell: "sh"
      },
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
        threadId: null,
        agentTurnId: null,
        sessionId: `session_${run.runId}`,
        promptText: `Investigate ${issue.issueIdentifier}`,
        status: "completed",
        startedAt: run.startedAt,
        endedAt: runEndedAt,
        usage: {
          input_tokens: run.inputTokens,
          cached_input_tokens: 0,
          output_tokens: run.outputTokens
        },
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
            eventType: "error",
            itemType: null,
            itemStatus: null,
            recordedAt: runLastEventAt,
            payload: {
              type: "error",
              message: run.errorMessage ?? "Mock event payload"
            },
            payloadTruncated: false,
            payloadBytes: 64,
            summary: run.errorMessage ?? "Mock event payload",
            threadId: null,
            agentTurnId: null,
            sessionId: `session_${run.runId}`,
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
    repo: toNullableString(input.get("repo")),
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
  if (filters.repo && issue.repositoryKey !== filters.repo) {
    return false;
  }

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

function compareTimestamps(
  left: string | null | undefined,
  right: string | null | undefined
): number {
  const leftTime = left ? Date.parse(left) : Number.NaN;
  const rightTime = right ? Date.parse(right) : Number.NaN;

  if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
    return 0;
  }

  if (Number.isNaN(leftTime)) {
    return -1;
  }

  if (Number.isNaN(rightTime)) {
    return 1;
  }

  return leftTime - rightTime;
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

function buildIssueTotals(
  issues: SymphonyForensicsIssueSummary[]
): SymphonyForensicsIssueListResult["totals"] {
  return issues.reduce<SymphonyForensicsIssueListResult["totals"]>(
    (totals, issue) => ({
      issueCount: totals.issueCount + 1,
      runCount: totals.runCount + issue.runCount,
      completedRunCount: totals.completedRunCount + issue.completedRunCount,
      problemRunCount: totals.problemRunCount + issue.problemRunCount,
      rateLimitedCount: totals.rateLimitedCount + issue.rateLimitedCount,
      maxTurnsCount: totals.maxTurnsCount + issue.maxTurnsCount,
      startupFailureCount: totals.startupFailureCount + issue.startupFailureCount,
      inputTokens: totals.inputTokens + issue.totalInputTokens,
      cachedInputTokens: totals.cachedInputTokens + issue.totalCachedInputTokens,
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
      cachedInputTokens: 0,
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
