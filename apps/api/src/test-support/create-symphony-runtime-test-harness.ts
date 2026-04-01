import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  createMemorySymphonyTracker,
  createSymphonyForensicsReadModel,
  SymphonyGithubReviewProcessor,
  type SymphonyEventAttrs,
  type SymphonyLoadedWorkflow,
  type SymphonyOrchestratorSnapshot,
  type SymphonyResolvedWorkflowConfig,
  type SymphonyRunFinishAttrs,
  type SymphonyRunStartAttrs,
  type SymphonyTrackerIssue,
  type SymphonyTurnFinishAttrs,
  type SymphonyTurnStartAttrs
} from "@symphony/core";
import {
  createSymphonyIssueTimelineStore,
  createSymphonyRuntimeLogStore,
  createSqliteSymphonyRunJournal,
  initializeSymphonyDb
} from "@symphony/db";
import { createSilentSymphonyLogger } from "@symphony/logger";
import { createSymphonyGitHubReviewIngressService } from "../core/github-review-ingress.js";
import type { SymphonyRuntimeAppServices } from "../core/runtime-services.js";
import { createSymphonyRealtimeHub } from "../realtime/symphony-realtime-hub.js";

export type SymphonyRuntimeTestHarness = {
  cleanup(): Promise<void>;
  issue: SymphonyTrackerIssue;
  root: string;
  services: SymphonyRuntimeAppServices;
  snapshot: SymphonyOrchestratorSnapshot;
  workflow: SymphonyLoadedWorkflow;
  workflowConfig: SymphonyResolvedWorkflowConfig;
};

export function buildSymphonyOrchestratorSnapshot(
  overrides: Partial<SymphonyOrchestratorSnapshot> = {}
): SymphonyOrchestratorSnapshot {
  return {
    running: [],
    retrying: [],
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
    ...overrides
  };
}

export function buildSymphonyRuntimeWorkflowConfig(
  root: string,
  overrides: Partial<SymphonyResolvedWorkflowConfig> = {}
): SymphonyResolvedWorkflowConfig {
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
      terminalStates: ["Canceled", "Duplicate", "Done"],
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
      root,
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
      webhookSecret: "secret",
      apiToken: null,
      statePath: path.join(root, "github-state.json"),
      allowedReviewLogins: ["reviewer"],
      allowedReworkCommentLogins: ["reviewer"],
      ...overrides.github
    }
  };
}

export function buildSymphonyRuntimeTrackerIssue(
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
    branchName: overrides.branchName ?? `symphony/${identifier}`,
    url: overrides.url ?? "https://linear.app/coldets/issue/col-123",
    projectId: overrides.projectId ?? "project-1",
    projectName:
      overrides.projectName ?? "Symphony Developer Control Plane Foundation",
    projectSlug:
      overrides.projectSlug ?? "symphony-developer-control-plane-foundation",
    teamKey: overrides.teamKey ?? "COL",
    assigneeId: overrides.assigneeId ?? "worker-1",
    blockedBy: overrides.blockedBy ?? [],
    labels: overrides.labels ?? [],
    assignedToWorker: overrides.assignedToWorker ?? true,
    createdAt: overrides.createdAt ?? "2026-03-31T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-03-31T00:00:00.000Z"
  };
}

export async function createSymphonyRuntimeTestHarness(input: {
  issue?: Partial<SymphonyTrackerIssue>;
  realtimeNow?: () => Date;
  rootPrefix?: string;
  snapshot?: Partial<SymphonyOrchestratorSnapshot>;
  workflowConfig?: Partial<SymphonyResolvedWorkflowConfig>;
} = {}): Promise<SymphonyRuntimeTestHarness> {
  const root = await mkdtemp(
    path.join(tmpdir(), input.rootPrefix ?? "symphony-runtime-test-")
  );
  const issue = buildSymphonyRuntimeTrackerIssue(input.issue);
  const workflowConfig = buildSymphonyRuntimeWorkflowConfig(
    root,
    input.workflowConfig
  );
  const workflow = buildSymphonyLoadedWorkflow(workflowConfig);
  const tracker = createMemorySymphonyTracker([issue]);
  const database = initializeSymphonyDb({
    dbFile: path.join(root, "symphony.db")
  });
  const issueTimelineStore = createSymphonyIssueTimelineStore(database.db);
  const runtimeLogStore = createSymphonyRuntimeLogStore(database.db);
  const runJournal = createSqliteSymphonyRunJournal({
    db: database.db,
    dbFile: path.join(root, "symphony.db"),
    timelineStore: issueTimelineStore
  });

  const runId = await runJournal.recordRunStarted(
    buildSymphonyRunStartAttrs({
      issueId: issue.id,
      issueIdentifier: issue.identifier
    })
  );
  const turnId = await runJournal.recordTurnStarted(
    runId,
    buildSymphonyTurnStartAttrs()
  );
  await runJournal.recordEvent(runId, turnId, buildSymphonyEventAttrs());
  await runJournal.finalizeTurn(turnId, buildSymphonyTurnFinishAttrs());
  await runJournal.finalizeRun(runId, buildSymphonyRunFinishAttrs());
  await issueTimelineStore.record({
    issueId: issue.id,
    issueIdentifier: issue.identifier,
    runId,
    source: "orchestrator",
    eventType: "retry_scheduled",
    message: "Failure retry scheduled.",
    payload: {
      attempt: 1
    }
  });
  await runtimeLogStore.record({
    level: "info",
    source: "runtime",
    eventType: "db_initialized",
    message: "Initialized Symphony DB.",
    issueId: issue.id,
    issueIdentifier: issue.identifier,
    runId,
    payload: null
  });

  const snapshot = buildSymphonyOrchestratorSnapshot({
    running: [
      {
        issueId: issue.id,
        issue: {
          ...issue,
          state: "In Progress"
        },
        runId,
        sessionId: "thread-live",
        workerHost: null,
        workspacePath: path.join(root, `symphony-${issue.identifier}`),
        retryAttempt: 0,
        turnCount: 1,
        lastCodexMessage: {
          event: "notification",
          message: {
            method: "thread/tokenUsage/updated"
          },
          timestamp: "2026-03-31T00:00:00.000Z"
        },
        lastCodexTimestamp: "2026-03-31T00:00:00.000Z",
        lastCodexEvent: "notification",
        codexInputTokens: 12,
        codexOutputTokens: 4,
        codexTotalTokens: 16,
        codexLastReportedInputTokens: 12,
        codexLastReportedOutputTokens: 4,
        codexLastReportedTotalTokens: 16,
        lastRateLimits: null,
        codexAppServerPid: "4242",
        startedAt: "2026-03-31T00:00:00.000Z",
        runtimeSeconds: 12
      }
    ],
    ...input.snapshot
  });

  const services: SymphonyRuntimeAppServices = {
    logger: createSilentSymphonyLogger("@symphony/api.test"),
    workflow,
    workflowConfig,
    tracker,
    orchestrator: {
      snapshot() {
        return snapshot;
      },
      isPollCycleInFlight() {
        return false;
      },
      async requestRefresh() {
        return {
          queued: true,
          coalesced: false,
          requestedAt: "2026-03-31T00:00:00.000Z",
          operations: ["poll", "reconcile"] as const
        };
      },
      async runPollCycle() {
        return snapshot;
      }
    },
    forensics: createSymphonyForensicsReadModel(runJournal),
    issueTimeline: {
      async list({ issueIdentifier, limit }) {
        const entries = await issueTimelineStore.listIssueTimeline(
          issueIdentifier,
          {
            limit
          }
        );

        return entries.length === 0
          ? null
          : {
              issueIdentifier,
              entries,
              filters: {
                limit: limit ?? null
              }
            };
      }
    },
    runtimeLogs: {
      async list(input = {}) {
        const logs = await runtimeLogStore.list(input);

        return {
          logs,
          filters: {
            limit: input.limit ?? null,
            issueIdentifier: input.issueIdentifier ?? null
          }
        };
      }
    },
    health: {
      snapshot() {
        return {
          healthy: true,
          db: {
            file: path.join(root, "symphony.db"),
            ready: true
          },
          poller: {
            running: true,
            intervalMs: workflowConfig.polling.intervalMs,
            inFlight: false,
            lastStartedAt: null,
            lastCompletedAt: null,
            lastSucceededAt: null,
            lastError: null
          }
        };
      }
    },
    githubReviewIngress: createSymphonyGitHubReviewIngressService({
      workflowConfig,
      reviewProcessor: new SymphonyGithubReviewProcessor({
        workflowConfig,
        tracker,
        pullRequestResolver: {
          async fetchPullRequest() {
            return {
              headRef: issue.branchName ?? `symphony/${issue.identifier}`,
              htmlUrl: "https://github.com/openai/symphony/pull/123"
            };
          }
        }
      })
    }),
    realtime: createSymphonyRealtimeHub(
      input.realtimeNow ? { now: input.realtimeNow } : undefined
    ),
    async shutdown() {
      database.close();
    }
  };

  return {
    async cleanup() {
      database.close();
      await rm(root, {
        recursive: true,
        force: true
      });
    },
    issue,
    root,
    services,
    snapshot,
    workflow,
    workflowConfig
  };
}

function buildSymphonyLoadedWorkflow(
  config: SymphonyResolvedWorkflowConfig
): SymphonyLoadedWorkflow {
  return {
    rawConfig: {},
    config,
    prompt: "Prompt",
    promptTemplate: "Prompt",
    sourcePath: null
  };
}

function buildSymphonyRunStartAttrs(
  overrides: Partial<SymphonyRunStartAttrs> = {}
): SymphonyRunStartAttrs {
  return {
    issueId: "issue-123",
    issueIdentifier: "COL-123",
    runId: "run-123",
    attempt: 1,
    status: "running",
    workerHost: null,
    workspacePath: null,
    startedAt: "2026-03-31T00:00:00.000Z",
    commitHashStart: null,
    repoStart: null,
    metadata: null,
    ...overrides
  };
}

function buildSymphonyTurnStartAttrs(
  overrides: Partial<SymphonyTurnStartAttrs> = {}
): SymphonyTurnStartAttrs {
  return {
    turnId: "turn-123",
    turnSequence: 1,
    codexThreadId: null,
    codexTurnId: null,
    codexSessionId: null,
    promptText: "Prompt",
    status: "running",
    startedAt: "2026-03-31T00:00:00.000Z",
    metadata: null,
    ...overrides
  };
}

function buildSymphonyEventAttrs(
  overrides: Partial<SymphonyEventAttrs> = {}
): SymphonyEventAttrs {
  return {
    eventId: "event-123",
    eventSequence: 1,
    eventType: "notification",
    recordedAt: "2026-03-31T00:00:01.000Z",
    payload: {
      method: "thread/tokenUsage/updated"
    },
    summary: "notification",
    codexThreadId: null,
    codexTurnId: null,
    codexSessionId: null,
    ...overrides
  };
}

function buildSymphonyTurnFinishAttrs(
  overrides: Partial<SymphonyTurnFinishAttrs> = {}
): SymphonyTurnFinishAttrs {
  return {
    status: "completed",
    endedAt: "2026-03-31T00:00:02.000Z",
    codexThreadId: null,
    codexTurnId: null,
    codexSessionId: null,
    tokens: {
      inputTokens: 12,
      outputTokens: 4,
      totalTokens: 16
    },
    metadata: null,
    ...overrides
  };
}

function buildSymphonyRunFinishAttrs(
  overrides: Partial<SymphonyRunFinishAttrs> = {}
): SymphonyRunFinishAttrs {
  return {
    status: "finished",
    outcome: "failed",
    endedAt: "2026-03-31T00:00:03.000Z",
    commitHashEnd: null,
    repoEnd: null,
    metadata: null,
    errorClass: "failure",
    errorMessage: "Test failure",
    ...overrides
  };
}
