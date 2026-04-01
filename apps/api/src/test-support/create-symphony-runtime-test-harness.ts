import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  type SymphonyLoadedWorkflow,
  type SymphonyResolvedWorkflowConfig
} from "@symphony/core";
import { createSymphonyForensicsReadModel } from "@symphony/core/forensics";
import { SymphonyGithubReviewProcessor } from "@symphony/core/github";
import type { SymphonyOrchestratorSnapshot } from "@symphony/core/orchestration";
import {
  createMemorySymphonyTracker,
  type SymphonyTrackerIssue
} from "@symphony/core/tracker";
import {
  buildSymphonyEventAttrs,
  buildSymphonyOrchestratorSnapshot,
  buildSymphonyRunFinishAttrs,
  buildSymphonyRunStartAttrs,
  buildSymphonyTrackerIssue,
  buildSymphonyTurnFinishAttrs,
  buildSymphonyTurnStartAttrs,
  buildSymphonyWorkflowConfig
} from "@symphony/test-support";
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

export { buildSymphonyOrchestratorSnapshot };

export function buildLocalPreparedWorkspace(
  issueIdentifier: string,
  workspacePath: string
) {
  return {
    issueIdentifier,
    workspaceKey: issueIdentifier,
    backendKind: "local" as const,
    executionTarget: {
      kind: "host_path" as const,
      path: workspacePath
    },
    materialization: {
      kind: "directory" as const,
      hostPath: workspacePath
    },
    path: workspacePath,
    created: false,
    workerHost: null
  };
}

export function buildSymphonyRuntimeWorkflowConfig(
  root: string,
  overrides: Partial<SymphonyResolvedWorkflowConfig> = {}
): SymphonyResolvedWorkflowConfig {
  const baseConfig = buildSymphonyWorkflowConfig();

  return {
    ...baseConfig,
    tracker: {
      ...baseConfig.tracker,
      ...overrides.tracker
    },
    polling: {
      ...baseConfig.polling,
      ...overrides.polling
    },
    workspace: {
      ...baseConfig.workspace,
      root,
      ...overrides.workspace
    },
    worker: {
      ...baseConfig.worker,
      ...overrides.worker
    },
    agent: {
      ...baseConfig.agent,
      ...overrides.agent
    },
    codex: {
      ...baseConfig.codex,
      ...overrides.codex
    },
    hooks: {
      ...baseConfig.hooks,
      ...overrides.hooks
    },
    observability: {
      ...baseConfig.observability,
      ...overrides.observability
    },
    server: {
      ...baseConfig.server,
      ...overrides.server
    },
    github: {
      ...baseConfig.github,
      repo: "openai/symphony",
      webhookSecret: "secret",
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
  return buildSymphonyTrackerIssue(overrides);
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
      runId: "run-123",
      issueId: issue.id,
      issueIdentifier: issue.identifier
    })
  );
  const turnId = await runJournal.recordTurnStarted(
    runId,
    buildSymphonyTurnStartAttrs({
      turnId: "turn-123"
    })
  );
  await runJournal.recordEvent(
    runId,
    turnId,
    buildSymphonyEventAttrs({
      eventId: "event-123"
    })
  );
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
        workspace: buildLocalPreparedWorkspace(
          issue.identifier,
          path.join(root, `symphony-${issue.identifier}`)
        ),
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
    forensics: createSymphonyForensicsReadModel({
      journal: runJournal,
      async listIssueTimeline(input) {
        return issueTimelineStore.listIssueTimeline(input.issueIdentifier, {
          limit: input.limit
        });
      },
      async listRuntimeLogs(input) {
        return runtimeLogStore.list(input);
      }
    }),
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
