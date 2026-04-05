import path from "node:path";
import { tmpdir } from "node:os";
import type {
  SymphonyRuntimeRunFinishAttrs,
  SymphonyRuntimeRunStartAttrs,
  SymphonyRuntimeTurnFinishAttrs,
  SymphonyRuntimeTurnStartAttrs
} from "@symphony/db";
import type {
  SymphonyGitHubReviewEvent
} from "@symphony/github-review";
import type { SymphonyOrchestratorSnapshot } from "@symphony/orchestrator";
import {
  buildSymphonyTrackerIssue
} from "@symphony/tracker";
import type { SymphonyResolvedRuntimePolicy } from "@symphony/runtime-policy";

export { buildSymphonyTrackerIssue } from "@symphony/tracker";

let fixtureCounter = 0;

export function buildSymphonyRuntimePolicy(
  overrides: Partial<SymphonyResolvedRuntimePolicy> = {}
): SymphonyResolvedRuntimePolicy {
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
      dispatchableStates: ["Todo", "Bootstrapping", "In Progress", "Rework"],
      terminalStates: ["Canceled", "Done"],
      claimTransitionToState: "Bootstrapping",
      claimTransitionFromStates: ["Todo", "Rework"],
      startupFailureTransitionToState: "Backlog",
      pauseTransitionToState: "Paused",
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
      harness: "codex",
      maxConcurrentAgents: 10,
      maxTurns: 20,
      maxRetryBackoffMs: 300_000,
      maxConcurrentAgentsByState: {},
      ...overrides.agent
    },
    opencode: {
      profile: null,
      defaultModel: null,
      defaultReasoningEffort: null,
      provider: null,
      ...overrides.opencode
    },
    pi: {
      profile: null,
      defaultModel: null,
      defaultReasoningEffort: null,
      provider: null,
      ...overrides.pi
    },
    codex: {
      command: "codex",
      approvalPolicy: "never",
      threadSandbox: "danger-full-access",
      turnSandboxPolicy: null,
      profile: null,
      defaultModel: null,
      defaultReasoningEffort: null,
      provider: null,
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
  overrides: Partial<SymphonyRuntimeRunStartAttrs> = {}
): SymphonyRuntimeRunStartAttrs {
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
  overrides: Partial<SymphonyRuntimeTurnStartAttrs> = {}
): SymphonyRuntimeTurnStartAttrs {
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

export function buildSymphonyTurnFinishAttrs(
  overrides: Partial<SymphonyRuntimeTurnFinishAttrs> = {}
): SymphonyRuntimeTurnFinishAttrs {
  return {
    status: "completed",
    endedAt: new Date("2026-03-31T00:00:10.000Z"),
    usage: {
      input_tokens: 11,
      cached_input_tokens: 0,
      output_tokens: 7
    },
    ...overrides
  };
}

export function buildSymphonyRunFinishAttrs(
  overrides: Partial<SymphonyRuntimeRunFinishAttrs> = {}
): SymphonyRuntimeRunFinishAttrs {
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
