import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  type SymphonyResolvedRuntimePolicy
} from "@symphony/runtime-policy";
import { createSymphonyForensicsReadModel } from "@symphony/forensics";
import { SymphonyGithubReviewProcessor } from "@symphony/github-review";
import type { SymphonyOrchestratorSnapshot } from "@symphony/orchestrator";
import {
  createMemorySymphonyTracker,
  type SymphonyTrackerIssue
} from "@symphony/tracker";
import {
  buildSymphonyOrchestratorSnapshot,
  buildSymphonyRuntimePolicy,
  buildSymphonyRunFinishAttrs,
  buildSymphonyRunStartAttrs,
  buildSymphonyTrackerIssue,
  buildSymphonyTurnFinishAttrs,
  buildSymphonyTurnStartAttrs
} from "@symphony/test-support";
import {
  createSqliteAgentAnalyticsReadStore,
  symphonyAgentPayloadOverflowTable,
  createSqliteAgentAnalyticsStore,
  createSqliteSymphonyRuntimeRunStore,
  createSymphonyIssueTimelineStore,
  createSymphonyRuntimeLogStore,
  initializeSymphonyDb
} from "@symphony/db";
import { createSilentSymphonyLogger } from "@symphony/logger";
import { createAgentAnalyticsReadPort } from "../core/agent-analytics-read-port.js";
import { createSymphonyGitHubReviewIngressService } from "../core/github-review-ingress.js";
import type {
  SymphonyLoadedRuntimePromptTemplate,
  SymphonyRuntimeAppServices
} from "../core/runtime-app-types.js";
import { createSymphonyRealtimeHub } from "../realtime/symphony-realtime-hub.js";

export type SymphonyRuntimeTestHarness = {
  cleanup(): Promise<void>;
  issue: SymphonyTrackerIssue;
  root: string;
  services: SymphonyRuntimeAppServices;
  snapshot: SymphonyOrchestratorSnapshot;
  promptTemplate: SymphonyLoadedRuntimePromptTemplate;
  runtimePolicy: SymphonyResolvedRuntimePolicy;
};

export { buildSymphonyOrchestratorSnapshot };

export function buildBindMountPreparedWorkspace(
  issueIdentifier: string,
  workspacePath: string
) {
  return {
    issueIdentifier,
    workspaceKey: issueIdentifier,
    backendKind: "docker" as const,
    prepareDisposition: "reused" as const,
    containerDisposition: "reused" as const,
    networkDisposition: "reused" as const,
    afterCreateHookOutcome: "skipped" as const,
    executionTarget: {
      kind: "container" as const,
      workspacePath: "/workspace",
      containerId: "container-123",
      containerName: "symphony-col-123",
      hostPath: workspacePath,
      shell: "sh"
    },
    materialization: {
      kind: "bind_mount" as const,
      hostPath: workspacePath,
      containerPath: "/workspace"
    },
    networkName: "symphony-network-col-123",
    services: [],
    envBundle: {
      source: "ambient" as const,
      values: {},
      summary: {
        source: "ambient" as const,
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
      }
    },
    manifestLifecycle: null,
    path: null,
    created: false,
    workerHost: null
  };
}

export function buildSymphonyRuntimePolicyForRoot(
  root: string,
  overrides: Partial<SymphonyResolvedRuntimePolicy> = {}
): SymphonyResolvedRuntimePolicy {
  const baseConfig = buildSymphonyRuntimePolicy();

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
    pi: {
      ...baseConfig.pi,
      ...overrides.pi
    },
    agentRuntime: {
      ...baseConfig.agentRuntime,
      ...overrides.agentRuntime
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
  runtimePolicy?: Partial<SymphonyResolvedRuntimePolicy>;
} = {}): Promise<SymphonyRuntimeTestHarness> {
  const root = await mkdtemp(
    path.join(tmpdir(), input.rootPrefix ?? "symphony-runtime-test-")
  );
  const issue = buildSymphonyRuntimeTrackerIssue(input.issue);
  const runtimePolicy = buildSymphonyRuntimePolicyForRoot(
    root,
    input.runtimePolicy
  );
  const promptTemplate = buildSymphonyLoadedPromptTemplate();
  const tracker = createMemorySymphonyTracker([issue]);
  const database = initializeSymphonyDb({
    dbFile: path.join(root, "symphony.db")
  });
  const issueTimelineStore = createSymphonyIssueTimelineStore(database.db);
  const runtimeLogStore = createSymphonyRuntimeLogStore(database.db);
  const runStore = createSqliteSymphonyRuntimeRunStore({
    db: database.db,
    timelineStore: issueTimelineStore
  });
  const agentAnalyticsStore = createSqliteAgentAnalyticsStore({
    db: database.db
  });
  const agentAnalyticsReadStore = createSqliteAgentAnalyticsReadStore({
    db: database.db
  });

  const runId = await runStore.recordRunStarted(
    buildSymphonyRunStartAttrs({
      runId: "run-123",
      issueId: issue.id,
      issueIdentifier: issue.identifier
    })
  );
  const turnId = await runStore.recordTurnStarted(
    runId,
    buildSymphonyTurnStartAttrs({
      turnId: "turn-123"
    })
  );
  await agentAnalyticsStore.startRun({
    runId,
    issueId: issue.id,
    issueIdentifier: issue.identifier,
    startedAt: "2026-03-31T00:00:00.000Z",
    status: "running",
    threadId: "thread-123"
  });
  await agentAnalyticsStore.recordEvent({
    runId,
    turnId,
    threadId: "thread-123",
    recordedAt: "2026-03-31T00:00:00.000Z",
    payload: {
      type: "thread.started",
      thread_id: "thread-123"
    }
  });
  await agentAnalyticsStore.recordEvent({
    runId,
    turnId,
    threadId: "thread-123",
    recordedAt: "2026-03-31T00:00:01.000Z",
    payload: {
      type: "item.completed",
      item: {
        id: "item-123",
        type: "agent_message",
        text: "Initial agent message"
      }
    }
  });
  await agentAnalyticsStore.recordEvent({
    runId,
    turnId,
    threadId: "thread-123",
    recordedAt: "2026-03-31T00:00:02.000Z",
    payload: {
      type: "turn.completed",
      usage: {
        input_tokens: 10,
        cached_input_tokens: 0,
        output_tokens: 5
      }
    }
  });
  database.db.insert(symphonyAgentPayloadOverflowTable)
    .values({
      id: "item-123-overflow",
      runId,
      turnId,
      itemId: "item-123",
      kind: "agent_message",
      contentJson: null,
      contentText: "Initial agent message",
      byteCount: Buffer.byteLength("Initial agent message"),
      insertedAt: "2026-03-31T00:00:01.000Z"
    })
    .run();
  await agentAnalyticsStore.finalizeTurn({
    runId,
    turnId,
    endedAt: "2026-03-31T00:01:00.000Z",
    status: "completed",
    threadId: "thread-123",
    failureKind: null,
    failureMessagePreview: null
  });
  await agentAnalyticsStore.finalizeRun({
    runId,
    endedAt: "2026-03-31T00:01:00.000Z",
    status: "completed",
    threadId: "thread-123",
    failureKind: null,
    failureOrigin: null,
    failureMessagePreview: null
  });
  await runStore.finalizeTurn(turnId, buildSymphonyTurnFinishAttrs());
  await runStore.finalizeRun(runId, buildSymphonyRunFinishAttrs());
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
        workspace: buildBindMountPreparedWorkspace(
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
        launchTarget: null,
        workspacePath: path.join(root, `symphony-${issue.identifier}`),
        retryAttempt: 0,
        turnCount: 1,
        lastAgentMessage: {
          event: "notification",
          message: {
            method: "thread/tokenUsage/updated"
          },
          timestamp: "2026-03-31T00:00:00.000Z"
        },
        lastAgentTimestamp: "2026-03-31T00:00:00.000Z",
        lastAgentEvent: "notification",
        agentInputTokens: 12,
        agentOutputTokens: 4,
        agentTotalTokens: 16,
        agentLastReportedInputTokens: 12,
        agentLastReportedOutputTokens: 4,
        agentLastReportedTotalTokens: 16,
        lastRateLimits: null,
        agentRuntimeProcessId: "4242",
        startedAt: "2026-03-31T00:00:00.000Z",
        runtimeSeconds: 12
      }
    ],
    ...input.snapshot
  });

  const services: SymphonyRuntimeAppServices = {
    logger: createSilentSymphonyLogger("@symphony/api.test"),
    promptTemplate,
    promptContract: {
      repoRoot: root,
      promptPath: path.join(root, ".symphony", "prompt.md"),
      template: promptTemplate.promptTemplate,
      variables: []
    },
    runtimePolicy,
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
    agentAnalytics: createAgentAnalyticsReadPort(agentAnalyticsReadStore),
    forensics: createSymphonyForensicsReadModel({
      runStore: agentAnalyticsReadStore,
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
            intervalMs: runtimePolicy.polling.intervalMs,
            inFlight: false,
            lastStartedAt: null,
            lastCompletedAt: null,
            lastSucceededAt: null,
            lastError: null
          },
          machineLoad: {
            capturedAt: "2026-03-31T00:00:00.000Z",
            cpuPercent: 61,
            memoryUsedBytes: 8 * 1024 * 1024 * 1024,
            memoryTotalBytes: 16 * 1024 * 1024 * 1024,
            memoryPercent: 50,
            diskUsedBytes: 120 * 1024 * 1024 * 1024,
            diskTotalBytes: 256 * 1024 * 1024 * 1024,
            diskPercent: 47,
            samplePath: root
          }
        };
      }
    },
    githubReviewIngress: createSymphonyGitHubReviewIngressService({
      githubPolicy: runtimePolicy.github,
      reviewProcessor: new SymphonyGithubReviewProcessor({
        policyConfig: {
          tracker: runtimePolicy.tracker,
          github: runtimePolicy.github
        },
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
    promptTemplate,
    runtimePolicy
  };
}

function buildSymphonyLoadedPromptTemplate(): SymphonyLoadedRuntimePromptTemplate {
  return {
    prompt: "Prompt",
    promptTemplate: "Prompt",
    sourcePath: "/tmp/.symphony/prompt.md"
  };
}
