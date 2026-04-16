import path from "node:path";
import { tmpdir } from "node:os";
import type {
  SymphonyRuntimeRunFinishAttrs,
  SymphonyRuntimeRunStartAttrs,
  SymphonyRuntimeTurnFinishAttrs,
  SymphonyRuntimeTurnStartAttrs
} from "@symphony/db";
import type { SymphonyOrchestratorSnapshot } from "@symphony/orchestrator";
import {
  buildSymphonyTrackerIssue
} from "@symphony/tracker";
import {
  buildSymphonyDefaultPiPresets,
  defaultSymphonyPiProfileDefaults,
  defaultSymphonyPiPresetName,
  type SymphonyResolvedRuntimePolicy
} from "@symphony/runtime-policy";

export { buildSymphonyTrackerIssue } from "@symphony/tracker";

let fixtureCounter = 0;

type RuntimeMergeResultFixture = {
  status: "merged" | "blocked";
  summary: string;
  prUrl: string | null;
  mergeCommitSha: string | null;
  blockingReason: string | null;
  testsSummary: string | null;
};

export function buildSymphonyRuntimePolicy(
  overrides: Partial<SymphonyResolvedRuntimePolicy> = {}
): SymphonyResolvedRuntimePolicy {
  const defaultPiProfileDefaults = defaultSymphonyPiProfileDefaults();
  const workspaceRoot =
    overrides.workspace?.root ?? path.join(tmpdir(), "symphony-test-workspaces");
  const {
    toolTimeoutMs: overriddenPiToolTimeoutMs,
    ...remainingPiOverrides
  } = overrides.pi ?? {};
  const resolvedPiPolicy = {
    profile: defaultPiProfileDefaults.profile,
    defaultModel: defaultPiProfileDefaults.defaultModel,
    defaultReasoningEffort: defaultPiProfileDefaults.defaultReasoningEffort,
    defaultPreset: defaultSymphonyPiPresetName,
    presets: buildSymphonyDefaultPiPresets({
      defaultModel: defaultPiProfileDefaults.defaultModel,
      defaultReasoningEffort: defaultPiProfileDefaults.defaultReasoningEffort
    }),
    provider: {
      ...defaultPiProfileDefaults.provider
    },
    turnTimeoutMs: 3_600_000,
    readTimeoutMs: 30_000,
    stallTimeoutMs: 300_000,
    ...remainingPiOverrides,
    toolTimeoutMs: overriddenPiToolTimeoutMs ?? null
  };

  return {
    tracker: {
      kind: "linear",
      endpoint: "https://api.linear.app/graphql",
      apiKey: "token",
      teamKey: "COL",
      excludedProjectIds: [],
      assignee: null,
      dispatchableStates: ["Todo", "Bootstrapping", "In Progress"],
      terminalStates: ["Canceled", "Done"],
      claimTransitionToState: "Bootstrapping",
      claimTransitionFromStates: ["Todo"],
      startupFailureTransitionToState: "Failed",
      pauseTransitionToState: "Paused",
      blockedTransitionToState: "Blocked",
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
      harness: "pi",
      maxConcurrentAgents: 10,
      maxTurns: 20,
      maxRetryBackoffMs: 300_000,
      maxConcurrentAgentsByState: {},
      ...overrides.agent
    },
    pi: {
      ...resolvedPiPolicy
    },
    agentRuntime: {
      command: "pi",
      approvalPolicy: "never",
      threadSandbox: "danger-full-access",
      turnSandboxPolicy: null,
      profile: null,
      defaultModel: null,
      defaultReasoningEffort: null,
      defaultPreset: defaultSymphonyPiPresetName,
      presets: buildSymphonyDefaultPiPresets({
        defaultModel: null,
        defaultReasoningEffort: null
      }),
      provider: null,
      turnTimeoutMs: 3_600_000,
      readTimeoutMs: 30_000,
      stallTimeoutMs: 300_000,
      ...overrides.agentRuntime
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
      ...overrides.github
    }
  };
}

export function buildRuntimeMergeResult(
  overrides: Partial<RuntimeMergeResultFixture> = {}
): RuntimeMergeResultFixture {
  return {
    status: "merged",
    summary: "Merged the PR after syncing with main.",
    prUrl: "https://github.com/openai/symphony/pull/123",
    mergeCommitSha: "abc123",
    blockingReason: null,
    testsSummary: "pnpm test",
    ...overrides
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
    runMode: "implementation" as const,
    threadId: null,
    workerHost: null,
    workspace: null,
    launchTarget: null,
    workspacePath: null,
    retryAttempt: 0,
    turnCount: 0,
    lastAgentMessage: null,
    lastAgentTimestamp: null,
    lastAgentEvent: null,
    agentInputTokens: 0,
    agentOutputTokens: 0,
    agentTotalTokens: 0,
    agentLastReportedInputTokens: 0,
    agentLastReportedOutputTokens: 0,
    agentLastReportedTotalTokens: 0,
    lastRateLimits: null,
    agentRuntimeProcessId: null,
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
    runMode: "implementation" as const,
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
    agentTotals: {
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
    repositoryKey: "openai/symphony",
    trackerIssueId: `issue-${fixtureCounter}`,
    issueIdentifier: `COL-${fixtureCounter}`,
    runId: `run-${fixtureCounter}`,
    attempt: 1,
    runMode: "implementation",
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
    turnId: `turn-${fixtureCounter}`,
    turnSequence: 1,
    threadId: `thread-${fixtureCounter}`,
    agentTurnId: `turn-${fixtureCounter}`,
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
