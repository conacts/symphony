import {
  createLinearSymphonyTracker,
  createLocalSymphonyWorkspaceManager,
  createMemorySymphonyTracker,
  createSymphonyForensicsReadModel,
  loadSymphonyWorkflow,
  SymphonyGithubReviewProcessor,
  SymphonyOrchestrator,
  type SymphonyForensicsReadModel,
  type SymphonyLoadedWorkflow,
  type SymphonyOrchestratorSnapshot,
  type SymphonyResolvedWorkflowConfig,
  type SymphonyTracker
} from "@symphony/core";
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
  initializeSymphonyDb
} from "@symphony/db";
import {
  createSymphonyLogger,
  type SymphonyLogger
} from "@symphony/logger";
import { createRuntimeHttpError } from "./errors.js";
import type { SymphonyRuntimeAppEnv } from "./env.js";
import { createSymphonyGitHubReviewIngressService } from "./github-review-ingress.js";
import { createLocalCodexSymphonyAgentRuntime } from "./codex-agent-runtime.js";
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

  const workspaceManager = createLocalSymphonyWorkspaceManager({
    repoOwnedSourceRepo: env.sourceRepo
  });
  logger.info("Initialized workspace manager", {
    workspaceRoot: workflow.config.workspace.root,
    sourceRepo: env.sourceRepo
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
  let orchestratorRef: SymphonyOrchestrator | null = null;
  const agentRuntime = createLocalCodexSymphonyAgentRuntime({
    promptTemplate: workflow.promptTemplate,
    tracker,
    runJournal,
    runtimeLogs: runtimeLogStore,
    workflowConfig: workflow.config,
    logger,
    callbacks: {
      async onUpdate(issueId, update) {
        orchestratorRef?.applyAgentUpdate(issueId, update);
      },
      async onComplete(issueId, completion) {
        if (orchestratorRef) {
          await orchestratorRef.handleRunCompletion(issueId, completion);
        }
      }
    }
  });
  const orchestrator = new SymphonyOrchestrator({
    workflowConfig: workflow.config,
    tracker,
    workspaceManager,
    observer,
    agentRuntime,
    runnerEnv: environmentSource
  });
  orchestratorRef = orchestrator;

  let inFlightPollCycle: Promise<SymphonyOrchestratorSnapshot> | null = null;
  let manualRefreshQueued = false;
  let manualRefreshDrainScheduled = false;
  let orchestratorPort: SymphonyRuntimeOrchestratorPort;

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
      await orchestratorPort.runPollCycle();
    } catch (error) {
      logger.error("Queued manual refresh poll cycle failed", {
        error
      });
    }
  };

  orchestratorPort = {
    snapshot() {
      return orchestrator.snapshot();
    },

    isPollCycleInFlight() {
      return inFlightPollCycle !== null;
    },

    async requestRefresh() {
      const requestedAt = new Date().toISOString();
      const coalesced = manualRefreshQueued;
      manualRefreshQueued = true;

      logger.info(
        coalesced ? "Manual refresh request coalesced" : "Manual refresh queued",
        {
          coalesced
        }
      );
      await runtimeLogStore.record({
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

      const before = orchestrator.snapshot();
      inFlightPollCycle = (async () => {
        logger.info("Starting orchestrator poll cycle", {
          runningCount: before.running.length,
          retryingCount: before.retrying.length
        });

        try {
          const after = await orchestrator.runPollCycle();
          const changed = snapshotRequiresRealtimeInvalidation(before, after);

          logger.info("Finished orchestrator poll cycle", {
            runningCount: after.running.length,
            retryingCount: after.retrying.length,
            changed
          });

          publishRealtimeSnapshotDiff(realtime, before, after, logger);
          return after;
        } catch (error) {
          logger.error("Orchestrator poll cycle failed", {
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
        async fetchPullRequest() {
          return null;
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
