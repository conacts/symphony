import type {
  SymphonyAgentOverflowResult,
  SymphonyAgentRunArtifactsResult,
  SymphonyForensicsIssueDetailResult,
  SymphonyForensicsIssueForensicsBundleResult,
  SymphonyForensicsIssueListResult,
  SymphonyForensicsProblemRunsResult,
  SymphonyForensicsRunDetailResult,
  SymphonyForensicsSuccessMetricsResult,
  SymphonyRuntimeHealthResult,
  SymphonyRuntimeIssueResult,
  SymphonyRuntimeLogsResult,
  SymphonyRuntimeRefreshResult,
  SymphonyRuntimeLogEntry,
  SymphonyRuntimeStateResult
} from "@symphony/contracts";

const DEFAULT_REPOSITORY_KEY = "symphony";

export function buildSymphonyRuntimeStateResult(
  overrides: Partial<Omit<SymphonyRuntimeStateResult, "running" | "retrying">> & {
    running?: Array<Partial<SymphonyRuntimeStateResult["running"][number]>>;
    retrying?: Array<Partial<SymphonyRuntimeStateResult["retrying"][number]>>;
  } = {}
): SymphonyRuntimeStateResult {
  type RuntimeRunningEntry = SymphonyRuntimeStateResult["running"][number];
  type RuntimeRetryEntry = SymphonyRuntimeStateResult["retrying"][number];
  type RuntimeWorkspace = NonNullable<RuntimeRunningEntry["workspace"]>;
  type RuntimeLaunchTarget = NonNullable<RuntimeRunningEntry["launchTarget"]>;
  type RetryLaunchTarget = NonNullable<RuntimeRetryEntry["launchTarget"]>;

  const defaultDockerWorkspace: RuntimeWorkspace = {
    backendKind: "docker",
    workerHost: "worker-b",
    prepareDisposition: "reused",
    executionTargetKind: "container",
    materializationKind: "bind_mount",
    hostRepoMetadataAvailable: true,
    containerDisposition: "reused",
    networkDisposition: "reused",
    hostPath: "/tmp/workspaces/col-166",
    runtimePath: "/workspace",
    containerId: "container-166",
    containerName: "symphony-col-166",
    networkName: "symphony-network-col-166",
    services: [
      {
        key: "postgres",
        type: "postgres",
        hostname: "postgres",
        port: 5432,
        containerId: "postgres-166",
        containerName: "symphony-service-postgres-col-166",
        disposition: "reused"
      }
    ],
    envBundleSummary: {
      source: "manifest",
      injectedKeys: ["DATABASE_URL", "OPENAI_API_KEY", "PGHOST"],
      requiredHostKeys: ["OPENAI_API_KEY"],
      optionalHostKeys: [],
      repoEnvPath: null,
      projectedRepoKeys: [],
      requiredRepoKeys: [],
      optionalRepoKeys: [],
      staticBindingKeys: [],
      runtimeBindingKeys: [],
      serviceBindingKeys: ["DATABASE_URL", "PGHOST"]
    },
    manifestLifecycle: null,
    path: null,
    executionTarget: {
      kind: "container",
      workspacePath: "/workspace",
      containerId: "container-166",
      containerName: "symphony-col-166",
      hostPath: "/tmp/workspaces/col-166"
    },
    materialization: {
      kind: "bind_mount",
      hostPath: "/tmp/workspaces/col-166",
      containerPath: "/workspace"
    }
  };

  const defaultRunningWorkspace: RuntimeWorkspace = {
    ...defaultDockerWorkspace,
    hostPath: "/tmp/workspaces/col-165",
    runtimePath: "/workspace",
    containerId: "container-165",
    containerName: "symphony-col-165",
    networkName: "symphony-network-col-165",
    executionTarget: {
      kind: "container",
      workspacePath: "/workspace",
      containerId: "container-165",
      containerName: "symphony-col-165",
      hostPath: "/tmp/workspaces/col-165"
    },
    materialization: {
      kind: "bind_mount",
      hostPath: "/tmp/workspaces/col-165",
      containerPath: "/workspace"
    }
  };

  const defaultRunningLaunchTarget: RuntimeLaunchTarget = {
    kind: "container",
    hostLaunchPath: "/tmp/workspaces/col-165",
    hostWorkspacePath: "/tmp/workspaces/col-165",
    runtimeWorkspacePath: "/workspace",
    containerId: "container-165",
    containerName: "symphony-col-165",
    shell: "sh"
  };

  const defaultRetryLaunchTarget: RetryLaunchTarget = {
    kind: "container",
    hostLaunchPath: "/tmp/workspaces/col-166",
    hostWorkspacePath: "/tmp/workspaces/col-166",
    runtimeWorkspacePath: "/workspace",
    containerId: "container-166",
    containerName: "symphony-col-166",
    shell: "sh"
  };

  const running = (overrides.running ?? [
    {
      trackerIssueId: "issue_123",
      issueIdentifier: "COL-165",
      state: "In Progress",
      workerHost: "worker-b",
      workspacePath: "/tmp/workspaces/col-165",
      threadId: "thread_123",
      workspace: defaultRunningWorkspace,
      launchTarget: defaultRunningLaunchTarget,
      turnCount: 4,
      lastEvent: "message.output",
      lastMessage: "Runtime view updated",
      startedAt: "2026-03-31T18:00:00.000Z",
      lastEventAt: "2026-03-31T18:01:00.000Z",
      tokens: {
        inputTokens: 120,
        outputTokens: 80,
        totalTokens: 200
      }
    }
  ]).map((entry): RuntimeRunningEntry => ({
    trackerIssueId: "issue_123",
    issueIdentifier: "COL-165",
    state: "In Progress",
    workerHost: "worker-b",
    workspacePath: "/tmp/workspaces/col-165",
    threadId: "thread_123",
    turnCount: 4,
    lastEvent: "message.output",
    lastMessage: "Runtime view updated",
    startedAt: "2026-03-31T18:00:00.000Z",
    lastEventAt: "2026-03-31T18:01:00.000Z",
    tokens: {
      inputTokens: 120,
      outputTokens: 80,
      totalTokens: 200
    },
    ...entry,
    workspace:
      entry.workspace === undefined
        ? { ...defaultRunningWorkspace }
        : entry.workspace,
    launchTarget:
      entry.launchTarget === undefined
        ? { ...defaultRunningLaunchTarget }
        : entry.launchTarget
  }));

  const retrying = (overrides.retrying ?? [
    {
      trackerIssueId: "issue_456",
      issueIdentifier: "COL-166",
      attempt: 2,
      dueAt: "2026-03-31T18:05:00.000Z",
      error: "Worker disconnected",
      workerHost: "worker-b",
      workspacePath: "/tmp/workspaces/col-166",
      workspace: defaultDockerWorkspace,
      launchTarget: defaultRetryLaunchTarget
    }
  ]).map((entry): RuntimeRetryEntry => ({
    trackerIssueId: "issue_456",
    issueIdentifier: "COL-166",
    attempt: 2,
    dueAt: "2026-03-31T18:05:00.000Z",
    error: "Worker disconnected",
    workerHost: "worker-b",
    workspacePath: "/tmp/workspaces/col-166",
    ...entry,
    workspace:
      entry.workspace === undefined
        ? { ...defaultDockerWorkspace }
        : entry.workspace,
    launchTarget:
      entry.launchTarget === undefined
        ? { ...defaultRetryLaunchTarget }
        : entry.launchTarget
  }));

  return {
    counts: {
      running: running.length,
      retrying: retrying.length
    },
    running,
    retrying,
    agentTotals: {
      inputTokens: running.reduce((sum, entry) => sum + entry.tokens.inputTokens, 0),
      outputTokens: running.reduce((sum, entry) => sum + entry.tokens.outputTokens, 0),
      totalTokens: running.reduce((sum, entry) => sum + entry.tokens.totalTokens, 0),
      secondsRunning: running.length * 95
    },
    rateLimits: {
      remaining: Math.max(0, 7 - retrying.length)
    },
    ...Object.fromEntries(
      Object.entries(overrides).filter(
        ([key]) => key !== "running" && key !== "retrying"
      )
    )
  };
}

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
  overrides: Partial<
    Omit<SymphonyRuntimeIssueResult, "workspace" | "running" | "retry">
  > & {
    workspace?: Partial<SymphonyRuntimeIssueResult["workspace"]>;
    running?: Partial<NonNullable<SymphonyRuntimeIssueResult["running"]>> | null;
    retry?: Partial<NonNullable<SymphonyRuntimeIssueResult["retry"]>> | null;
  } = {}
): SymphonyRuntimeIssueResult {
  const defaultWorkspace: SymphonyRuntimeIssueResult["workspace"] = {
    backendKind: "docker",
    workerHost: "worker-b",
    prepareDisposition: "reused",
    executionTargetKind: "container",
    materializationKind: "bind_mount",
    hostRepoMetadataAvailable: true,
    containerDisposition: "reused",
    networkDisposition: "reused",
    hostPath: "/tmp/symphony-COL-167",
    runtimePath: "/workspace",
    containerId: "container-167",
    containerName: "symphony-col-167",
    networkName: "symphony-network-col-167",
    services: [],
    envBundleSummary: {
      source: "ambient",
      injectedKeys: ["LINEAR_API_KEY"],
      requiredHostKeys: [],
      optionalHostKeys: [],
      repoEnvPath: null,
      projectedRepoKeys: [],
      requiredRepoKeys: [],
      optionalRepoKeys: [],
      staticBindingKeys: [],
      runtimeBindingKeys: [],
      serviceBindingKeys: []
    },
    manifestLifecycle: null,
    path: null,
    executionTarget: {
      kind: "container",
      workspacePath: "/workspace",
      containerId: "container-167",
      containerName: "symphony-col-167",
      hostPath: "/tmp/symphony-COL-167"
    },
    materialization: {
      kind: "bind_mount",
      hostPath: "/tmp/symphony-COL-167",
      containerPath: "/workspace"
    }
  };

  const defaultRunning: NonNullable<SymphonyRuntimeIssueResult["running"]> = {
    workerHost: "worker-b",
    workspacePath: "/tmp/symphony-COL-167",
    threadId: "thread-167",
    launchTarget: {
      kind: "container",
      hostLaunchPath: "/tmp/symphony-COL-167",
      hostWorkspacePath: "/tmp/symphony-COL-167",
      runtimeWorkspacePath: "/workspace",
      containerId: "container-167",
      containerName: "symphony-col-167",
      shell: "sh"
    },
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
  };

  return {
    issueIdentifier: "COL-167",
    trackerIssueId: "issue-167",
    status: "running",
    workspace: {
      ...defaultWorkspace,
      ...overrides.workspace
    },
    attempts: {
      restartCount: 0,
      currentRetryAttempt: 0
    },
    running:
      overrides.running === null
        ? null
        : {
            ...defaultRunning,
            ...overrides.running
          },
    retry:
      overrides.retry === null
        ? null
        : overrides.retry === undefined
          ? null
          : {
              attempt: 1,
              dueAt: "2026-03-31T18:05:00.000Z",
              error: null,
              workerHost: "worker-b",
              workspacePath: "/tmp/symphony-COL-167",
              launchTarget: null,
              ...overrides.retry
            },
    lastError: null,
    tracked: {
      title: "Preserve refresh and requeue parity",
      state: "In Progress",
      branchName: "symphony/COL-167",
      url: "https://linear.app/coldets/issue/COL-167/refresh-and-requeue",
      projectName: "Symphony",
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
        "Refresh runs the normal poll/reconcile cycle now. Requeue still happens through /rework on GitHub or the admitted Linear state flow.",
      pi: {
        defaultModel: "xiaomi/mimo-v2-pro",
        selectedModel: "xiaomi/mimo-v2-pro",
        availableModels: [
          "xiaomi/mimo-v2-pro",
          "gpt-5.4",
          "gpt-5.4-mini"
        ],
        modelOverrideLabelPrefix: "model:",
        selectionHelpText:
          "Model selection is currently label-driven. Add a Symphony issue label to override the default model for future runs."
      }
    },
    ...Object.fromEntries(
      Object.entries(overrides).filter(
        ([key]) => key !== "workspace" && key !== "running" && key !== "retry"
      )
    )
  };
}

export function buildSymphonyForensicsIssueListResult(
  overrides: Partial<SymphonyForensicsIssueListResult> = {}
): SymphonyForensicsIssueListResult {
  return {
    issues: [
      {
        repositoryKey: DEFAULT_REPOSITORY_KEY,
        trackerIssueId: "issue_123",
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
        totalCachedInputTokens: 1200,
        totalOutputTokens: 2500,
        totalTokens: 9700,
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
        repositoryKey: DEFAULT_REPOSITORY_KEY,
        trackerIssueId: "issue_234",
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
        repositoryKey: DEFAULT_REPOSITORY_KEY,
        trackerIssueId: "issue_345",
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
      },
      {
        repositoryKey: DEFAULT_REPOSITORY_KEY,
        trackerIssueId: "issue_456",
        issueIdentifier: "COL-170",
        latestRunStartedAt: "2026-03-28T11:10:00.000Z",
        latestRunId: "run_456",
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
        totalInputTokens: 1400,
        totalCachedInputTokens: 0,
        totalOutputTokens: 300,
        totalTokens: 1700,
        avgDurationSeconds: 88,
        avgTurns: 1.3,
        avgEvents: 3,
        latestErrorClass: "workspace_boot_failure",
        latestErrorMessage: "Workspace bootstrap failed.",
        latestActivityAt: "2026-03-28T11:12:00.000Z",
        flags: ["startup_failure", "no_success"],
        insertedAt: "2026-03-28T11:10:00.000Z",
        updatedAt: "2026-03-28T11:12:00.000Z"
      }
    ],
    totals: {
      issueCount: 4,
      runCount: 14,
      completedRunCount: 6,
      problemRunCount: 8,
      rateLimitedCount: 3,
      maxTurnsCount: 2,
      startupFailureCount: 2,
      inputTokens: 24_900,
      cachedInputTokens: 4_400,
      outputTokens: 10_500,
      totalTokens: 39_800
    },
    filters: {
      limit: null,
      repo: null,
      timeRange: "all",
      startedAfter: null,
      startedBefore: null,
      outcome: null,
      errorClass: null,
      hasFlags: [],
      sortBy: "lastActive",
      sortDirection: "desc"
    },
    facets: {
      repositories: [DEFAULT_REPOSITORY_KEY, "symphony/agents", "symphony/runtime"],
      outcomes: ["completed", "max_turns", "rate_limited", "startup_failure"],
      errorClasses: ["max_turns", "rate_limit_exceeded", "workspace_boot_failure"]
    },
    ...overrides
  };
}

export function buildSymphonyForensicsIssueDetailResult(
  overrides: Partial<SymphonyForensicsIssueDetailResult> = {}
): SymphonyForensicsIssueDetailResult {
  return {
    repositoryKey: DEFAULT_REPOSITORY_KEY,
    issueIdentifier: "COL-165",
    runs: [
      {
        repositoryKey: DEFAULT_REPOSITORY_KEY,
        runId: "run_12345678",
        trackerIssueId: "issue_123",
        issueIdentifier: "COL-165",
        attempt: 1,
        status: "finished",
        outcome: "completed",
        agentHarness: "pi",
        agentStatus: "completed",
        agentFailureKind: null,
        agentFailureOrigin: null,
        agentFailureMessagePreview: null,
        model: "xiaomi/mimo-v2-pro",
        workerHost: "worker-a",
        workspacePath: "/tmp/workspaces/col-165",
        startedAt: "2026-03-31T18:00:00.000Z",
        endedAt: "2026-03-31T18:02:00.000Z",
        commitHashStart: "abc",
        commitHashEnd: "def",
        turnCount: 2,
        eventCount: 4,
        lastEventType: "message.output",
        lastEventAt: "2026-03-31T18:02:00.000Z",
        durationSeconds: 120,
        errorClass: null,
        errorMessage: null,
        inputTokens: 120,
        cachedInputTokens: 40,
        outputTokens: 80,
        totalTokens: 240,
        deliveryStatus: "completed",
        deliveryReportedAt: "2026-03-31T18:06:00.000Z",
        deliveryPrUrl: "https://github.com/example/repo/pull/165",
        machineLoad: {
          sampleCount: 6,
          maxCpuPercent: 71,
          avgCpuPercent: 52,
          maxMemoryPercent: 64,
          avgMemoryPercent: 58,
          maxDiskPercent: 47,
          avgDiskPercent: 47,
          hadHighCpu: false,
          hadHighMemory: false,
          hadHighDisk: false
        }
      }
    ],
    summary: {
      runCount: 3,
      latestProblemOutcome: "max_turns",
      lastCompletedOutcome: "completed",
      latestDeliveryStatus: "completed",
      latestDeliveryReportedAt: "2026-03-31T18:06:00.000Z",
      latestDeliveryPrUrl: "https://github.com/example/repo/pull/165",
      deliveredRunCount: 1
    },
    filters: {
      limit: 200,
      repo: null
    },
    ...overrides
  };
}

export function buildSymphonyForensicsIssueForensicsBundleResult(
  overrides: Partial<SymphonyForensicsIssueForensicsBundleResult> = {}
): SymphonyForensicsIssueForensicsBundleResult {
  const runtimeLogs = buildSymphonyRuntimeLogsResult({
    logs: [
      {
        entryId: "runtime-log-1",
        repositoryKey: DEFAULT_REPOSITORY_KEY,
        level: "info",
        source: "runtime",
        eventType: "manual_refresh_queued",
        message: "Queued manual refresh request.",
        trackerIssueId: "issue_123",
        issueIdentifier: "COL-165",
        runId: "run_12345678",
        payload: {
          queued: true
        },
        recordedAt: "2026-03-31T18:03:00.000Z"
      },
      {
        entryId: "runtime-log-2",
        repositoryKey: DEFAULT_REPOSITORY_KEY,
        level: "warn",
        source: "workspace",
        eventType: "rate_limit_warning",
        message: "Approaching upstream rate limit.",
        trackerIssueId: "issue_123",
        issueIdentifier: "COL-165",
        runId: "run_12345678",
        payload: {
          remaining: 3
        },
        recordedAt: "2026-03-31T18:04:00.000Z"
      }
    ]
  }).logs;

  return {
    repositoryKey: overrides.repositoryKey ?? DEFAULT_REPOSITORY_KEY,
    issue: buildSymphonyForensicsIssueListResult().issues[0]!,
    recentRuns: buildSymphonyForensicsIssueDetailResult().runs,
    distributions: {
      outcomes: {
        completed: 1,
        max_turns: 2
      },
      errorClasses: {
        max_turns: 2
      },
      timelineEvents: {
        "runtime.refresh": 1,
        "codex.message.output": 1
      }
    },
    latestFailure: {
      runId: "run_12345678",
      startedAt: "2026-03-31T18:00:00.000Z",
      outcome: "max_turns",
      errorClass: "max_turns",
      errorMessage: "Reached max turns before completion.",
      timelineEntries: [
        {
          entryId: "timeline-1",
          repositoryKey: DEFAULT_REPOSITORY_KEY,
          trackerIssueId: "issue_123",
          issueIdentifier: "COL-165",
          runId: "run_12345678",
          turnId: "turn_123",
          source: "runtime",
          eventType: "runtime.refresh",
          message: "Manual refresh requested.",
          payload: {
            queued: true
          },
          recordedAt: "2026-03-31T18:03:00.000Z"
        },
        {
          entryId: "timeline-2",
          repositoryKey: DEFAULT_REPOSITORY_KEY,
          trackerIssueId: "issue_123",
          issueIdentifier: "COL-165",
          runId: "run_12345678",
          turnId: "turn_123",
          source: "agent",
          eventType: "codex.message.output",
          message: "Assistant responded.",
          payload: {
            text: "Still working"
          },
          recordedAt: "2026-03-31T18:04:00.000Z"
        }
      ],
      runtimeLogs
    },
    timeline: [
      {
        entryId: "timeline-1",
        repositoryKey: DEFAULT_REPOSITORY_KEY,
        trackerIssueId: "issue_123",
        issueIdentifier: "COL-165",
        runId: "run_12345678",
        turnId: "turn_123",
        source: "runtime",
        eventType: "runtime.refresh",
        message: "Manual refresh requested.",
        payload: {
          queued: true
        },
        recordedAt: "2026-03-31T18:03:00.000Z"
      },
      {
        entryId: "timeline-2",
        repositoryKey: DEFAULT_REPOSITORY_KEY,
        trackerIssueId: "issue_123",
        issueIdentifier: "COL-165",
        runId: "run_12345678",
        turnId: "turn_123",
        source: "agent",
        eventType: "codex.message.output",
        message: "Assistant responded.",
        payload: {
          text: "Still working"
        },
        recordedAt: "2026-03-31T18:04:00.000Z"
      }
    ],
    runtimeLogs,
    filters: buildSymphonyForensicsIssueListResult().filters,
    ...overrides
  };
}

export function buildSymphonyForensicsProblemRunsResult(
  overrides: Partial<SymphonyForensicsProblemRunsResult> = {}
): SymphonyForensicsProblemRunsResult {
  return {
    problemRuns: [
      {
        repositoryKey: DEFAULT_REPOSITORY_KEY,
        runId: "run_12345678",
        trackerIssueId: "issue_123",
        issueIdentifier: "COL-165",
        attempt: 1,
        status: "finished",
        outcome: "max_turns",
        agentHarness: "pi",
        agentStatus: "failed",
        agentFailureKind: "max_turns",
        agentFailureOrigin: "runtime",
        agentFailureMessagePreview: "Reached max turns.",
        model: "xiaomi/mimo-v2-pro",
        workerHost: "worker-a",
        workspacePath: "/tmp/workspaces/col-165",
        startedAt: "2026-03-31T18:00:00.000Z",
        endedAt: "2026-03-31T18:02:00.000Z",
        commitHashStart: "abc",
        commitHashEnd: "def",
        turnCount: 2,
        eventCount: 4,
        lastEventType: "message.output",
        lastEventAt: "2026-03-31T18:02:00.000Z",
        durationSeconds: 120,
        errorClass: "max_turns",
        errorMessage: "Reached max turns.",
        inputTokens: 120,
        cachedInputTokens: 0,
        outputTokens: 80,
        totalTokens: 200,
        deliveryStatus: null,
        deliveryReportedAt: null,
        deliveryPrUrl: null,
        machineLoad: {
          sampleCount: 6,
          maxCpuPercent: 89,
          avgCpuPercent: 66,
          maxMemoryPercent: 81,
          avgMemoryPercent: 73,
          maxDiskPercent: 47,
          avgDiskPercent: 47,
          hadHighCpu: true,
          hadHighMemory: true,
          hadHighDisk: false
        }
      }
    ],
    problemSummary: {
      max_turns: 2
    },
    filters: {
      repo: null,
      outcome: "max_turns",
      issueIdentifier: "",
      limit: 200
    },
    ...overrides
  };
}

export function buildSymphonyRuntimeLogsResult(
  overrides: Partial<SymphonyRuntimeLogsResult> & {
    logs?: SymphonyRuntimeLogEntry[];
  } = {}
): SymphonyRuntimeLogsResult {
  return {
    logs: overrides.logs ?? [
      {
        entryId: "runtime-log-1",
        repositoryKey: DEFAULT_REPOSITORY_KEY,
        level: "info",
        source: "runtime",
        eventType: "db_initialized",
        message: "Initialized Symphony DB.",
        trackerIssueId: null,
        issueIdentifier: null,
        runId: null,
        payload: {
          dbFile: "/tmp/symphony.db"
        },
        recordedAt: "2026-03-31T18:00:00.000Z"
      },
      {
        entryId: "runtime-log-2",
        repositoryKey: DEFAULT_REPOSITORY_KEY,
        level: "warn",
        source: "tracker",
        eventType: "tracker_placeholder_active",
        message: "Using in-memory tracker placeholder.",
        trackerIssueId: null,
        issueIdentifier: null,
        runId: null,
        payload: null,
        recordedAt: "2026-03-31T18:01:00.000Z"
      }
    ],
    filters: {
      limit: 200,
      repo: null,
      issueIdentifier: null
    },
    ...Object.fromEntries(
      Object.entries(overrides).filter(([key]) => key !== "logs")
    )
  };
}

export function buildSymphonyRuntimeHealthResult(
  overrides: Partial<SymphonyRuntimeHealthResult> = {}
): SymphonyRuntimeHealthResult {
  return {
    healthy: true,
    db: {
      file: "/tmp/symphony.db",
      ready: true
    },
    poller: {
      running: true,
      intervalMs: 1000,
      inFlight: false,
      lastStartedAt: "2026-03-31T18:04:00.000Z",
      lastCompletedAt: "2026-03-31T18:04:01.000Z",
      lastSucceededAt: "2026-03-31T18:04:01.000Z",
      lastError: null
    },
    machineLoad: {
      capturedAt: "2026-03-31T18:04:05.000Z",
      cpuPercent: 61,
      memoryUsedBytes: 8 * 1024 * 1024 * 1024,
      memoryTotalBytes: 16 * 1024 * 1024 * 1024,
      memoryPercent: 50,
      diskUsedBytes: 120 * 1024 * 1024 * 1024,
      diskTotalBytes: 256 * 1024 * 1024 * 1024,
      diskPercent: 47,
      samplePath: "/tmp/workspaces"
    },
    ...overrides
  };
}

export function buildSymphonyForensicsRunDetailResult(
  overrides: Partial<SymphonyForensicsRunDetailResult> = {}
): SymphonyForensicsRunDetailResult {
  return {
    issue: {
      repositoryKey: DEFAULT_REPOSITORY_KEY,
      trackerIssueId: "issue_123",
      issueIdentifier: "COL-165",
      latestRunStartedAt: "2026-03-31T18:00:00.000Z",
      latestRunId: "run_123",
      latestRunStatus: "finished",
      latestRunOutcome: "completed",
      runCount: 3,
      latestProblemOutcome: "max_turns",
      lastCompletedOutcome: "completed",
      latestDeliveryStatus: "completed",
      latestDeliveryReportedAt: "2026-03-31T18:06:00.000Z",
      latestDeliveryRunId: "run_123",
      latestDeliveryPrUrl: "https://github.com/example/repo/pull/165",
      deliveredRunCount: 1,
      insertedAt: "2026-03-31T18:00:00.000Z",
      updatedAt: "2026-03-31T18:05:00.000Z"
    },
    run: {
      repositoryKey: DEFAULT_REPOSITORY_KEY,
      runId: "run_123",
      trackerIssueId: "issue_123",
      issueIdentifier: "COL-165",
      attempt: 1,
      status: "finished",
      outcome: "completed",
      agentHarness: "pi",
      agentStatus: "completed",
      agentFailureKind: null,
      agentFailureOrigin: null,
      agentFailureMessagePreview: null,
      model: "xiaomi/mimo-v2-pro",
      workerHost: "worker-a",
      workspacePath: "/tmp/workspaces/col-165",
      startedAt: "2026-03-31T18:00:00.000Z",
      endedAt: "2026-03-31T18:02:00.000Z",
      commitHashStart: "abc",
      commitHashEnd: "def",
      turnCount: 2,
      eventCount: 4,
      lastEventType: "message.output",
      lastEventAt: "2026-03-31T18:02:00.000Z",
      durationSeconds: 120,
      inputTokens: 120,
      cachedInputTokens: 0,
      outputTokens: 80,
      totalTokens: 200,
      deliveryStatus: "completed",
      deliveryReportedAt: "2026-03-31T18:06:00.000Z",
      deliveryPrUrl: "https://github.com/example/repo/pull/165",
      machineLoad: {
        sampleCount: 6,
        maxCpuPercent: 71,
        avgCpuPercent: 52,
        maxMemoryPercent: 64,
        avgMemoryPercent: 58,
        maxDiskPercent: 47,
        avgDiskPercent: 47,
        hadHighCpu: false,
        hadHighMemory: false,
        hadHighDisk: false
      },
      threadId: "thread_123",
      processId: "pi-process-123",
      providerId: "openrouter",
      providerName: "OpenRouter",
      reasoningEffort: "high",
      profile: "mimo-v2-pro",
      authMode: "api_key_env",
      providerEnvKey: "OPENROUTER_API_KEY",
      launchTarget: {
        kind: "container",
        hostLaunchPath: "/tmp/workspaces/col-165",
        hostWorkspacePath: "/tmp/workspaces/col-165",
        runtimeWorkspacePath: "/workspace",
        containerId: "container-165",
        containerName: "symphony-col-165",
        shell: "sh"
      },
      repoStart: {},
      repoEnd: {},
      metadata: {},
      errorClass: null,
      errorMessage: null,
      insertedAt: "2026-03-31T18:00:00.000Z",
      updatedAt: "2026-03-31T18:02:00.000Z"
    },
    deliveryReport: {
      reportId: "delivery_123",
      repositoryKey: DEFAULT_REPOSITORY_KEY,
      trackerIssueId: "issue_123",
      issueIdentifier: "COL-165",
      runId: "run_123",
      turnId: "turn_123",
      status: "completed",
      summary: "Opened the pull request.",
      prUrl: "https://github.com/example/repo/pull/165",
      prNumber: "165",
      branchName: "codex/col-165",
      blockingReason: null,
      testsSummary: "pnpm verify:precommit",
      source: "pi",
      reportedAt: "2026-03-31T18:06:00.000Z",
      insertedAt: "2026-03-31T18:06:00.000Z"
    },
    turns: [
      {
        turnId: "turn_123",
        runId: "run_123",
        turnSequence: 1,
        agentTurnId: null,
        threadId: "thread_123",
        promptText: "Solve the task",
        status: "completed",
        startedAt: "2026-03-31T18:00:00.000Z",
        endedAt: "2026-03-31T18:01:00.000Z",
        usage: {
          input_tokens: 120,
          cached_input_tokens: 40,
          output_tokens: 80
        },
        metadata: {},
        insertedAt: "2026-03-31T18:00:00.000Z",
        updatedAt: "2026-03-31T18:01:00.000Z",
        eventCount: 1,
        events: [
          {
            eventId: "event_123",
            turnId: "turn_123",
            runId: "run_123",
            eventSequence: 1,
            eventType: "item.completed",
            itemType: "agent_message",
            itemStatus: null,
            recordedAt: "2026-03-31T18:01:00.000Z",
            payload: {
              type: "item.completed",
              item: {
                id: "message_123",
                type: "agent_message",
                text: "done"
              }
            },
            payloadTruncated: false,
            payloadBytes: 12,
            summary: "Produced output",
            agentTurnId: null,
            threadId: "thread_123",
            insertedAt: "2026-03-31T18:01:00.000Z"
          }
        ]
      }
    ],
    ...overrides
  };
}

export function buildSymphonyForensicsSuccessMetricsResult(
  overrides: Partial<SymphonyForensicsSuccessMetricsResult> = {}
): SymphonyForensicsSuccessMetricsResult {
  return {
    window: {
      timeRange: "7d",
      startedAfter: "2026-03-25T00:00:00.000Z",
      startedBefore: "2026-03-31T23:59:59.999Z"
    },
    executive: {
      startedIssueCount: 24,
      deliveredIssueCount: 16,
      issueDeliveryRate: 16 / 24,
      medianTokensPerDeliveredIssue: 1_480,
      medianTimeToDeliveredIssueSeconds: 6_900,
      deliveryRetryRate: 0.625,
      maxTurnFailureRate: 0.16666666666666666
    },
    diagnostics: {
      startedRunCount: 36,
      deliveredRunCount: 18,
      blockedIssueCount: 1,
      partialIssueCount: 2,
      missingDeliveryReportFailureCount: 1,
      startupFailureRate: 0.08333333333333333,
      rateLimitedRunRate: 0.16666666666666666,
      highMachinePressureRunRate: 0.25,
      medianCachedInputShareDeliveredIssues: 0.44
    },
    daily: [
      {
        date: "2026-03-25",
        startedIssueCount: 2,
        deliveredIssueCount: 1,
        startedRunCount: 3,
        deliveredRunCount: 1,
        maxTurnFailureCount: 0,
        startupFailureCount: 0,
        rateLimitedRunCount: 0,
        totalTokens: 900
      },
      {
        date: "2026-03-26",
        startedIssueCount: 3,
        deliveredIssueCount: 2,
        startedRunCount: 4,
        deliveredRunCount: 2,
        maxTurnFailureCount: 1,
        startupFailureCount: 0,
        rateLimitedRunCount: 1,
        totalTokens: 1_150
      },
      {
        date: "2026-03-27",
        startedIssueCount: 4,
        deliveredIssueCount: 2,
        startedRunCount: 5,
        deliveredRunCount: 2,
        maxTurnFailureCount: 1,
        startupFailureCount: 1,
        rateLimitedRunCount: 0,
        totalTokens: 1_480
      },
      {
        date: "2026-03-28",
        startedIssueCount: 5,
        deliveredIssueCount: 3,
        startedRunCount: 7,
        deliveredRunCount: 3,
        maxTurnFailureCount: 2,
        startupFailureCount: 0,
        rateLimitedRunCount: 1,
        totalTokens: 1_920
      },
      {
        date: "2026-03-29",
        startedIssueCount: 4,
        deliveredIssueCount: 3,
        startedRunCount: 6,
        deliveredRunCount: 3,
        maxTurnFailureCount: 0,
        startupFailureCount: 0,
        rateLimitedRunCount: 0,
        totalTokens: 1_710
      },
      {
        date: "2026-03-30",
        startedIssueCount: 3,
        deliveredIssueCount: 2,
        startedRunCount: 4,
        deliveredRunCount: 2,
        maxTurnFailureCount: 1,
        startupFailureCount: 0,
        rateLimitedRunCount: 1,
        totalTokens: 1_420
      },
      {
        date: "2026-03-31",
        startedIssueCount: 3,
        deliveredIssueCount: 3,
        startedRunCount: 7,
        deliveredRunCount: 3,
        maxTurnFailureCount: 1,
        startupFailureCount: 1,
        rateLimitedRunCount: 0,
        totalTokens: 1_980
      }
    ],
    ...overrides
  };
}

export function buildSymphonyAgentRunArtifactsResult(
  overrides: Partial<SymphonyAgentRunArtifactsResult> = {}
): SymphonyAgentRunArtifactsResult {
  return {
    run: {
      runId: "run_123",
      threadId: "thread_123",
      harnessKind: "pi",
      model: "xiaomi/mimo-v2-pro",
      providerId: "openrouter",
      providerName: "OpenRouter",
      trackerIssueId: "issue_123",
      issueIdentifier: "COL-165",
      startedAt: "2026-03-31T18:00:00.000Z",
      endedAt: "2026-03-31T18:02:00.000Z",
      status: "completed",
      failureKind: null,
      failureOrigin: null,
      failureMessagePreview: null,
      finalTurnId: "turn_123",
      lastAgentMessageItemId: "message_123",
      lastAgentMessagePreview: "Task complete.",
      lastAgentMessageOverflowId: null,
      inputTokens: 120,
      cachedInputTokens: 0,
      outputTokens: 80,
      totalTokens: 200,
      turnCount: 1,
      itemCount: 4,
      commandCount: 1,
      toolCallCount: 1,
      fileChangeCount: 2,
      agentMessageCount: 1,
      reasoningCount: 1,
      errorCount: 0,
      latestEventAt: "2026-03-31T18:01:00.000Z",
      latestEventType: "item.completed",
      insertedAt: "2026-03-31T18:00:00.000Z",
      updatedAt: "2026-03-31T18:02:00.000Z"
    },
    turns: [
      {
        turnId: "turn_123",
        runId: "run_123",
        threadId: "thread_123",
        harnessKind: "pi",
        model: "xiaomi/mimo-v2-pro",
        providerId: "openrouter",
        providerName: "OpenRouter",
        startedAt: "2026-03-31T18:00:00.000Z",
        endedAt: "2026-03-31T18:01:00.000Z",
        status: "completed",
        failureKind: null,
        failureMessagePreview: null,
        lastAgentMessageItemId: "message_123",
        lastAgentMessagePreview: "Task complete.",
        lastAgentMessageOverflowId: null,
        inputTokens: 120,
        cachedInputTokens: 40,
        outputTokens: 80,
        totalTokens: 240,
        usage: {
          input_tokens: 120,
          cached_input_tokens: 40,
          output_tokens: 80
        },
        itemCount: 4,
        commandCount: 1,
        toolCallCount: 1,
        fileChangeCount: 2,
        agentMessageCount: 1,
        reasoningCount: 1,
        errorCount: 0,
        latestEventAt: "2026-03-31T18:01:00.000Z",
        latestEventType: "item.completed",
        insertedAt: "2026-03-31T18:00:00.000Z",
        updatedAt: "2026-03-31T18:01:00.000Z"
      }
    ],
    items: [
      {
        runId: "run_123",
        turnId: "turn_123",
        itemId: "reasoning_123",
        itemType: "reasoning",
        startedAt: "2026-03-31T18:00:05.000Z",
        lastUpdatedAt: "2026-03-31T18:00:10.000Z",
        completedAt: "2026-03-31T18:00:10.000Z",
        finalStatus: "completed",
        updateCount: 1,
        durationMs: 5_000,
        latestPreview: "Inspecting the repository structure before making changes.",
        latestOverflowId: null,
        insertedAt: "2026-03-31T18:00:05.000Z",
        updatedAt: "2026-03-31T18:00:10.000Z"
      },
      {
        runId: "run_123",
        turnId: "turn_123",
        itemId: "cmd_123",
        itemType: "command_execution",
        startedAt: "2026-03-31T18:00:12.000Z",
        lastUpdatedAt: "2026-03-31T18:00:30.000Z",
        completedAt: "2026-03-31T18:00:30.000Z",
        finalStatus: "completed",
        updateCount: 2,
        durationMs: 18_000,
        latestPreview: "pnpm lint && pnpm test passed",
        latestOverflowId: null,
        insertedAt: "2026-03-31T18:00:12.000Z",
        updatedAt: "2026-03-31T18:00:30.000Z"
      },
      {
        runId: "run_123",
        turnId: "turn_123",
        itemId: "tool_123",
        itemType: "mcp_tool_call",
        startedAt: "2026-03-31T18:00:32.000Z",
        lastUpdatedAt: "2026-03-31T18:00:40.000Z",
        completedAt: "2026-03-31T18:00:40.000Z",
        finalStatus: "completed",
        updateCount: 1,
        durationMs: 8_000,
        latestPreview: "Fetched the latest issue metadata from Linear.",
        latestOverflowId: null,
        insertedAt: "2026-03-31T18:00:32.000Z",
        updatedAt: "2026-03-31T18:00:40.000Z"
      },
      {
        runId: "run_123",
        turnId: "turn_123",
        itemId: "message_123",
        itemType: "agent_message",
        startedAt: "2026-03-31T18:00:42.000Z",
        lastUpdatedAt: "2026-03-31T18:01:00.000Z",
        completedAt: "2026-03-31T18:01:00.000Z",
        finalStatus: "completed",
        updateCount: 1,
        durationMs: 18_000,
        latestPreview: "Task complete.",
        latestOverflowId: "overflow_message_123",
        insertedAt: "2026-03-31T18:00:42.000Z",
        updatedAt: "2026-03-31T18:01:00.000Z"
      }
    ],
    commandExecutions: [
      {
        runId: "run_123",
        turnId: "turn_123",
        itemId: "cmd_123",
        command: "pnpm lint && pnpm test",
        status: "completed",
        exitCode: 0,
        timeoutSeconds: 90,
        startedAt: "2026-03-31T18:00:12.000Z",
        completedAt: "2026-03-31T18:00:30.000Z",
        durationMs: 18_000,
        outputPreview: "pnpm lint && pnpm test passed",
        outputOverflowId: null,
        resourceProfile: {
          captureScope: "session_process_tree",
          samplingIntervalMs: 1000,
          firstSampledAt: "2026-03-31T18:00:18.000Z",
          lastSampledAt: "2026-03-31T18:00:29.000Z",
          sampleCount: 3,
          peakCpuPercent: 81,
          peakMemPercent: 37,
          peakRssKb: 524_288,
          peakProcessCount: 6,
          topProcesses: [
            {
              command: "vitest run",
              executable: "node",
              peakCpuPercent: 66,
              peakMemPercent: 22,
              peakRssKb: 393_216,
              sampleCount: 3
            }
          ],
          samples: [
            {
              recordedAt: "2026-03-31T18:00:18.000Z",
              processCount: 4,
              totalCpuPercent: 55,
              totalMemPercent: 24,
              totalRssKb: 327_680,
              topProcesses: [
                {
                  command: "vitest run",
                  executable: "node",
                  peakCpuPercent: 48,
                  peakMemPercent: 18,
                  peakRssKb: 262_144,
                  sampleCount: 1
                }
              ]
            },
            {
              recordedAt: "2026-03-31T18:00:24.000Z",
              processCount: 6,
              totalCpuPercent: 81,
              totalMemPercent: 37,
              totalRssKb: 524_288,
              topProcesses: [
                {
                  command: "vitest run",
                  executable: "node",
                  peakCpuPercent: 66,
                  peakMemPercent: 22,
                  peakRssKb: 393_216,
                  sampleCount: 1
                }
              ]
            },
            {
              recordedAt: "2026-03-31T18:00:29.000Z",
              processCount: 5,
              totalCpuPercent: 47,
              totalMemPercent: 31,
              totalRssKb: 458_752,
              topProcesses: [
                {
                  command: "pnpm test",
                  executable: "node",
                  peakCpuPercent: 29,
                  peakMemPercent: 14,
                  peakRssKb: 196_608,
                  sampleCount: 1
                }
              ]
            }
          ]
        },
        insertedAt: "2026-03-31T18:00:12.000Z",
        updatedAt: "2026-03-31T18:00:30.000Z"
      }
    ],
    toolCalls: [
      {
        runId: "run_123",
        turnId: "turn_123",
        itemId: "tool_123",
        server: "linear",
        tool: "get_issue",
        status: "completed",
        errorMessage: null,
        argumentsJson: {
          id: "COL-165"
        },
        resultPreview: "Fetched the latest issue metadata from Linear.",
        resultOverflowId: null,
        startedAt: "2026-03-31T18:00:32.000Z",
        completedAt: "2026-03-31T18:00:40.000Z",
        durationMs: 8_000,
        insertedAt: "2026-03-31T18:00:32.000Z",
        updatedAt: "2026-03-31T18:00:40.000Z"
      }
    ],
    agentMessages: [
      {
        runId: "run_123",
        turnId: "turn_123",
        itemId: "message_123",
        textContent: null,
        textPreview: "Task complete.",
        textOverflowId: "overflow_message_123",
        recordedAt: "2026-03-31T18:01:00.000Z",
        piMessage: {
          responseId: "response_123",
          api: "responses",
          provider: "openrouter",
          model: "xiaomi/mimo-v2-pro",
          stopReason: "tool_use",
          responseTimestamp: "2026-03-31T18:01:00.000Z",
          inputTokens: 120,
          cachedInputTokens: 40,
          cacheWriteTokens: 0,
          outputTokens: 80,
          totalTokens: 240
        },
        insertedAt: "2026-03-31T18:00:42.000Z",
        updatedAt: "2026-03-31T18:01:00.000Z"
      }
    ],
    reasoning: [
      {
        runId: "run_123",
        turnId: "turn_123",
        itemId: "reasoning_123",
        textContent: "Inspecting the repository structure before making changes.",
        textPreview: "Inspecting the repository structure before making changes.",
        textOverflowId: null,
        recordedAt: "2026-03-31T18:00:05.000Z",
        piMessage: {
          responseId: "response_122",
          api: "responses",
          provider: "openrouter",
          model: "xiaomi/mimo-v2-pro",
          stopReason: "reasoning",
          responseTimestamp: "2026-03-31T18:00:05.000Z",
          inputTokens: 60,
          cachedInputTokens: 20,
          cacheWriteTokens: 0,
          outputTokens: 0,
          totalTokens: 80
        },
        insertedAt: "2026-03-31T18:00:05.000Z",
        updatedAt: "2026-03-31T18:00:10.000Z"
      }
    ],
    fileChanges: [
      {
        runId: "run_123",
        turnId: "turn_123",
        itemId: "cmd_123",
        path: "README.md",
        changeKind: "modified",
        recordedAt: "2026-03-31T18:00:30.000Z",
        insertedAt: "2026-03-31T18:00:30.000Z"
      },
      {
        runId: "run_123",
        turnId: "turn_123",
        itemId: "cmd_123",
        path: "src/index.ts",
        changeKind: "modified",
        recordedAt: "2026-03-31T18:00:30.000Z",
        insertedAt: "2026-03-31T18:00:30.000Z"
      }
    ],
    taskSnapshots: [],
    turnActivities: [
      {
        runId: "run_123",
        turnId: "turn_123",
        status: "completed",
        startedAt: "2026-03-31T18:00:00.000Z",
        endedAt: "2026-03-31T18:01:00.000Z",
        messages: [
          {
            runId: "run_123",
            turnId: "turn_123",
            itemId: "message_123",
            textContent: null,
            textPreview: "Task complete.",
            textOverflowId: "overflow_message_123",
            recordedAt: "2026-03-31T18:01:00.000Z",
            piMessage: {
              responseId: "response_123",
              api: "responses",
              provider: "openrouter",
              model: "xiaomi/mimo-v2-pro",
              stopReason: "tool_use",
              responseTimestamp: "2026-03-31T18:01:00.000Z",
              inputTokens: 120,
              cachedInputTokens: 40,
              cacheWriteTokens: 0,
              outputTokens: 80,
              totalTokens: 240
            },
            insertedAt: "2026-03-31T18:00:42.000Z",
            updatedAt: "2026-03-31T18:01:00.000Z"
          }
        ],
        reasoningBlocks: [
          {
            runId: "run_123",
            turnId: "turn_123",
            itemId: "reasoning_123",
            textContent: "Inspecting the repository structure before making changes.",
            textPreview: "Inspecting the repository structure before making changes.",
            textOverflowId: null,
            recordedAt: "2026-03-31T18:00:05.000Z",
            piMessage: {
              responseId: "response_122",
              api: "responses",
              provider: "openrouter",
              model: "xiaomi/mimo-v2-pro",
              stopReason: "reasoning",
              responseTimestamp: "2026-03-31T18:00:05.000Z",
              inputTokens: 60,
              cachedInputTokens: 20,
              cacheWriteTokens: 0,
              outputTokens: 0,
              totalTokens: 80
            },
            insertedAt: "2026-03-31T18:00:05.000Z",
            updatedAt: "2026-03-31T18:00:10.000Z"
          }
        ],
        fileChanges: [
          {
            runId: "run_123",
            turnId: "turn_123",
            itemId: "cmd_123",
            path: "README.md",
            changeKind: "modified",
            recordedAt: "2026-03-31T18:00:30.000Z",
            insertedAt: "2026-03-31T18:00:30.000Z"
          },
          {
            runId: "run_123",
            turnId: "turn_123",
            itemId: "cmd_123",
            path: "src/index.ts",
            changeKind: "modified",
            recordedAt: "2026-03-31T18:00:30.000Z",
            insertedAt: "2026-03-31T18:00:30.000Z"
          }
        ],
        taskSnapshots: []
      }
    ],
    events: [
      {
        eventId: "event_1",
        turnId: "turn_123",
        runId: "run_123",
        threadId: "thread_123",
        itemId: "reasoning_123",
        eventSequence: 1,
        eventType: "item.completed",
        recordedAt: "2026-03-31T18:00:10.000Z",
        payload: {
          type: "item.completed",
          item: {
            id: "reasoning_123",
            type: "reasoning",
            text: "Inspecting the repository structure before making changes."
          }
        },
        payloadOverflowId: null,
        projectionLossOverflowId: null,
        rawPayloadOverflowId: null,
        payloadTruncated: false,
        insertedAt: "2026-03-31T18:00:10.000Z"
      },
      {
        eventId: "event_2",
        turnId: "turn_123",
        runId: "run_123",
        threadId: "thread_123",
        itemId: "cmd_123",
        eventSequence: 2,
        eventType: "item.completed",
        recordedAt: "2026-03-31T18:00:30.000Z",
        payload: {
          type: "item.completed",
          item: {
            id: "cmd_123",
            type: "command_execution",
            command: "pnpm lint && pnpm test",
            aggregated_output: "pnpm lint && pnpm test passed",
            exit_code: 0,
            status: "completed"
          }
        },
        payloadOverflowId: null,
        projectionLossOverflowId: null,
        rawPayloadOverflowId: null,
        payloadTruncated: false,
        insertedAt: "2026-03-31T18:00:30.000Z"
      },
      {
        eventId: "event_3",
        turnId: "turn_123",
        runId: "run_123",
        threadId: "thread_123",
        itemId: "tool_123",
        eventSequence: 3,
        eventType: "item.completed",
        recordedAt: "2026-03-31T18:00:40.000Z",
        payload: {
          type: "item.completed",
          item: {
            id: "tool_123",
            type: "mcp_tool_call",
            server: "linear",
            tool: "get_issue",
            arguments: {
              id: "COL-165"
            },
            result: {
              content: [
                {
                  type: "text",
                  text: "Fetched the latest issue metadata from Linear."
                }
              ]
            },
            status: "completed"
          }
        },
        payloadOverflowId: null,
        projectionLossOverflowId: null,
        rawPayloadOverflowId: null,
        payloadTruncated: false,
        insertedAt: "2026-03-31T18:00:40.000Z"
      },
      {
        eventId: "event_4",
        turnId: "turn_123",
        runId: "run_123",
        threadId: "thread_123",
        itemId: "message_123",
        eventSequence: 4,
        eventType: "item.completed",
        recordedAt: "2026-03-31T18:01:00.000Z",
        payload: {
          type: "item.completed",
          item: {
            id: "message_123",
            type: "agent_message",
            text: "Task complete."
          }
        },
        payloadOverflowId: null,
        projectionLossOverflowId: null,
        rawPayloadOverflowId: null,
        payloadTruncated: false,
        insertedAt: "2026-03-31T18:01:00.000Z"
      }
    ],
    ...overrides
  };
}

export function buildSymphonyAgentRunArtifactsDiffDemoResult(
  overrides: Partial<SymphonyAgentRunArtifactsResult> = {}
): SymphonyAgentRunArtifactsResult {
  const result = buildSymphonyAgentRunArtifactsResult();
  const runStartedAt = "2026-04-03T20:00:00.000Z";
  const turn1EndedAt = "2026-04-03T20:02:00.000Z";
  const turn2EndedAt = "2026-04-03T20:05:00.000Z";
  const turn3EndedAt = "2026-04-03T20:12:00.000Z";

  const itemTemplate = result.items[2]!;
  const messageTemplate = result.items[3]!;
  const toolTemplate = result.toolCalls[0]!;
  const messageRecordTemplate = result.agentMessages[0]!;
  const fileChangeTemplate = result.fileChanges[0]!;

  result.run = {
    ...result.run,
    runId: "run_456",
    threadId: "thread_456",
    trackerIssueId: "issue_456",
    issueIdentifier: "COL-166",
    startedAt: runStartedAt,
    endedAt: turn3EndedAt,
    status: "completed",
    failureKind: null,
    failureOrigin: null,
    failureMessagePreview: null,
    finalTurnId: "turn_3",
    lastAgentMessageItemId: "message_3",
    lastAgentMessagePreview: "Task complete.",
    lastAgentMessageOverflowId: null,
    inputTokens: 120,
    cachedInputTokens: 40,
    outputTokens: 90,
    totalTokens: 250,
    turnCount: 3,
    itemCount: 5,
    commandCount: 0,
    toolCallCount: 4,
    fileChangeCount: 2,
    agentMessageCount: 1,
    reasoningCount: 0,
    errorCount: 0,
    latestEventAt: turn3EndedAt,
    latestEventType: "item.completed",
    insertedAt: runStartedAt,
    updatedAt: turn3EndedAt
  };

  result.turns = [
    {
      ...result.turns[0]!,
      turnId: "turn_1",
      runId: "run_456",
      threadId: "thread_456",
      startedAt: runStartedAt,
      endedAt: turn1EndedAt,
      status: "completed",
      failureKind: null,
      failureMessagePreview: null,
      lastAgentMessageItemId: null,
      lastAgentMessagePreview: null,
      lastAgentMessageOverflowId: null,
      inputTokens: 30,
      cachedInputTokens: 10,
      outputTokens: 20,
      totalTokens: 60,
      usage: {
        input_tokens: 30,
        cached_input_tokens: 10,
        output_tokens: 20
      },
      itemCount: 1,
      commandCount: 0,
      toolCallCount: 1,
      fileChangeCount: 0,
      agentMessageCount: 0,
      reasoningCount: 0,
      errorCount: 0,
      latestEventAt: turn1EndedAt,
      latestEventType: "item.completed",
      insertedAt: runStartedAt,
      updatedAt: turn1EndedAt
    },
    {
      ...result.turns[0]!,
      turnId: "turn_2",
      runId: "run_456",
      threadId: "thread_456",
      startedAt: turn1EndedAt,
      endedAt: turn2EndedAt,
      status: "completed",
      failureKind: null,
      failureMessagePreview: null,
      lastAgentMessageItemId: null,
      lastAgentMessagePreview: null,
      lastAgentMessageOverflowId: null,
      inputTokens: 50,
      cachedInputTokens: 20,
      outputTokens: 30,
      totalTokens: 100,
      usage: {
        input_tokens: 50,
        cached_input_tokens: 20,
        output_tokens: 30
      },
      itemCount: 1,
      commandCount: 0,
      toolCallCount: 1,
      fileChangeCount: 1,
      agentMessageCount: 0,
      reasoningCount: 0,
      errorCount: 0,
      latestEventAt: turn2EndedAt,
      latestEventType: "item.completed",
      insertedAt: turn1EndedAt,
      updatedAt: turn2EndedAt
    },
    {
      ...result.turns[0]!,
      turnId: "turn_3",
      runId: "run_456",
      threadId: "thread_456",
      startedAt: turn2EndedAt,
      endedAt: turn3EndedAt,
      status: "completed",
      failureKind: null,
      failureMessagePreview: null,
      lastAgentMessageItemId: "message_3",
      lastAgentMessagePreview: "Task complete.",
      lastAgentMessageOverflowId: null,
      inputTokens: 40,
      cachedInputTokens: 10,
      outputTokens: 40,
      totalTokens: 90,
      usage: {
        input_tokens: 40,
        cached_input_tokens: 10,
        output_tokens: 40
      },
      itemCount: 3,
      commandCount: 0,
      toolCallCount: 2,
      fileChangeCount: 1,
      agentMessageCount: 1,
      reasoningCount: 0,
      errorCount: 0,
      latestEventAt: turn3EndedAt,
      latestEventType: "item.completed",
      insertedAt: turn2EndedAt,
      updatedAt: turn3EndedAt
    }
  ];

  result.items = [
    {
      ...itemTemplate,
      runId: "run_456",
      turnId: "turn_1",
      itemId: "call_66_read_1",
      startedAt: "2026-04-03T20:00:10.000Z",
      lastUpdatedAt: "2026-04-03T20:00:12.000Z",
      completedAt: "2026-04-03T20:00:12.000Z",
      finalStatus: "completed",
      updateCount: 1,
      durationMs: 2_000,
      latestPreview: "Read src/app/page.tsx",
      latestOverflowId: null,
      insertedAt: "2026-04-03T20:00:10.000Z",
      updatedAt: "2026-04-03T20:00:12.000Z"
    },
    {
      ...itemTemplate,
      runId: "run_456",
      turnId: "turn_2",
      itemId: "call_66_edit_2",
      startedAt: "2026-04-03T20:02:10.000Z",
      lastUpdatedAt: "2026-04-03T20:02:24.000Z",
      completedAt: "2026-04-03T20:02:24.000Z",
      finalStatus: "completed",
      updateCount: 1,
      durationMs: 14_000,
      latestPreview: "Updated src/app/page.tsx",
      latestOverflowId: null,
      insertedAt: "2026-04-03T20:02:10.000Z",
      updatedAt: "2026-04-03T20:02:24.000Z"
    },
    {
      ...itemTemplate,
      runId: "run_456",
      turnId: "turn_3",
      itemId: "call_66_read_3",
      startedAt: "2026-04-03T20:05:10.000Z",
      lastUpdatedAt: "2026-04-03T20:05:12.000Z",
      completedAt: "2026-04-03T20:05:12.000Z",
      finalStatus: "completed",
      updateCount: 1,
      durationMs: 2_000,
      latestPreview: "Read src/app/layout.tsx",
      latestOverflowId: null,
      insertedAt: "2026-04-03T20:05:10.000Z",
      updatedAt: "2026-04-03T20:05:12.000Z"
    },
    {
      ...itemTemplate,
      runId: "run_456",
      turnId: "turn_3",
      itemId: "call_66_write_4",
      startedAt: "2026-04-03T20:05:20.000Z",
      lastUpdatedAt: "2026-04-03T20:05:26.000Z",
      completedAt: "2026-04-03T20:05:26.000Z",
      finalStatus: "completed",
      updateCount: 1,
      durationMs: 6_000,
      latestPreview: "Updated src/app/layout.tsx",
      latestOverflowId: null,
      insertedAt: "2026-04-03T20:05:20.000Z",
      updatedAt: "2026-04-03T20:05:26.000Z"
    },
    {
      ...messageTemplate,
      runId: "run_456",
      turnId: "turn_3",
      itemId: "message_3",
      startedAt: "2026-04-03T20:11:50.000Z",
      lastUpdatedAt: "2026-04-03T20:12:00.000Z",
      completedAt: "2026-04-03T20:12:00.000Z",
      finalStatus: "completed",
      updateCount: 1,
      durationMs: 10_000,
      latestPreview: "Task complete.",
      latestOverflowId: null,
      insertedAt: "2026-04-03T20:11:50.000Z",
      updatedAt: "2026-04-03T20:12:00.000Z"
    }
  ];

  result.commandExecutions = [];
  result.toolCalls = [
    {
      ...toolTemplate,
      runId: "run_456",
      turnId: "turn_1",
      itemId: "call_66_read_1",
      server: "pi",
      tool: "read",
      status: "completed",
      errorMessage: null,
      argumentsJson: {
        path: "src/app/page.tsx",
        offset: 0,
        limit: 80
      },
      resultPreview: "Read src/app/page.tsx",
      resultOverflowId: null,
      startedAt: "2026-04-03T20:00:10.000Z",
      completedAt: "2026-04-03T20:00:12.000Z",
      durationMs: 2_000,
      piRead: {
        path: "src/app/page.tsx",
        offset: 0,
        limit: 80
      },
      insertedAt: "2026-04-03T20:00:10.000Z",
      updatedAt: "2026-04-03T20:00:12.000Z"
    },
    {
      ...toolTemplate,
      runId: "run_456",
      turnId: "turn_2",
      itemId: "call_66_edit_2",
      server: "pi",
      tool: "edit",
      status: "completed",
      errorMessage: null,
      argumentsJson: {
        path: "src/app/page.tsx"
      },
      resultPreview: "@@ edit 1 @@",
      resultOverflowId: null,
      startedAt: "2026-04-03T20:02:10.000Z",
      completedAt: "2026-04-03T20:02:24.000Z",
      durationMs: 14_000,
      piEdit: {
        path: "src/app/page.tsx",
        editCount: 1,
        lineCount: 3,
        firstChangedLine: 1,
        diffPreview: [
          "@@ edit 1 @@",
          "-export default function Page() {",
          "-  return <main>Old page copy</main>;",
          "-}",
          "+export default function Page() {",
          "+  return <main>Updated page copy</main>;",
          "+}"
        ].join("\n"),
        diffOverflowId: null,
        edits: [
          {
            oldText: [
              "export default function Page() {",
              "  return <main>Old page copy</main>;",
              "}"
            ].join("\n"),
            newText: [
              "export default function Page() {",
              "  return <main>Updated page copy</main>;",
              "}"
            ].join("\n")
          }
        ]
      },
      insertedAt: "2026-04-03T20:02:10.000Z",
      updatedAt: "2026-04-03T20:02:24.000Z"
    },
    {
      ...toolTemplate,
      runId: "run_456",
      turnId: "turn_3",
      itemId: "call_66_read_3",
      server: "pi",
      tool: "read",
      status: "completed",
      errorMessage: null,
      argumentsJson: {
        path: "src/app/layout.tsx",
        offset: 0,
        limit: 120
      },
      resultPreview: "Read src/app/layout.tsx",
      resultOverflowId: null,
      startedAt: "2026-04-03T20:05:10.000Z",
      completedAt: "2026-04-03T20:05:12.000Z",
      durationMs: 2_000,
      piRead: {
        path: "src/app/layout.tsx",
        offset: 0,
        limit: 120
      },
      insertedAt: "2026-04-03T20:05:10.000Z",
      updatedAt: "2026-04-03T20:05:12.000Z"
    },
    {
      ...toolTemplate,
      runId: "run_456",
      turnId: "turn_3",
      itemId: "call_66_write_4",
      server: "pi",
      tool: "write",
      status: "completed",
      errorMessage: null,
      argumentsJson: {
        path: "src/app/layout.tsx",
        content: [
          "export default function RootLayout({ children }) {",
          "  return <html lang=\"en\"><body>{children}</body></html>;",
          "}"
        ].join("\n")
      },
      resultPreview: "Updated src/app/layout.tsx",
      resultOverflowId: null,
      startedAt: "2026-04-03T20:05:20.000Z",
      completedAt: "2026-04-03T20:05:26.000Z",
      durationMs: 6_000,
      piWrite: {
        path: "src/app/layout.tsx",
        lineCount: 3,
        contentBytes: 94,
        bytesWritten: 94,
        diffPreview: [
          "@@ -1,3 +1,3 @@",
          " export default function RootLayout({ children }) {",
          "-  return <html><body>{children}</body></html>;",
          "+  return <html lang=\"en\"><body>{children}</body></html>;",
          " }"
        ].join("\n"),
        diffOverflowId: null
      },
      insertedAt: "2026-04-03T20:05:20.000Z",
      updatedAt: "2026-04-03T20:05:26.000Z"
    }
  ];

  result.agentMessages = [
    {
      ...messageRecordTemplate,
      runId: "run_456",
      turnId: "turn_3",
      itemId: "message_3",
      textContent: [
        "Task complete.",
        "",
        "- Read and write diffs are visible inline.",
        "- This sample uses run 456."
      ].join("\n"),
      textPreview: "Task complete.",
      textOverflowId: null,
      recordedAt: turn3EndedAt,
      piMessage: {
        responseId: "response_456",
        api: "responses",
        provider: "openrouter",
        model: "xiaomi/mimo-v2-pro",
        stopReason: "tool_use",
        responseTimestamp: turn3EndedAt,
        inputTokens: 40,
        cachedInputTokens: 10,
        cacheWriteTokens: 0,
        outputTokens: 40,
        totalTokens: 90
      },
      insertedAt: "2026-04-03T20:11:50.000Z",
      updatedAt: turn3EndedAt
    }
  ];

  result.reasoning = [];
  result.fileChanges = [
    {
      ...fileChangeTemplate,
      runId: "run_456",
      turnId: "turn_2",
      itemId: "call_66_edit_2",
      path: "src/app/page.tsx",
      changeKind: "modified",
      recordedAt: "2026-04-03T20:02:24.000Z",
      insertedAt: "2026-04-03T20:02:24.000Z"
    },
    {
      ...fileChangeTemplate,
      runId: "run_456",
      turnId: "turn_3",
      itemId: "call_66_write_4",
      path: "src/app/layout.tsx",
      changeKind: "modified",
      recordedAt: "2026-04-03T20:05:26.000Z",
      insertedAt: "2026-04-03T20:05:26.000Z"
    }
  ];
  result.taskSnapshots = [];
  result.turnActivities = [];
  result.events = [
    {
      eventId: "event_1",
      turnId: "turn_1",
      runId: "run_456",
      threadId: "thread_456",
      itemId: "call_66_read_1",
      eventSequence: 1,
      eventType: "item.completed",
      payload: {
        type: "item.completed",
        item: {
          id: "call_66_read_1",
          type: "mcp_tool_call",
          server: "pi",
          tool: "read",
          arguments: {
            path: "src/app/page.tsx"
          },
          result: {
            content: [
              {
                type: "text",
                text: "Read src/app/page.tsx"
              }
            ]
          },
          status: "completed"
        }
      },
      payloadOverflowId: null,
      projectionLossOverflowId: null,
      rawPayloadOverflowId: null,
      payloadTruncated: false,
      recordedAt: "2026-04-03T20:00:12.000Z",
      insertedAt: "2026-04-03T20:00:12.000Z"
    },
    {
      eventId: "event_2",
      turnId: "turn_2",
      runId: "run_456",
      threadId: "thread_456",
      itemId: "call_66_edit_2",
      eventSequence: 2,
      eventType: "item.completed",
      payload: {
        type: "item.completed",
        item: {
          id: "call_66_edit_2",
          type: "mcp_tool_call",
          server: "pi",
          tool: "edit",
          arguments: {
            path: "src/app/page.tsx"
          },
          result: {
            content: [
              {
                type: "text",
                text: "@@ edit 1 @@"
              }
            ]
          },
          status: "completed"
        }
      },
      payloadOverflowId: null,
      projectionLossOverflowId: null,
      rawPayloadOverflowId: null,
      payloadTruncated: false,
      recordedAt: "2026-04-03T20:02:24.000Z",
      insertedAt: "2026-04-03T20:02:24.000Z"
    },
    {
      eventId: "event_3",
      turnId: "turn_3",
      runId: "run_456",
      threadId: "thread_456",
      itemId: "call_66_read_3",
      eventSequence: 3,
      eventType: "item.completed",
      payload: {
        type: "item.completed",
        item: {
          id: "call_66_read_3",
          type: "mcp_tool_call",
          server: "pi",
          tool: "read",
          arguments: {
            path: "src/app/layout.tsx"
          },
          result: {
            content: [
              {
                type: "text",
                text: "Read src/app/layout.tsx"
              }
            ]
          },
          status: "completed"
        }
      },
      payloadOverflowId: null,
      projectionLossOverflowId: null,
      rawPayloadOverflowId: null,
      payloadTruncated: false,
      recordedAt: "2026-04-03T20:05:12.000Z",
      insertedAt: "2026-04-03T20:05:12.000Z"
    },
    {
      eventId: "event_4",
      turnId: "turn_3",
      runId: "run_456",
      threadId: "thread_456",
      itemId: "call_66_write_4",
      eventSequence: 4,
      eventType: "item.completed",
      payload: {
        type: "item.completed",
        item: {
          id: "call_66_write_4",
          type: "mcp_tool_call",
          server: "pi",
          tool: "write",
          arguments: {
            path: "src/app/layout.tsx"
          },
          result: {
            content: [
              {
                type: "text",
                text: "Updated src/app/layout.tsx"
              }
            ]
          },
          status: "completed"
        }
      },
      payloadOverflowId: null,
      projectionLossOverflowId: null,
      rawPayloadOverflowId: null,
      payloadTruncated: false,
      recordedAt: "2026-04-03T20:05:26.000Z",
      insertedAt: "2026-04-03T20:05:26.000Z"
    },
    {
      eventId: "event_5",
      turnId: "turn_3",
      runId: "run_456",
      threadId: "thread_456",
      itemId: "message_3",
      eventSequence: 5,
      eventType: "item.completed",
      payload: {
        type: "item.completed",
        item: {
          id: "message_3",
          type: "agent_message",
          text: "Task complete."
        }
      },
      payloadOverflowId: null,
      projectionLossOverflowId: null,
      rawPayloadOverflowId: null,
      payloadTruncated: false,
      recordedAt: turn3EndedAt,
      insertedAt: turn3EndedAt
    }
  ];

  return {
    ...result,
    ...overrides
  };
}

export function buildSymphonyAgentOverflowResult(
  overrides: Partial<SymphonyAgentOverflowResult> = {}
): SymphonyAgentOverflowResult {
  return {
    runId: "run_123",
    overflow: {
      overflowId: "overflow_message_123",
      runId: "run_123",
      turnId: "turn_123",
      itemId: "message_123",
      kind: "agent_message",
      contentJson: {
        text:
          "Task complete.\n\n- Lint passed\n- Tests passed\n- Smoke checks completed"
      },
      contentText:
        "Task complete.\n\n- Lint passed\n- Tests passed\n- Smoke checks completed",
      byteCount: 96,
      insertedAt: "2026-03-31T18:01:00.000Z"
    },
    ...overrides
  };
}

export function buildSymphonyForensicsRunDetailDiffDemoResult(
  overrides: Partial<SymphonyForensicsRunDetailResult> = {}
): SymphonyForensicsRunDetailResult {
  const result = buildSymphonyForensicsRunDetailResult();
  const runStartedAt = "2026-04-03T20:00:00.000Z";
  const turn1EndedAt = "2026-04-03T20:02:00.000Z";
  const turn2EndedAt = "2026-04-03T20:05:00.000Z";
  const turn3EndedAt = "2026-04-03T20:12:00.000Z";

  const turnTemplate = result.turns[0]!;

  result.issue = {
    ...result.issue,
    trackerIssueId: "issue_456",
    issueIdentifier: "COL-166",
    latestRunStartedAt: runStartedAt,
    latestRunId: "run_456",
    latestRunStatus: "finished",
    latestRunOutcome: "completed",
    runCount: 3,
    latestProblemOutcome: "completed",
    lastCompletedOutcome: "completed",
    latestDeliveryStatus: "completed",
    latestDeliveryReportedAt: turn3EndedAt,
    latestDeliveryRunId: "run_456",
    latestDeliveryPrUrl: "https://github.com/example/repo/pull/166",
    deliveredRunCount: 1,
    insertedAt: runStartedAt,
    updatedAt: turn3EndedAt
  };

  result.run = {
    ...result.run,
    runId: "run_456",
    trackerIssueId: "issue_456",
    issueIdentifier: "COL-166",
    attempt: 1,
    status: "finished",
    outcome: "completed",
    agentHarness: "pi",
    agentStatus: "completed",
    agentFailureKind: null,
    agentFailureOrigin: null,
    agentFailureMessagePreview: null,
    model: "xiaomi/mimo-v2-pro",
    workerHost: "worker-a",
    workspacePath: "/tmp/workspaces/col-166",
    startedAt: runStartedAt,
    endedAt: turn3EndedAt,
    commitHashStart: "abc",
    commitHashEnd: "def",
    turnCount: 3,
    eventCount: 5,
    lastEventType: "message.output",
    lastEventAt: turn3EndedAt,
    durationSeconds: 720,
    inputTokens: 120,
    cachedInputTokens: 40,
    outputTokens: 90,
    totalTokens: 250,
    deliveryStatus: "completed",
    deliveryReportedAt: turn3EndedAt,
    deliveryPrUrl: "https://github.com/example/repo/pull/166",
    machineLoad: {
      sampleCount: 6,
      maxCpuPercent: 71,
      avgCpuPercent: 52,
      maxMemoryPercent: 64,
      avgMemoryPercent: 58,
      maxDiskPercent: 47,
      avgDiskPercent: 47,
      hadHighCpu: false,
      hadHighMemory: false,
      hadHighDisk: false
    },
    threadId: "thread_456",
    processId: "pi-process-456",
    providerId: "openrouter",
    providerName: "OpenRouter",
    reasoningEffort: "high",
    profile: "mimo-v2-pro",
    authMode: "api_key_env",
    providerEnvKey: "OPENROUTER_API_KEY",
    launchTarget: {
      kind: "container",
      hostLaunchPath: "/tmp/workspaces/col-166",
      hostWorkspacePath: "/tmp/workspaces/col-166",
      runtimeWorkspacePath: "/workspace",
      containerId: "container-166",
      containerName: "symphony-col-166",
      shell: "sh"
    },
    repoStart: {},
    repoEnd: {},
    metadata: {},
    errorClass: null,
    errorMessage: null,
    insertedAt: runStartedAt,
    updatedAt: turn3EndedAt
  };

  result.deliveryReport = {
    reportId: "delivery_456",
    repositoryKey: DEFAULT_REPOSITORY_KEY,
    trackerIssueId: "issue_456",
    issueIdentifier: "COL-166",
    runId: "run_456",
    turnId: "turn_3",
    status: "completed",
    summary: "Completed the read/write diff sample.",
    prUrl: "https://github.com/example/repo/pull/166",
    prNumber: "166",
    branchName: "codex/col-166",
    blockingReason: null,
    testsSummary: "pnpm lint",
    source: "pi",
    reportedAt: turn3EndedAt,
    insertedAt: turn3EndedAt
  };

  result.turns = [
    {
      ...turnTemplate,
      turnId: "turn_1",
      runId: "run_456",
      turnSequence: 1,
      threadId: "thread_456",
      agentTurnId: null,
      promptText: "Turn 1",
      status: "completed",
      startedAt: runStartedAt,
      endedAt: turn1EndedAt,
      usage: {
        input_tokens: 30,
        cached_input_tokens: 10,
        output_tokens: 20
      },
      metadata: {},
      insertedAt: runStartedAt,
      updatedAt: turn1EndedAt,
      eventCount: 1,
      events: [
        {
          eventId: "event_1",
          turnId: "turn_1",
          runId: "run_456",
          eventSequence: 1,
          eventType: "item.completed",
          itemType: "mcp_tool_call",
          itemStatus: null,
          recordedAt: "2026-04-03T20:00:12.000Z",
          payload: {
            type: "item.completed",
            item: {
              id: "call_66_read_1",
              type: "mcp_tool_call",
              server: "pi",
              tool: "read",
              arguments: {
                path: "src/app/page.tsx"
              },
              result: {
                content: [
                  {
                    type: "text",
                    text: "Read src/app/page.tsx"
                  }
                ]
              },
              status: "completed"
            }
          },
          payloadTruncated: false,
          payloadBytes: 12,
          summary: "Read the page file.",
          agentTurnId: null,
          threadId: "thread_456",
          insertedAt: "2026-04-03T20:00:12.000Z"
        }
      ]
    },
    {
      ...turnTemplate,
      turnId: "turn_2",
      runId: "run_456",
      turnSequence: 2,
      threadId: "thread_456",
      agentTurnId: null,
      promptText: "Turn 2",
      status: "completed",
      startedAt: turn1EndedAt,
      endedAt: turn2EndedAt,
      usage: {
        input_tokens: 50,
        cached_input_tokens: 20,
        output_tokens: 30
      },
      metadata: {},
      insertedAt: turn1EndedAt,
      updatedAt: turn2EndedAt,
      eventCount: 1,
      events: [
        {
          eventId: "event_2",
          turnId: "turn_2",
          runId: "run_456",
          eventSequence: 1,
          eventType: "item.completed",
          itemType: "mcp_tool_call",
          itemStatus: null,
          recordedAt: "2026-04-03T20:02:24.000Z",
          payload: {
            type: "item.completed",
            item: {
              id: "call_66_edit_2",
              type: "mcp_tool_call",
              server: "pi",
              tool: "edit",
              arguments: {
                path: "src/app/page.tsx"
              },
              result: {
                content: [
                  {
                    type: "text",
                    text: "@@ edit 1 @@"
                  }
                ]
              },
              status: "completed"
            }
          },
          payloadTruncated: false,
          payloadBytes: 12,
          summary: "Applied a page edit.",
          agentTurnId: null,
          threadId: "thread_456",
          insertedAt: "2026-04-03T20:02:24.000Z"
        }
      ]
    },
    {
      ...turnTemplate,
      turnId: "turn_3",
      runId: "run_456",
      turnSequence: 3,
      threadId: "thread_456",
      agentTurnId: null,
      promptText: "Turn 3",
      status: "completed",
      startedAt: turn2EndedAt,
      endedAt: turn3EndedAt,
      usage: {
        input_tokens: 40,
        cached_input_tokens: 10,
        output_tokens: 40
      },
      metadata: {},
      insertedAt: turn2EndedAt,
      updatedAt: turn3EndedAt,
      eventCount: 3,
      events: [
        {
          eventId: "event_3",
          turnId: "turn_3",
          runId: "run_456",
          eventSequence: 1,
          eventType: "item.completed",
          itemType: "mcp_tool_call",
          itemStatus: null,
          recordedAt: "2026-04-03T20:05:12.000Z",
          payload: {
            type: "item.completed",
            item: {
              id: "call_66_read_3",
              type: "mcp_tool_call",
              server: "pi",
              tool: "read",
              arguments: {
                path: "src/app/layout.tsx"
              },
              result: {
                content: [
                  {
                    type: "text",
                    text: "Read src/app/layout.tsx"
                  }
                ]
              },
              status: "completed"
            }
          },
          payloadTruncated: false,
          payloadBytes: 12,
          summary: "Read the layout file.",
          agentTurnId: null,
          threadId: "thread_456",
          insertedAt: "2026-04-03T20:05:12.000Z"
        },
        {
          eventId: "event_4",
          turnId: "turn_3",
          runId: "run_456",
          eventSequence: 2,
          eventType: "item.completed",
          itemType: "mcp_tool_call",
          itemStatus: null,
          recordedAt: "2026-04-03T20:05:26.000Z",
          payload: {
            type: "item.completed",
            item: {
              id: "call_66_write_4",
              type: "mcp_tool_call",
              server: "pi",
              tool: "write",
              arguments: {
                path: "src/app/layout.tsx"
              },
              result: {
                content: [
                  {
                    type: "text",
                    text: "Updated src/app/layout.tsx"
                  }
                ]
              },
              status: "completed"
            }
          },
          payloadTruncated: false,
          payloadBytes: 12,
          summary: "Wrote the layout update.",
          agentTurnId: null,
          threadId: "thread_456",
          insertedAt: "2026-04-03T20:05:26.000Z"
        },
        {
          eventId: "event_5",
          turnId: "turn_3",
          runId: "run_456",
          eventSequence: 3,
          eventType: "item.completed",
          itemType: "agent_message",
          itemStatus: null,
          recordedAt: turn3EndedAt,
          payload: {
            type: "item.completed",
            item: {
              id: "message_3",
              type: "agent_message",
              text: "Task complete."
            }
          },
          payloadTruncated: false,
          payloadBytes: 12,
          summary: "Produced output",
          agentTurnId: null,
          threadId: "thread_456",
          insertedAt: turn3EndedAt
        }
      ]
    }
  ];

  return {
    ...result,
    ...overrides
  };
}
