import type {
  SymphonyCodexOverflowResult,
  SymphonyCodexRunArtifactsResult,
  SymphonyForensicsIssueDetailResult,
  SymphonyForensicsIssueForensicsBundleResult,
  SymphonyForensicsIssueListResult,
  SymphonyForensicsProblemRunsResult,
  SymphonyForensicsRunDetailResult,
  SymphonyRuntimeHealthResult,
  SymphonyRuntimeIssueResult,
  SymphonyRuntimeLogsResult,
  SymphonyRuntimeRefreshResult,
  SymphonyRuntimeLogEntry,
  SymphonyRuntimeStateResult
} from "@symphony/contracts";

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
    runtimePath: "/home/agent/workspace",
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
      workspacePath: "/home/agent/workspace",
      containerId: "container-166",
      containerName: "symphony-col-166",
      hostPath: "/tmp/workspaces/col-166"
    },
    materialization: {
      kind: "bind_mount",
      hostPath: "/tmp/workspaces/col-166",
      containerPath: "/home/agent/workspace"
    }
  };

  const defaultRunningWorkspace: RuntimeWorkspace = {
    ...defaultDockerWorkspace,
    hostPath: "/tmp/workspaces/col-165",
    runtimePath: "/home/agent/workspace",
    containerId: "container-165",
    containerName: "symphony-col-165",
    networkName: "symphony-network-col-165",
    executionTarget: {
      kind: "container",
      workspacePath: "/home/agent/workspace",
      containerId: "container-165",
      containerName: "symphony-col-165",
      hostPath: "/tmp/workspaces/col-165"
    },
    materialization: {
      kind: "bind_mount",
      hostPath: "/tmp/workspaces/col-165",
      containerPath: "/home/agent/workspace"
    }
  };

  const defaultRunningLaunchTarget: RuntimeLaunchTarget = {
    kind: "container",
    hostLaunchPath: "/tmp/workspaces/col-165",
    hostWorkspacePath: "/tmp/workspaces/col-165",
    runtimeWorkspacePath: "/home/agent/workspace",
    containerId: "container-165",
    containerName: "symphony-col-165",
    shell: "sh"
  };

  const defaultRetryLaunchTarget: RetryLaunchTarget = {
    kind: "container",
    hostLaunchPath: "/tmp/workspaces/col-166",
    hostWorkspacePath: "/tmp/workspaces/col-166",
    runtimeWorkspacePath: "/home/agent/workspace",
    containerId: "container-166",
    containerName: "symphony-col-166",
    shell: "sh"
  };

  const running = (overrides.running ?? [
    {
      issueId: "issue_123",
      issueIdentifier: "COL-165",
      state: "In Progress",
      workerHost: "worker-b",
      workspacePath: "/tmp/workspaces/col-165",
      sessionId: "session_123",
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
    issueId: "issue_123",
    issueIdentifier: "COL-165",
    state: "In Progress",
    workerHost: "worker-b",
    workspacePath: "/tmp/workspaces/col-165",
    sessionId: "session_123",
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
      issueId: "issue_456",
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
    issueId: "issue_456",
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
      running: 1,
      retrying: 1
    },
    running,
    retrying,
    codexTotals: {
      inputTokens: 200,
      outputTokens: 120,
      totalTokens: 320,
      secondsRunning: 95
    },
    rateLimits: {
      remaining: 3
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
    runtimePath: "/home/agent/workspace",
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
      workspacePath: "/home/agent/workspace",
      containerId: "container-167",
      containerName: "symphony-col-167",
      hostPath: "/tmp/symphony-COL-167"
    },
    materialization: {
      kind: "bind_mount",
      hostPath: "/tmp/symphony-COL-167",
      containerPath: "/home/agent/workspace"
    }
  };

  const defaultRunning: NonNullable<SymphonyRuntimeIssueResult["running"]> = {
    workerHost: "worker-b",
    workspacePath: "/tmp/symphony-COL-167",
    sessionId: "session-167",
    launchTarget: {
      kind: "container",
      hostLaunchPath: "/tmp/symphony-COL-167",
      hostWorkspacePath: "/tmp/symphony-COL-167",
      runtimeWorkspacePath: "/home/agent/workspace",
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
    issueId: "issue-167",
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
        "Refresh runs the normal poll/reconcile cycle now. Requeue still happens through /rework on GitHub or the admitted Linear state flow.",
      codex: {
        defaultModel: "xiaomi/mimo-v2-pro",
        selectedModel: "xiaomi/mimo-v2-pro",
        availableModels: [
          "xiaomi/mimo-v2-pro",
          "gpt-5.4",
          "gpt-5.4-mini",
          "gpt-5.3-codex-spark"
        ],
        modelOverrideLabelPrefix: "symphony:model:",
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
      }
    ],
    totals: {
      issueCount: 1,
      runCount: 3,
      completedRunCount: 1,
      problemRunCount: 2,
      rateLimitedCount: 1,
      maxTurnsCount: 1,
      startupFailureCount: 0,
      inputTokens: 6000,
      outputTokens: 2500,
      totalTokens: 8500
    },
    filters: {
      limit: null,
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
      outcomes: ["completed", "max_turns", "rate_limited"],
      errorClasses: ["max_turns", "rate_limit_exceeded"]
    },
    ...overrides
  };
}

export function buildSymphonyForensicsIssueDetailResult(
  overrides: Partial<SymphonyForensicsIssueDetailResult> = {}
): SymphonyForensicsIssueDetailResult {
  return {
    issueIdentifier: "COL-165",
    runs: [
      {
        runId: "run_12345678",
        issueId: "issue_123",
        issueIdentifier: "COL-165",
        attempt: 1,
        status: "finished",
        outcome: "completed",
        agentHarness: "codex",
        codexStatus: "completed",
        codexFailureKind: null,
        codexFailureOrigin: null,
        codexFailureMessagePreview: null,
        codexModel: "xiaomi/mimo-v2-pro",
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
        outputTokens: 80,
        totalTokens: 200
      }
    ],
    summary: {
      runCount: 3,
      latestProblemOutcome: "max_turns",
      lastCompletedOutcome: "completed"
    },
    filters: {
      limit: 200
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
        level: "info",
        source: "runtime",
        eventType: "manual_refresh_queued",
        message: "Queued manual refresh request.",
        issueId: "issue_123",
        issueIdentifier: "COL-165",
        runId: "run_12345678",
        payload: {
          queued: true
        },
        recordedAt: "2026-03-31T18:03:00.000Z"
      },
      {
        entryId: "runtime-log-2",
        level: "warn",
        source: "workspace",
        eventType: "rate_limit_warning",
        message: "Approaching upstream rate limit.",
        issueId: "issue_123",
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
          issueId: "issue_123",
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
          issueId: "issue_123",
          issueIdentifier: "COL-165",
          runId: "run_12345678",
          turnId: "turn_123",
          source: "codex",
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
        issueId: "issue_123",
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
        issueId: "issue_123",
        issueIdentifier: "COL-165",
        runId: "run_12345678",
        turnId: "turn_123",
        source: "codex",
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
        runId: "run_12345678",
        issueId: "issue_123",
        issueIdentifier: "COL-165",
        attempt: 1,
        status: "finished",
        outcome: "max_turns",
        agentHarness: "codex",
        codexStatus: "failed",
        codexFailureKind: "max_turns",
        codexFailureOrigin: "runtime",
        codexFailureMessagePreview: "Reached max turns.",
        codexModel: "xiaomi/mimo-v2-pro",
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
        outputTokens: 80,
        totalTokens: 200
      }
    ],
    problemSummary: {
      max_turns: 2
    },
    filters: {
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
        level: "info",
        source: "runtime",
        eventType: "db_initialized",
        message: "Initialized Symphony DB.",
        issueId: null,
        issueIdentifier: null,
        runId: null,
        payload: {
          dbFile: "/tmp/symphony.db"
        },
        recordedAt: "2026-03-31T18:00:00.000Z"
      },
      {
        entryId: "runtime-log-2",
        level: "warn",
        source: "tracker",
        eventType: "tracker_placeholder_active",
        message: "Using in-memory tracker placeholder.",
        issueId: null,
        issueIdentifier: null,
        runId: null,
        payload: null,
        recordedAt: "2026-03-31T18:01:00.000Z"
      }
    ],
    filters: {
      limit: 200,
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
    ...overrides
  };
}

export function buildSymphonyForensicsRunDetailResult(
  overrides: Partial<SymphonyForensicsRunDetailResult> = {}
): SymphonyForensicsRunDetailResult {
  return {
    issue: {
      issueId: "issue_123",
      issueIdentifier: "COL-165",
      latestRunStartedAt: "2026-03-31T18:00:00.000Z",
      latestRunId: "run_123",
      latestRunStatus: "finished",
      latestRunOutcome: "completed",
      runCount: 3,
      latestProblemOutcome: "max_turns",
      lastCompletedOutcome: "completed",
      insertedAt: "2026-03-31T18:00:00.000Z",
      updatedAt: "2026-03-31T18:05:00.000Z"
    },
    run: {
      runId: "run_123",
      issueId: "issue_123",
      issueIdentifier: "COL-165",
      attempt: 1,
      status: "finished",
      outcome: "completed",
      agentHarness: "codex",
      codexStatus: "completed",
      codexFailureKind: null,
      codexFailureOrigin: null,
      codexFailureMessagePreview: null,
      codexModel: "xiaomi/mimo-v2-pro",
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
      outputTokens: 80,
      totalTokens: 200,
      codexThreadId: "thread_123",
      codexProviderId: "openrouter",
      codexProviderName: "OpenRouter",
      codexAuthMode: "api_key_env",
      codexProviderEnvKey: "OPENROUTER_API_KEY",
      repoStart: {},
      repoEnd: {},
      metadata: {},
      errorClass: null,
      errorMessage: null,
      insertedAt: "2026-03-31T18:00:00.000Z",
      updatedAt: "2026-03-31T18:02:00.000Z"
    },
    turns: [
      {
        turnId: "turn_123",
        runId: "run_123",
        turnSequence: 1,
        codexThreadId: null,
        codexTurnId: null,
        codexSessionId: "session_123",
        promptText: "Solve the task",
        status: "completed",
        startedAt: "2026-03-31T18:00:00.000Z",
        endedAt: "2026-03-31T18:01:00.000Z",
        usage: {
          input_tokens: 120,
          cached_input_tokens: 0,
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
            codexThreadId: null,
            codexTurnId: null,
            codexSessionId: "session_123",
            insertedAt: "2026-03-31T18:01:00.000Z"
          }
        ]
      }
    ],
    ...overrides
  };
}

export function buildSymphonyCodexRunArtifactsResult(
  overrides: Partial<SymphonyCodexRunArtifactsResult> = {}
): SymphonyCodexRunArtifactsResult {
  return {
    run: {
      runId: "run_123",
      threadId: "thread_123",
      harnessKind: "codex",
      model: "xiaomi/mimo-v2-pro",
      providerId: "openrouter",
      providerName: "OpenRouter",
      issueId: "issue_123",
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
        harnessKind: "codex",
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
        cachedInputTokens: 0,
        outputTokens: 80,
        totalTokens: 200,
        usage: {
          input_tokens: 120,
          cached_input_tokens: 0,
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
        startedAt: "2026-03-31T18:00:12.000Z",
        completedAt: "2026-03-31T18:00:30.000Z",
        durationMs: 18_000,
        outputPreview: "pnpm lint && pnpm test passed",
        outputOverflowId: null,
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
            content: [
              {
                type: "text",
                text: "Fetched the latest issue metadata from Linear."
              }
            ],
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

export function buildSymphonyCodexOverflowResult(
  overrides: Partial<SymphonyCodexOverflowResult> = {}
): SymphonyCodexOverflowResult {
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
