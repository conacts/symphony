import type {
  SymphonyForensicsIssueDetailResult,
  SymphonyForensicsIssueListResult,
  SymphonyForensicsProblemRunsResult,
  SymphonyForensicsRunDetailResult,
  SymphonyRuntimeIssueResult,
  SymphonyRuntimeRefreshResult,
  SymphonyRuntimeStateResult
} from "@symphony/contracts";

export function buildSymphonyRuntimeEnv(
  overrides: Partial<
    Record<
      | "PORT"
      | "WORKFLOW_PATH"
      | "SYMPHONY_DB_FILE"
      | "SYMPHONY_SOURCE_REPO"
      | "SYMPHONY_WORKSPACE_BACKEND"
      | "SYMPHONY_DOCKER_WORKSPACE_IMAGE"
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
    WORKFLOW_PATH: "/tmp/WORKFLOW.md",
    SYMPHONY_DB_FILE: "/tmp/symphony.db",
    SYMPHONY_SOURCE_REPO: "/tmp/source-repo",
    SYMPHONY_WORKSPACE_BACKEND: "local",
    SYMPHONY_DOCKER_WORKSPACE_IMAGE: undefined,
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

  const defaultLocalWorkspace: RuntimeWorkspace = {
    backendKind: "local",
    workerHost: "worker-a",
    prepareDisposition: "reused",
    executionTargetKind: "host_path",
    materializationKind: "directory",
    containerDisposition: "not_applicable",
    networkDisposition: "not_applicable",
    hostPath: "/tmp/workspaces/col-165",
    runtimePath: "/tmp/workspaces/col-165",
    containerId: null,
    containerName: null,
    networkName: null,
    services: [],
    envBundleSummary: {
      source: "ambient",
      injectedKeys: ["LINEAR_API_KEY"],
      requiredHostKeys: [],
      optionalHostKeys: [],
      staticBindingKeys: [],
      runtimeBindingKeys: [],
      serviceBindingKeys: []
    },
    manifestLifecycle: null,
    path: "/tmp/workspaces/col-165",
    executionTarget: {
      kind: "host_path",
      path: "/tmp/workspaces/col-165"
    },
    materialization: {
      kind: "directory",
      hostPath: "/tmp/workspaces/col-165"
    }
  };

  const defaultHostLaunchTarget: RuntimeLaunchTarget = {
    kind: "host_path",
    hostWorkspacePath: "/tmp/workspaces/col-165",
    runtimeWorkspacePath: "/tmp/workspaces/col-165"
  };

  const defaultDockerWorkspace: RuntimeWorkspace = {
    backendKind: "docker",
    workerHost: "worker-b",
    prepareDisposition: "reused",
    executionTargetKind: "container",
    materializationKind: "bind_mount",
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

  const defaultContainerLaunchTarget: RetryLaunchTarget = {
    kind: "container",
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
      workerHost: "worker-a",
      workspacePath: "/tmp/workspaces/col-165",
      sessionId: "session_123",
      workspace: defaultLocalWorkspace,
      launchTarget: defaultHostLaunchTarget,
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
    workerHost: "worker-a",
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
        ? { ...defaultLocalWorkspace }
        : entry.workspace,
    launchTarget:
      entry.launchTarget === undefined
        ? { ...defaultHostLaunchTarget }
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
      launchTarget: defaultContainerLaunchTarget
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
    backendKind: "local",
    workerHost: "local",
    prepareDisposition: "reused",
    executionTargetKind: "host_path",
    materializationKind: "directory",
    containerDisposition: "not_applicable",
    networkDisposition: "not_applicable",
    hostPath: "/tmp/symphony-COL-167",
    runtimePath: "/tmp/symphony-COL-167",
    containerId: null,
    containerName: null,
    networkName: null,
    services: [],
    envBundleSummary: {
      source: "ambient",
      injectedKeys: ["LINEAR_API_KEY"],
      requiredHostKeys: [],
      optionalHostKeys: [],
      staticBindingKeys: [],
      runtimeBindingKeys: [],
      serviceBindingKeys: []
    },
    manifestLifecycle: null,
    path: "/tmp/symphony-COL-167",
    executionTarget: {
      kind: "host_path",
      path: "/tmp/symphony-COL-167"
    },
    materialization: {
      kind: "directory",
      hostPath: "/tmp/symphony-COL-167"
    }
  };
  const defaultRunning: NonNullable<SymphonyRuntimeIssueResult["running"]> = {
    workerHost: "local",
    workspacePath: "/tmp/symphony-COL-167",
    sessionId: "session-167",
    launchTarget: {
      kind: "host_path",
      hostWorkspacePath: "/tmp/symphony-COL-167",
      runtimeWorkspacePath: "/tmp/symphony-COL-167"
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
              workerHost: "local",
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
        "Refresh runs the normal poll/reconcile cycle now. Requeue still happens through /rework on GitHub or the admitted Linear state flow."
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
        tokens: {},
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
            eventType: "message.output",
            recordedAt: "2026-03-31T18:01:00.000Z",
            payload: {
              text: "done"
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
