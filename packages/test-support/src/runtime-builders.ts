import type {
  SymphonyForensicsIssueDetailResult,
  SymphonyForensicsIssueListResult,
  SymphonyForensicsProblemRunsResult,
  SymphonyForensicsRunDetailResult,
  SymphonyRuntimeIssueResult,
  SymphonyRuntimeRefreshResult,
  SymphonyRuntimeStateResult
} from "@symphony/contracts";

const DEFAULT_REPOSITORY_KEY = "symphony";

export function buildSymphonyRuntimeEnv(
  overrides: Partial<
    Record<
      | "PORT"
      | "SYMPHONY_DB_FILE"
      | "SYMPHONY_SOURCE_REPO"
      | "SYMPHONY_TRACKER_KIND"
      | "SYMPHONY_LINEAR_TEAM_KEY"
      | "SYMPHONY_WORKSPACE_ROOT"
      | "SYMPHONY_DOCKER_WORKSPACE_IMAGE"
      | "SYMPHONY_DOCKER_MATERIALIZATION_MODE"
      | "SYMPHONY_DOCKER_WORKSPACE_PATH"
      | "SYMPHONY_DOCKER_CONTAINER_NAME_PREFIX"
      | "SYMPHONY_DOCKER_SHELL"
      | "SYMPHONY_ALLOWED_ORIGINS"
      | "LINEAR_API_KEY"
      | "LOG_LEVEL",
      string
    >
  > = {}
): Record<string, string | undefined> {
  return {
    PORT: "4500",
    SYMPHONY_DB_FILE: "/tmp/symphony.db",
    SYMPHONY_SOURCE_REPO: "/tmp/source-repo",
    SYMPHONY_TRACKER_KIND: "linear",
    SYMPHONY_LINEAR_TEAM_KEY: "COL",
    SYMPHONY_WORKSPACE_ROOT: "/tmp/workspaces",
    SYMPHONY_DOCKER_WORKSPACE_IMAGE: undefined,
    SYMPHONY_DOCKER_MATERIALIZATION_MODE: undefined,
    SYMPHONY_DOCKER_WORKSPACE_PATH: undefined,
    SYMPHONY_DOCKER_CONTAINER_NAME_PREFIX: undefined,
    SYMPHONY_DOCKER_SHELL: undefined,
    SYMPHONY_ALLOWED_ORIGINS: "http://localhost:3000,http://127.0.0.1:3000",
    LINEAR_API_KEY: "test-linear-api-key",
    LOG_LEVEL: "debug",
    ...overrides
  };
}

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

  const defaultContainerLaunchTarget: RetryLaunchTarget = {
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
      launchTarget: defaultContainerLaunchTarget
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
        ? { ...defaultContainerLaunchTarget }
        : entry.launchTarget
  }));

  return {
    counts: {
      running: 1,
      retrying: 1
    },
    running,
    retrying,
    agentTotals: {
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
          "Pi selection is label-driven. Use model:<preset> for repo-defined tiers or model:<model> for a direct model override."
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
      cachedInputTokens: 1200,
      outputTokens: 2500,
      totalTokens: 9700
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
      repositories: [DEFAULT_REPOSITORY_KEY],
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
        agentStatus: "paused",
        agentFailureKind: "max_turns_reached",
        agentFailureOrigin: "agent",
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
      threadId: null,
      processId: null,
      providerId: null,
      providerName: null,
      reasoningEffort: null,
      profile: null,
      authMode: null,
      providerEnvKey: null,
      launchTarget: null,
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
        threadId: "thread_123",
        agentTurnId: null,
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
            threadId: "thread_123",
            agentTurnId: null,
            insertedAt: "2026-03-31T18:01:00.000Z"
          }
        ]
      }
    ],
    ...overrides
  };
}
