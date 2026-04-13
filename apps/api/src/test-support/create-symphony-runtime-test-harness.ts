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
  createSqliteRuntimeForensicsReadStore,
  createSymphonyIssueStore,
  createSqliteSymphonyRuntimeRunStore,
  createSymphonyIssueTimelineStore,
  createSymphonyRuntimeLogStore,
  initializeSymphonyDb
} from "@symphony/db";
import { createSilentSymphonyLogger } from "@symphony/logger";
import { createAgentAnalyticsReadPort } from "../core/agent-analytics-read-port.js";
import { createSymphonyGitHubReviewIngressService } from "../core/github-review-ingress.js";
import {
  createIssueTimelinePort,
  createRuntimeLogsPort
} from "../core/runtime-observability-ports.js";
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
      shell: "sh",
      user: "1000:1000"
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
  const githubOverrideRecord =
    overrides.github && typeof overrides.github === "object"
      ? (overrides.github as Record<string, unknown>)
      : null;
  const allowedReviewCommentLogins = Array.isArray(
    githubOverrideRecord?.allowedReviewCommentLogins
  )
    ? (githubOverrideRecord.allowedReviewCommentLogins as string[])
    : null;

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
      ...(allowedReviewCommentLogins
        ? {
            allowedReviewCommentLogins
          }
        : {}),
      ...overrides.github
    } as SymphonyResolvedRuntimePolicy["github"]
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
  workflowTrackerState?: string | null;
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
  const repositoryKey = runtimePolicy.github.repo;
  if (!repositoryKey) {
    throw new TypeError("Runtime test harness requires runtimePolicy.github.repo.");
  }
  const issueTimelineStore = createSymphonyIssueTimelineStore(database.db, {
    repositoryKey
  });
  const runtimeLogStore = createSymphonyRuntimeLogStore(database.db, {
    repositoryKey
  });
  const runStore = createSqliteSymphonyRuntimeRunStore({
    db: database.db,
    timelineStore: issueTimelineStore
  });
  const issueStore = createSymphonyIssueStore(database.db);
  const agentAnalyticsStore = createSqliteAgentAnalyticsStore({
    db: database.db
  });
  const agentAnalyticsReadStore = createSqliteAgentAnalyticsReadStore({
    db: database.db
  });
  const runtimeForensicsReadStore = createSqliteRuntimeForensicsReadStore({
    db: database.db
  });

  await issueStore.upsert({
    issueIdentifier: issue.identifier,
    trackerIssueId: issue.id,
    repositoryKey,
    latestRunStartedAt: null,
    recordedAt: "2026-03-31T00:00:00.000Z"
  });

  const runId = await runStore.recordRunStarted(
    buildSymphonyRunStartAttrs({
      runId: "run-123",
      trackerIssueId: issue.id,
      issueIdentifier: issue.identifier
    })
  );
  const turnId = await runStore.recordTurnStarted(
    runId,
    buildSymphonyTurnStartAttrs({
      turnId: "turn-123"
    })
  );
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
  await runStore.recordEvent(runId, turnId, {
    eventId: "event-123-session-started",
    eventSequence: 1,
    eventType: "session.started",
    recordedAt: "2026-03-31T00:00:00.000Z",
    threadId: "thread-123",
    payload: {
      type: "session.started",
      session_id: "thread-123",
      thread_id: "thread-123",
      turn_id: turnId,
      agent_app_server_pid: "4242",
      model: "gpt-5.4",
      reasoning_effort: "high"
    },
    summary: "Runtime session started."
  });
  await runStore.recordEvent(runId, turnId, {
    eventId: "event-123-thread-started",
    eventSequence: 2,
    eventType: "thread.started",
    recordedAt: "2026-03-31T00:00:00.000Z",
    threadId: "thread-123",
    payload: {
      type: "thread.started",
      thread_id: "thread-123"
    },
    summary: "Thread started."
  });
  await runStore.recordEvent(runId, turnId, {
    eventId: "event-123-item-completed",
    eventSequence: 3,
    eventType: "item.completed",
    recordedAt: "2026-03-31T00:00:01.000Z",
    threadId: "thread-123",
    payload: {
      type: "item.completed",
      item: {
        id: "item-123",
        type: "agent_message",
        text: "Initial agent message"
      }
    },
    summary: "agent_message completed."
  });
  await runStore.recordEvent(runId, turnId, {
    eventId: "event-123-turn-completed",
    eventSequence: 4,
    eventType: "turn.completed",
    recordedAt: "2026-03-31T00:00:02.000Z",
    threadId: "thread-123",
    payload: {
      type: "turn.completed",
      usage: {
        input_tokens: 10,
        cached_input_tokens: 0,
        output_tokens: 5
      }
    },
    summary: "Turn completed."
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
  await runStore.finalizeTurn(turnId, buildSymphonyTurnFinishAttrs());
  await runStore.finalizeRun(runId, buildSymphonyRunFinishAttrs());
  await issueTimelineStore.record({
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
    issueIdentifier: issue.identifier,
    runId,
    payload: null
  });
  await runtimeLogStore.record({
    level: "info",
    source: "agent_runtime",
    eventType: "runtime_session_started",
    message: "Started the agent harness session.",
    issueIdentifier: issue.identifier,
    runId,
    payload: {
      threadId: "thread-123",
      processId: "4242",
      model: "gpt-5.4",
      reasoningEffort: "high",
      profile: null,
      providerId: "openrouter",
      providerName: "OpenRouter",
      authMode: "api_key_env",
      providerEnvKey: "OPENROUTER_API_KEY",
      harness: "pi",
      launchTarget: null
    }
  });
  await runStore.upsertRunContext(runId, {
    harnessKind: "pi",
    threadId: "thread-123",
    processId: "4242",
    model: "gpt-5.4",
    reasoningEffort: "high",
    profile: null,
    providerId: "openrouter",
    providerName: "OpenRouter",
    authMode: "api_key_env",
    providerEnvKey: "OPENROUTER_API_KEY",
    launchTarget: null
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
        threadId: "thread-live",
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
    bootstrapBinding: {
      kind: "workflow_binding",
      repositorySource: {
        kind: "admitted_source_repositories",
        source: "explicit",
        sourceRepos: []
      },
      defaultRepositoryKey: "openai/symphony",
      manifestPath: null,
      bindingScope: null,
      presetSelection: {
        presetId: "current-flow",
        source: "registry_default",
        repositoryKey: null,
        manifestPath: null
      }
    },
    admittedRepositories: [],
    promptTemplate,
    promptContract: {
      repoRoot: root,
      promptPath: path.join(root, ".symphony", "prompt.md"),
      template: promptTemplate.promptTemplate,
      variables: []
    },
    runtimePolicy,
    runtimeConfig: {
      runtime: {
        repositoryKey: "openai/symphony",
        githubRepository: "openai/symphony",
        trackerKind: runtimePolicy.tracker.kind,
        trackerTeamKey:
          runtimePolicy.tracker.kind === "linear"
            ? runtimePolicy.tracker.teamKey
            : null,
        agentHarness: runtimePolicy.agent.harness,
        workspaceRoot: runtimePolicy.workspace.root
      },
      credentials: {
        linearApiKeyConfigured: true,
        githubCliAuthMode: "env",
        githubCliAuthEnvKey: "GITHUB_TOKEN",
        piAuthMode: "provider_env",
        piProviderEnvKey: "OPENAI_API_KEY"
      },
      bootstrap: {
        kind: "workflow_binding",
        repositorySource: {
          kind: "admitted_source_repositories",
          source: "explicit",
          sourceRepos: []
        },
        defaultRepositoryKey: "openai/symphony",
        manifestPath: null,
        bindingScope: null,
        presetSelection: {
          presetId: "current-flow",
          source: "registry_default",
          repositoryKey: null,
          manifestPath: null
        }
      },
      admittedRepositories: [],
      bindingCatalog: null
    },
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
      async dispatchRoutedIssue() {
        return;
      },
      async runPollCycle() {
        return snapshot;
      }
    },
    agentAnalytics: createAgentAnalyticsReadPort(agentAnalyticsReadStore),
    forensics: createSymphonyForensicsReadModel({
      runStore: runtimeForensicsReadStore,
      async listIssueTimeline(input) {
        return issueTimelineStore.listIssueTimeline(input.issueIdentifier, {
          limit: input.limit
        });
      },
      async listRuntimeLogs(input) {
        return runtimeLogStore.list({
          limit: input.limit,
          issueIdentifier: input.issueIdentifier
        });
      }
    }),
    issueTimeline: createIssueTimelinePort({
      issueTimelineStore,
      issueStore
    }),
    runtimeLogs: createRuntimeLogsPort({
      runtimeLogStore
    }),
    runtimeTools: {
      async recordDeliveryReport() {
        return {
          success: true,
          output: JSON.stringify({ ok: true }),
          contentItems: [
            {
              type: "inputText",
              text: JSON.stringify({ ok: true })
            }
          ]
        };
      },
      async submitSpikeResult() {
        return {
          success: true,
          output: JSON.stringify({ ok: true }),
          contentItems: [
            {
              type: "inputText",
              text: JSON.stringify({ ok: true })
            }
          ]
        };
      },
      async cancelIssue() {
        return {
          success: true,
          output: JSON.stringify({ ok: true }),
          contentItems: [
            {
              type: "inputText",
              text: JSON.stringify({ ok: true })
            }
          ]
        };
      },
      async submitMergeResult() {
        return {
          success: true,
          output: JSON.stringify({ ok: true }),
          contentItems: [
            {
              type: "inputText",
              text: JSON.stringify({ ok: true })
            }
          ]
        };
      }
    },
    capabilityPlanning: {
      async planByWorkflowId() {
        throw new Error(
          "Runtime test harness does not support capability planning."
        );
      }
    },
    capabilityExecution: {
      async advanceByWorkflowId() {
        throw new Error(
          "Runtime test harness does not support capability execution."
        );
      }
    },
    workflowComparison: {
      async compareByWorkflowId() {
        return null;
      },
      async compareByIssueIdentifier() {
        return null;
      }
    },
    routeWorkflows: {
      async ensureWorkflowForIssue() {
        throw new Error("Runtime test harness does not support route workflow writes.");
      },
      async loadHydrationStateByWorkflowId() {
        return null;
      },
      async loadHydrationStateByIssueIdentifier() {
        return null;
      },
      async loadHydrationStateByScopedIssue() {
        return null;
      },
      async loadReplayStateByWorkflowId() {
        return null;
      },
      async loadReplayStateByIssueIdentifier() {
        return null;
      },
      async loadReplayStateByScopedIssue() {
        return null;
      },
      async rehydrateProjectionByWorkflowId() {
        return null;
      },
      async rehydrateProjectionByIssueIdentifier() {
        return null;
      },
      async rehydrateProjectionByScopedIssue() {
        return null;
      },
      async resumeSessionByWorkflowId() {
        return null;
      },
      async resumeSessionByIssueIdentifier() {
        return null;
      },
      async resumeSessionByScopedIssue() {
        return null;
      },
      async loadExecutionContractByWorkflowId() {
        return null;
      },
      async saveExecutionContract() {
        throw new Error("Runtime test harness does not support route workflow writes.");
      },
      async recordRouteResult() {
        throw new Error("Runtime test harness does not support route workflow writes.");
      },
      async appendCommandSettlement() {
        throw new Error("Runtime test harness does not support route workflow writes.");
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
    trackerStateIngress: {
      async observeNonRunningIssue() {
        return null;
      }
    },
    workflowRead: {
      async loadWorkflowLifecycleView({ issueIdentifier }) {
        const trackerState = await (async () => {
          if (input.workflowTrackerState !== undefined) {
            return input.workflowTrackerState;
          }

          const runningIssue = snapshot.running.find(
            (entry) => entry.issue.identifier === issueIdentifier
          )?.issue;
          if (runningIssue) {
            return runningIssue.state;
          }

          const retryingIssue = snapshot.retrying.find(
            (entry) => entry.identifier === issueIdentifier
          );
          if (retryingIssue) {
            return tracker.getIssue(retryingIssue.issueId)?.state ?? null;
          }

          const trackedIssue = tracker.fetchIssueByIdentifier(
            runtimePolicy.tracker,
            issueIdentifier
          );
          return (await trackedIssue)?.state ?? null;
        })();

        if (trackerState === null) {
          return null;
        }

        return {
          workflowId: `workflow-${issueIdentifier}`,
          trackerState,
          latestReworkHandoff: null,
          latestMergeResult: null
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
