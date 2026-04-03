import path from "node:path";
import { tmpdir } from "node:os";
import type {
  SymphonyGitHubReviewEvent
} from "@symphony/core/github";
import type { SymphonyOrchestratorSnapshot } from "@symphony/core/orchestration";
import type {
  SymphonyEventAttrs,
  SymphonyRunFinishAttrs,
  SymphonyRunStartAttrs,
  SymphonyTurnFinishAttrs,
  SymphonyTurnStartAttrs
} from "@symphony/run-journal";
import {
  issueBranchName,
  type SymphonyTrackerIssue
} from "@symphony/core/tracker";
import {
  type SymphonyResolvedWorkflowConfig
} from "@symphony/core";

let fixtureCounter = 0;

export function buildSymphonyWorkflowConfig(
  overrides: Partial<SymphonyResolvedWorkflowConfig> = {}
): SymphonyResolvedWorkflowConfig {
  const workspaceRoot =
    overrides.workspace?.root ?? path.join(tmpdir(), "symphony-test-workspaces");
  const githubStatePath =
    overrides.github?.statePath === undefined
      ? path.join(workspaceRoot, ".symphony", "github-state.json")
      : overrides.github.statePath;

  return {
    tracker: {
      kind: "linear",
      endpoint: "https://api.linear.app/graphql",
      apiKey: "token",
      projectSlug: "coldets",
      teamKey: null,
      excludedProjectIds: [],
      assignee: null,
      dispatchableStates: ["Todo", "In Progress", "Rework"],
      terminalStates: ["Canceled", "Done"],
      claimTransitionToState: "In Progress",
      claimTransitionFromStates: ["Todo", "Rework"],
      startupFailureTransitionToState: "Backlog",
      ...overrides.tracker
    },
    polling: {
      intervalMs: 5_000,
      ...overrides.polling
    },
    workspace: {
      root: workspaceRoot,
      ...overrides.workspace
    },
    worker: {
      sshHosts: [],
      maxConcurrentAgentsPerHost: null,
      ...overrides.worker
    },
    agent: {
      maxConcurrentAgents: 10,
      maxTurns: 20,
      maxRetryBackoffMs: 300_000,
      maxConcurrentAgentsByState: {},
      ...overrides.agent
    },
    codex: {
      command: "codex app-server",
      approvalPolicy: {
        reject: {
          sandbox_approval: true
        }
      },
      threadSandbox: "workspace-write",
      turnSandboxPolicy: null,
      turnTimeoutMs: 3_600_000,
      readTimeoutMs: 5_000,
      stallTimeoutMs: 300_000,
      ...overrides.codex
    },
    hooks: {
      afterCreate: null,
      beforeRun: null,
      afterRun: null,
      beforeRemove: null,
      timeoutMs: 60_000,
      ...overrides.hooks
    },
    observability: {
      dashboardEnabled: true,
      refreshMs: 1_000,
      renderIntervalMs: 16,
      ...overrides.observability
    },
    server: {
      port: null,
      host: "0.0.0.0",
      ...overrides.server
    },
    github: {
      repo: "openai/symphony",
      webhookSecret: null,
      apiToken: null,
      statePath: githubStatePath,
      allowedReviewLogins: [],
      allowedReworkCommentLogins: [],
      ...overrides.github
    }
  };
}

export function buildSymphonyTrackerIssue(
  overrides: Partial<SymphonyTrackerIssue> = {}
): SymphonyTrackerIssue {
  const identifier = overrides.identifier ?? "COL-123";

  return {
    id: overrides.id ?? "issue-123",
    identifier,
    title: overrides.title ?? "Test issue",
    description: overrides.description ?? "Test description",
    priority: overrides.priority ?? 2,
    state: overrides.state ?? "Todo",
    branchName: overrides.branchName ?? issueBranchName(identifier),
    url: overrides.url ?? `https://linear.app/coldets/issue/${identifier.toLowerCase()}`,
    projectId: overrides.projectId ?? "project-1",
    projectName:
      overrides.projectName ?? "Symphony Developer Control Plane Foundation",
    projectSlug: overrides.projectSlug ?? "coldets",
    teamKey: overrides.teamKey ?? "COL",
    assigneeId: overrides.assigneeId ?? "worker-1",
    blockedBy: overrides.blockedBy ?? [],
    labels: overrides.labels ?? [],
    assignedToWorker: overrides.assignedToWorker ?? true,
    createdAt: overrides.createdAt ?? "2026-03-31T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-03-31T00:00:00.000Z"
  };
}

export function buildSymphonyGithubReviewEvent(
  overrides: Partial<
    Extract<SymphonyGitHubReviewEvent, { event: "pull_request_review" }>
  > = {}
): SymphonyGitHubReviewEvent {
  const payload =
    "payload" in overrides && overrides.payload
      ? overrides.payload
      : {
          reviewState: "changes_requested",
          authorLogin: "reviewer",
          headRef: "symphony/COL-123",
          headSha: "abc123",
          reviewId: 1,
          pullRequestUrl: "https://api.github.com/repos/openai/symphony/pulls/123",
          pullRequestHtmlUrl: "https://github.com/openai/symphony/pull/123"
        };

  return {
    event: "pull_request_review",
    repository: "openai/symphony",
    ...overrides,
    payload
  };
}

export function buildSymphonyGithubIssueCommentEvent(
  overrides: Partial<Extract<SymphonyGitHubReviewEvent, { event: "issue_comment" }>> = {}
): SymphonyGitHubReviewEvent {
  const payload =
    "payload" in overrides && overrides.payload
      ? overrides.payload
      : {
          issueNumber: 123,
          commentId: 456,
          commentBody: "/rework Please address the feedback.",
          authorLogin: "reviewer",
          pullRequestUrl: "https://api.github.com/repos/openai/symphony/pulls/123"
        };

  return {
    event: "issue_comment",
    repository: "openai/symphony",
    ...overrides,
    payload
  };
}

export function buildSymphonyOrchestratorSnapshot(
  overrides: Partial<
    Omit<SymphonyOrchestratorSnapshot, "running" | "retrying">
  > & {
    running?: Array<Partial<SymphonyOrchestratorSnapshot["running"][number]>>;
    retrying?: Array<Partial<SymphonyOrchestratorSnapshot["retrying"][number]>>;
  } = {}
): SymphonyOrchestratorSnapshot {
  const running = (overrides.running ?? []).map((entry) => ({
    issueId: "issue-123",
    issue: buildSymphonyTrackerIssue(),
    runId: "run-123",
    sessionId: null,
    workerHost: null,
    workspace: null,
    launchTarget: null,
    workspacePath: null,
    retryAttempt: 0,
    turnCount: 0,
    lastCodexMessage: null,
    lastCodexTimestamp: null,
    lastCodexEvent: null,
    codexInputTokens: 0,
    codexOutputTokens: 0,
    codexTotalTokens: 0,
    codexLastReportedInputTokens: 0,
    codexLastReportedOutputTokens: 0,
    codexLastReportedTotalTokens: 0,
    lastRateLimits: null,
    codexAppServerPid: null,
    startedAt: "2026-03-31T00:00:00.000Z",
    runtimeSeconds: 0,
    ...entry
  }));
  const retrying = (overrides.retrying ?? []).map((entry) => ({
    issueId: "issue-123",
    attempt: 1,
    dueAtMs: Date.parse("2026-03-31T00:00:00.000Z"),
    retryToken: "retry-token-123",
    identifier: "COL-123",
    error: null,
    workerHost: null,
    workspace: null,
    launchTarget: null,
    workspacePath: null,
    delayType: "failure" as const,
    ...entry
  }));

  return {
    running,
    retrying,
    claimedIssueIds: [],
    completedIssueIds: [],
    pollIntervalMs: 5_000,
    maxConcurrentAgents: 10,
    nextPollDueAtMs: null,
    pollCheckInProgress: false,
    codexTotals: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      secondsRunning: 0
    },
    rateLimits: null,
    ...Object.fromEntries(
      Object.entries(overrides).filter(
        ([key]) => key !== "running" && key !== "retrying"
      )
    )
  };
}

export function buildSymphonyRunStartAttrs(
  overrides: Partial<SymphonyRunStartAttrs> = {}
): SymphonyRunStartAttrs {
  fixtureCounter += 1;

  return {
    issueId: `issue-${fixtureCounter}`,
    issueIdentifier: `COL-${fixtureCounter}`,
    attempt: 1,
    status: "running",
    workerHost: "docker-host",
    workspacePath: `/tmp/COL-${fixtureCounter}`,
    startedAt: new Date("2026-03-31T00:00:00.000Z"),
    commitHashStart: `commit-start-${fixtureCounter}`,
    repoStart: {
      dirty: true
    },
    metadata: {
      pickedUpBy: "test"
    },
    ...overrides
  };
}

export function buildSymphonyTurnStartAttrs(
  overrides: Partial<SymphonyTurnStartAttrs> = {}
): SymphonyTurnStartAttrs {
  fixtureCounter += 1;

  return {
    turnSequence: 1,
    codexThreadId: `thread-${fixtureCounter}`,
    codexTurnId: `turn-${fixtureCounter}`,
    codexSessionId: `session-${fixtureCounter}`,
    promptText: "Implement the requested change.",
    status: "running",
    startedAt: new Date("2026-03-31T00:00:00.000Z"),
    metadata: {
      source: "test"
    },
    ...overrides
  };
}

export function buildSymphonyEventAttrs(
  overrides: Partial<SymphonyEventAttrs> = {}
): SymphonyEventAttrs {
  fixtureCounter += 1;

  return {
    eventSequence: 1,
    eventType: "session_started",
    recordedAt: new Date("2026-03-31T00:00:01.000Z"),
    payload: {
      event: "session_started",
      sessionId: `session-${fixtureCounter}`
    },
    summary: "session started",
    codexThreadId: `thread-${fixtureCounter}`,
    codexTurnId: `turn-${fixtureCounter}`,
    codexSessionId: `session-${fixtureCounter}`,
    ...overrides
  };
}

export function buildSymphonyTurnFinishAttrs(
  overrides: Partial<SymphonyTurnFinishAttrs> = {}
): SymphonyTurnFinishAttrs {
  return {
    status: "completed",
    endedAt: new Date("2026-03-31T00:00:10.000Z"),
    tokens: {
      inputTokens: 11,
      outputTokens: 7,
      totalTokens: 18
    },
    ...overrides
  };
}

export function buildSymphonyRunFinishAttrs(
  overrides: Partial<SymphonyRunFinishAttrs> = {}
): SymphonyRunFinishAttrs {
  return {
    status: "finished",
    outcome: "paused_max_turns",
    endedAt: new Date("2026-03-31T00:01:00.000Z"),
    commitHashEnd: "commit-end",
    repoEnd: {
      dirty: true
    },
    errorClass: "max_turns_reached",
    errorMessage: "Reached the configured max turns.",
    ...overrides
  };
}
