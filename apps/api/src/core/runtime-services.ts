import {
  createCodexAgentRuntime,
  createSymphonyRuntime,
  loadSymphonyWorkflow,
  type SymphonyLoadedWorkflow,
  type SymphonyResolvedWorkflowConfig,
  type SymphonyRuntime as CoreSymphonyRuntime
} from "@symphony/core";
import { createSymphonyForensicsReadModel } from "@symphony/core/forensics";
import type { SymphonyForensicsReadModel } from "@symphony/core/forensics";
import { SymphonyGithubReviewProcessor } from "@symphony/core/github";
import type { SymphonyOrchestratorSnapshot } from "@symphony/core/orchestration";
import {
  createLinearSymphonyTracker,
  createMemorySymphonyTracker,
  type SymphonyTracker
} from "@symphony/core/tracker";
import type {
  SymphonyForensicsIssueTimelineResult,
  SymphonyGitHubReviewIngressResult,
  SymphonyGitHubWebhookBody,
  SymphonyGitHubWebhookHeaders,
  SymphonyRuntimeHealthResult,
  SymphonyRuntimeLogsResult,
  SymphonyRuntimeRefreshResult
} from "@symphony/contracts";
import {
  createSymphonyGitHubIngressJournal,
  createSymphonyIssueTimelineStore,
  createSymphonyRuntimeLogStore,
  createSqliteSymphonyRunJournal,
  initializeSymphonyDb,
  type SymphonyRuntimeLogStore
} from "@symphony/db";
import {
  createSymphonyLogger,
  type SymphonyLogger
} from "@symphony/logger";
import { createRuntimeHttpError } from "./errors.js";
import type { SymphonyRuntimeAppEnv } from "./env.js";
import { createSymphonyGitHubReviewIngressService } from "./github-review-ingress.js";
import { createCodexSymphonyAgentRuntime } from "./codex-agent-runtime.js";
import { createDbBackedOrchestratorObserver } from "./runtime-db-observer.js";
import {
  publishRealtimeSnapshotDiff,
  snapshotRequiresRealtimeInvalidation
} from "./runtime-realtime-diff.js";
import {
  createSymphonyRealtimeHub,
  type SymphonyRealtimeHub
} from "../realtime/symphony-realtime-hub.js";
import {
  SymphonyRuntimePollScheduler,
  type SymphonyRuntimePollSchedulerSnapshot
} from "./poll-scheduler.js";
import { createRuntimeWorkspaceBackend } from "./runtime-workspace-backend.js";

export type SymphonyRuntimeOrchestratorPort = {
  snapshot(): SymphonyOrchestratorSnapshot;
  runPollCycle(): Promise<SymphonyOrchestratorSnapshot>;
  isPollCycleInFlight(): boolean;
  requestRefresh(): Promise<SymphonyRuntimeRefreshResult>;
};

export type SymphonyGitHubReviewIngressPort = {
  ingest(input: {
    headers: SymphonyGitHubWebhookHeaders;
    body: SymphonyGitHubWebhookBody;
    rawBody: string;
  }): Promise<SymphonyGitHubReviewIngressResult>;
};

export type SymphonyIssueTimelinePort = {
  list(input: {
    issueIdentifier: string;
    limit?: number;
  }): Promise<SymphonyForensicsIssueTimelineResult | null>;
};

export type SymphonyRuntimeLogsPort = {
  list(input?: {
    limit?: number;
    issueIdentifier?: string;
  }): Promise<SymphonyRuntimeLogsResult>;
};

export type SymphonyRuntimeHealthPort = {
  snapshot(): SymphonyRuntimeHealthResult;
};

export type SymphonyRuntimeAppServices = {
  logger: SymphonyLogger;
  workflow: SymphonyLoadedWorkflow;
  workflowConfig: SymphonyResolvedWorkflowConfig;
  tracker: SymphonyTracker;
  orchestrator: SymphonyRuntimeOrchestratorPort;
  forensics: SymphonyForensicsReadModel;
  issueTimeline: SymphonyIssueTimelinePort;
  runtimeLogs: SymphonyRuntimeLogsPort;
  health: SymphonyRuntimeHealthPort;
  githubReviewIngress: SymphonyGitHubReviewIngressPort;
  realtime: SymphonyRealtimeHub;
  shutdown(): Promise<void>;
};

function createRuntimeOrchestratorPort(input: {
  runtime: Pick<CoreSymphonyRuntime, "snapshot" | "runPollCycle">;
  logger: SymphonyLogger;
  runtimeLogs: SymphonyRuntimeLogStore;
  realtime: SymphonyRealtimeHub;
}): SymphonyRuntimeOrchestratorPort {
  let inFlightPollCycle: Promise<SymphonyOrchestratorSnapshot> | null = null;
  let manualRefreshQueued = false;
  let manualRefreshDrainScheduled = false;

  const scheduleQueuedManualRefreshDrain = (): void => {
    if (manualRefreshDrainScheduled) {
      return;
    }

    manualRefreshDrainScheduled = true;
    setImmediate(() => {
      manualRefreshDrainScheduled = false;
      void drainQueuedManualRefresh();
    });
  };

  const drainQueuedManualRefresh = async (): Promise<void> => {
    if (!manualRefreshQueued || inFlightPollCycle) {
      return;
    }

    manualRefreshQueued = false;

    try {
      await port.runPollCycle();
    } catch (error) {
      input.logger.error("Queued manual refresh poll cycle failed", {
        error
      });
    }
  };

  const port: SymphonyRuntimeOrchestratorPort = {
    snapshot() {
      return input.runtime.snapshot();
    },

    isPollCycleInFlight() {
      return inFlightPollCycle !== null;
    },

    async requestRefresh() {
      const requestedAt = new Date().toISOString();
      const coalesced = manualRefreshQueued;
      manualRefreshQueued = true;

      input.logger.info(
        coalesced ? "Manual refresh request coalesced" : "Manual refresh queued",
        {
          coalesced
        }
      );
      await input.runtimeLogs.record({
        level: "info",
        source: "runtime",
        eventType: coalesced
          ? "manual_refresh_coalesced"
          : "manual_refresh_queued",
        message: coalesced
          ? "Coalesced manual refresh request."
          : "Queued manual refresh request.",
        payload: {
          coalesced
        },
        recordedAt: requestedAt
      });
      scheduleQueuedManualRefreshDrain();

      return {
        queued: true,
        coalesced,
        requestedAt,
        operations: ["poll", "reconcile"]
      };
    },

    async runPollCycle() {
      if (inFlightPollCycle) {
        return await inFlightPollCycle;
      }

      const before = input.runtime.snapshot();
      inFlightPollCycle = (async () => {
        input.logger.info("Starting orchestrator poll cycle", {
          runningCount: before.running.length,
          retryingCount: before.retrying.length
        });

        try {
          const after = await input.runtime.runPollCycle();
          const changed = snapshotRequiresRealtimeInvalidation(before, after);

          input.logger.info("Finished orchestrator poll cycle", {
            runningCount: after.running.length,
            retryingCount: after.retrying.length,
            changed
          });

          publishRealtimeSnapshotDiff(input.realtime, before, after, input.logger);
          return after;
        } catch (error) {
          input.logger.error("Orchestrator poll cycle failed", {
            error
          });
          throw error;
        } finally {
          inFlightPollCycle = null;
          if (manualRefreshQueued) {
            scheduleQueuedManualRefreshDrain();
          }
        }
      })();

      return await inFlightPollCycle;
    }
  };

  return port;
}

export async function loadDefaultSymphonyRuntimeAppServices(
  env: SymphonyRuntimeAppEnv,
  environmentSource: Record<string, string | undefined>
): Promise<SymphonyRuntimeAppServices> {
  const logger = createSymphonyLogger({
    name: "@symphony/api",
    level: env.logLevel
  });

  logger.info("Loading Symphony runtime services", {
    workflowPath: env.workflowPath,
    dbFile: env.dbFile,
    logLevel: env.logLevel
  });

  const workflow = await loadSymphonyWorkflow(env.workflowPath, {
    env: environmentSource
  });
  logger.info("Loaded workflow definition", {
    trackerKind: workflow.config.tracker.kind,
    workspaceRoot: workflow.config.workspace.root,
    pollIntervalMs: workflow.config.polling.intervalMs,
    maxConcurrentAgents: workflow.config.agent.maxConcurrentAgents
  });

  const database = initializeSymphonyDb({
    dbFile: env.dbFile
  });
  const issueTimelineStore = createSymphonyIssueTimelineStore(database.db);
  const runtimeLogStore = createSymphonyRuntimeLogStore(database.db);
  const runJournal = createSqliteSymphonyRunJournal({
    db: database.db,
    dbFile: database.dbFile,
    timelineStore: issueTimelineStore
  });
  const forensics = createSymphonyForensicsReadModel({
    journal: runJournal,
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
  });

  await runtimeLogStore.record({
    level: "info",
    source: "runtime",
    eventType: "db_initialized",
    message: "Initialized Symphony DB.",
    payload: {
      dbFile: database.dbFile
    }
  });

  const tracker =
    workflow.config.tracker.kind === "linear"
      ? createLinearSymphonyTracker({
          config: workflow.config.tracker
        })
      : createMemorySymphonyTracker([]);
  if (workflow.config.tracker.kind === "memory") {
    logger.warn("Using in-memory tracker placeholder");
    await runtimeLogStore.record({
      level: "warn",
      source: "runtime",
      eventType: "tracker_placeholder_active",
      message: "Using in-memory tracker placeholder.",
      payload: null
    });
  } else {
    await runtimeLogStore.record({
      level: "info",
      source: "runtime",
      eventType: "tracker_initialized",
      message: "Initialized Linear-backed tracker.",
      payload: {
        teamKey: workflow.config.tracker.teamKey,
        projectSlug: workflow.config.tracker.projectSlug
      }
    });
  }

  const workspaceBackendSelection = createRuntimeWorkspaceBackend(env);
  const workspaceBackend = workspaceBackendSelection.backend;
  logger.info("Initialized workspace backend", {
    workspaceRoot: workflow.config.workspace.root,
    ...workspaceBackendSelection.metadata
  });
  await runtimeLogStore.record({
    level: "info",
    source: "runtime",
    eventType: "workspace_backend_selected",
    message: "Selected the runtime workspace backend.",
    payload: {
      workspaceRoot: workflow.config.workspace.root,
      ...workspaceBackendSelection.metadata
    }
  });

  const realtime = createSymphonyRealtimeHub(
    undefined,
    logger.child({
      component: "realtime"
    })
  );
  const observer = createDbBackedOrchestratorObserver({
    runJournal,
    issueTimelineStore
  });
  let runtimeRef: Pick<
    CoreSymphonyRuntime,
    "applyAgentUpdate" | "handleRunCompletion"
  > | null = null;
  const agentRuntime = createCodexAgentRuntime(
    createCodexSymphonyAgentRuntime({
      promptTemplate: workflow.promptTemplate,
      tracker,
      runJournal,
      runtimeLogs: runtimeLogStore,
      workflowConfig: workflow.config,
      logger,
      callbacks: {
        async onUpdate(issueId, update) {
          runtimeRef?.applyAgentUpdate(issueId, update);
        },
        async onComplete(issueId, completion) {
          if (runtimeRef) {
            await runtimeRef.handleRunCompletion(issueId, completion);
          }
        }
      }
    })
  );
  const runtime = createSymphonyRuntime({
    workflowConfig: workflow.config,
    tracker,
    workspaceBackend,
    observer,
    agentRuntime,
    runnerEnv: environmentSource
  });
  runtimeRef = runtime;
  const orchestratorPort = createRuntimeOrchestratorPort({
    runtime,
    logger,
    runtimeLogs: runtimeLogStore,
    realtime
  });

  let pollScheduler: SymphonyRuntimePollScheduler | null = null;
  const issueTimeline: SymphonyIssueTimelinePort = {
    async list(input) {
      const entries = await issueTimelineStore.listIssueTimeline(
        input.issueIdentifier,
        {
          limit: input.limit
        }
      );

      if (entries.length === 0) {
        return null;
      }

      return {
        issueIdentifier: input.issueIdentifier,
        entries,
        filters: {
          limit: input.limit ?? null
        }
      };
    }
  };
  const runtimeLogs: SymphonyRuntimeLogsPort = {
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
  };
  const health: SymphonyRuntimeHealthPort = {
    snapshot() {
      return {
        healthy: (pollScheduler?.snapshot().lastError ?? null) === null,
        db: {
          file: database.dbFile,
          ready: true
        },
        poller:
          pollScheduler?.snapshot() ?? buildIdlePollerSnapshot(workflow.config.polling.intervalMs)
      };
    }
  };

  const githubReviewIngress = createSymphonyGitHubReviewIngressService({
    workflowConfig: workflow.config,
    reviewProcessor: new SymphonyGithubReviewProcessor({
      workflowConfig: workflow.config,
      tracker,
      pullRequestResolver: {
        async fetchPullRequest(pullRequestUrl) {
          return fetchGitHubPullRequest(
            pullRequestUrl,
            workflow.config.github.apiToken,
            logger
          );
        },
        async createIssueComment(repository, issueNumber, body) {
          await createGitHubIssueComment({
            repository,
            issueNumber,
            body,
            apiToken: workflow.config.github.apiToken,
            logger
          });
        }
      }
    }),
    eventJournal: createSymphonyGitHubIngressJournal(database.db),
    logger: logger.child({
      component: "github_review_ingress"
    }),
    async onProcessed(result) {
      logger.info("Publishing realtime invalidation after GitHub review ingress", {
        result
      });
      const issueIdentifier =
        "issueIdentifier" in result ? result.issueIdentifier : null;

      await runtimeLogStore.record({
        level: "info",
        source: "github_review_ingress",
        eventType: "github_review_ingress_processed",
        message: "Processed GitHub review ingress event.",
        issueIdentifier,
        payload: result
      });
      realtime.publishSnapshotUpdated();
      realtime.publishProblemRunsUpdated();

      if (result.status !== "ignored" && issueIdentifier) {
        const trackedIssue = await tracker.fetchIssueByIdentifier(
          workflow.config.tracker,
          issueIdentifier
        );

        if (trackedIssue) {
          await issueTimelineStore.record({
            issueId: trackedIssue.id,
            issueIdentifier: trackedIssue.identifier,
            source: "tracker",
            eventType: "github_review_ingress_processed",
            message: `GitHub review ingress processed with status ${result.status}.`,
            payload: result
          });
        }

        realtime.publishIssueUpdated(issueIdentifier);
      }
    }
  });

  pollScheduler = new SymphonyRuntimePollScheduler({
    intervalMs: workflow.config.polling.intervalMs,
    logger: logger.child({
      component: "poller"
    }),
    runtimeLogs: runtimeLogStore,
    runPollCycle: () => orchestratorPort.runPollCycle(),
    isPollCycleInFlight: () => orchestratorPort.isPollCycleInFlight(),
    onFatalError(error) {
      logger.error("Fatal runtime error; terminating Symphony runtime", {
        error
      });
      setImmediate(() => {
        process.exitCode = 1;
        process.exit(1);
      });
    }
  });
  pollScheduler.start();
  await runtimeLogStore.record({
    level: "info",
    source: "runtime",
    eventType: "poller_started",
    message: "Started autonomous poll scheduler.",
    payload: {
      intervalMs: workflow.config.polling.intervalMs
    }
  });

  return {
    logger,
    workflow,
    workflowConfig: workflow.config,
    tracker,
    orchestrator: orchestratorPort,
    forensics,
    issueTimeline,
    runtimeLogs,
    health,
    githubReviewIngress,
    realtime,
    async shutdown() {
      pollScheduler?.stop();
      database.close();
    }
  };
}

async function fetchGitHubPullRequest(
  pullRequestUrl: string,
  apiToken: string | null,
  logger: SymphonyLogger
): Promise<{ headRef: string | null; htmlUrl: string | null } | null> {
  try {
    const response = await fetch(pullRequestUrl, {
      headers: buildGitHubRequestHeaders(apiToken)
    });

    if (!response.ok) {
      logger.warn("Failed to fetch GitHub pull request metadata", {
        pullRequestUrl,
        status: response.status
      });
      return null;
    }

    const payload = (await response.json()) as {
      head?: { ref?: unknown };
      html_url?: unknown;
    };

    return {
      headRef: typeof payload.head?.ref === "string" ? payload.head.ref : null,
      htmlUrl: typeof payload.html_url === "string" ? payload.html_url : null
    };
  } catch (error) {
    logger.warn("GitHub pull request lookup failed", {
      pullRequestUrl,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

async function createGitHubIssueComment(input: {
  repository: string;
  issueNumber: number;
  body: string;
  apiToken: string | null;
  logger: SymphonyLogger;
}): Promise<void> {
  if (!input.apiToken) {
    return;
  }

  const endpoint = `https://api.github.com/repos/${input.repository}/issues/${input.issueNumber}/comments`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...buildGitHubRequestHeaders(input.apiToken),
        "content-type": "application/json"
      },
      body: JSON.stringify({
        body: input.body
      })
    });

    if (!response.ok) {
      input.logger.warn("Failed to create GitHub acknowledgement comment", {
        repository: input.repository,
        issueNumber: input.issueNumber,
        status: response.status
      });
    }
  } catch (error) {
    input.logger.warn("GitHub acknowledgement comment failed", {
      repository: input.repository,
      issueNumber: input.issueNumber,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function buildGitHubRequestHeaders(
  apiToken: string | null
): Record<string, string> {
  return {
    accept: "application/vnd.github+json",
    "user-agent": "symphony-runtime",
    ...(apiToken ? { authorization: `Bearer ${apiToken}` } : {})
  };
}

export function requireRuntimeIssue(
  services: SymphonyRuntimeAppServices,
  issueIdentifier: string
): {
  issueId: string;
  running:
    | SymphonyOrchestratorSnapshot["running"][number]
    | undefined;
  retry:
    | SymphonyOrchestratorSnapshot["retrying"][number]
    | undefined;
} {
  const snapshot = services.orchestrator.snapshot();
  const running = snapshot.running.find(
    (entry) => entry.issue.identifier === issueIdentifier
  );
  const retry = snapshot.retrying.find(
    (entry) => entry.identifier === issueIdentifier
  );

  if (!running && !retry) {
    throw createRuntimeHttpError(404, "NOT_FOUND", "Issue not found.");
  }

  return {
    issueId: running?.issueId ?? retry!.issueId,
    running,
    retry
  };
}

function buildIdlePollerSnapshot(
  intervalMs: number
): SymphonyRuntimePollSchedulerSnapshot {
  return {
    running: false,
    intervalMs,
    inFlight: false,
    lastStartedAt: null,
    lastCompletedAt: null,
    lastSucceededAt: null,
    lastError: null
  };
}
