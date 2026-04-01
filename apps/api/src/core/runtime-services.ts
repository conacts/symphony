import {
  createLocalSymphonyWorkspaceManager,
  createMemorySymphonyTracker,
  createSymphonyForensicsReadModel,
  loadSymphonyWorkflow,
  SymphonyGithubReviewProcessor,
  SymphonyOrchestrator,
  type SymphonyForensicsReadModel,
  type SymphonyLoadedWorkflow,
  type SymphonyOrchestratorObserver,
  type SymphonyOrchestratorSnapshot,
  type SymphonyResolvedWorkflowConfig,
  type SymphonyJsonValue,
  type SymphonyRunJournal,
  type SymphonyTracker
} from "@symphony/core";
import type {
  SymphonyForensicsIssueTimelineResult,
  SymphonyGitHubReviewIngressResult,
  SymphonyGitHubWebhookBody,
  SymphonyGitHubWebhookHeaders,
  SymphonyRuntimeHealthResult,
  SymphonyRuntimeLogsResult
} from "@symphony/contracts";
import {
  createSymphonyGitHubIngressJournal,
  createSymphonyIssueTimelineStore,
  createSymphonyRuntimeLogStore,
  createSqliteSymphonyRunJournal,
  initializeSymphonyDb,
  type SymphonyIssueTimelineStore
} from "@symphony/db";
import {
  createSymphonyLogger,
  type SymphonyLogger
} from "@symphony/logger";
import { createRuntimeHttpError } from "./errors.js";
import type { SymphonyRuntimeAppEnv } from "./env.js";
import { createSymphonyGitHubReviewIngressService } from "./github-review-ingress.js";
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
  const forensics = createSymphonyForensicsReadModel(runJournal);

  await runtimeLogStore.record({
    level: "info",
    source: "runtime",
    eventType: "db_initialized",
    message: "Initialized Symphony DB.",
    payload: {
      dbFile: database.dbFile
    }
  });

  const tracker = createMemorySymphonyTracker([]);
  logger.warn("Using in-memory tracker placeholder", {
    linearGapTicket: "COL-161"
  });
  await runtimeLogStore.record({
    level: "warn",
    source: "runtime",
    eventType: "tracker_placeholder_active",
    message: "Using in-memory tracker placeholder.",
    payload: {
      linearGapTicket: "COL-161"
    }
  });

  const workspaceManager = createLocalSymphonyWorkspaceManager();
  logger.info("Initialized workspace manager", {
    workspaceRoot: workflow.config.workspace.root
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
  const orchestrator = new SymphonyOrchestrator({
    workflowConfig: workflow.config,
    tracker,
    workspaceManager,
    observer,
    agentRuntime: {
      async startRun(input) {
        logger.warn("Using stub agent runtime placeholder", {
          workspacePath: input.workspace.path,
          codexGapTicket: "COL-161"
        });
        await runtimeLogStore.record({
          level: "warn",
          source: "runtime",
          eventType: "stub_agent_runtime",
          message: "Using stub agent runtime placeholder.",
          issueId: input.issue.id,
          issueIdentifier: input.issue.identifier,
          payload: {
            workspacePath: input.workspace.path,
            codexGapTicket: "COL-161"
          }
        });
        return {
          sessionId: null,
          workerHost: null,
          workspacePath: input.workspace.path
        };
      },
      async stopRun() {
        return;
      }
    }
  });

  let inFlightPollCycle: Promise<SymphonyOrchestratorSnapshot> | null = null;
  const orchestratorPort: SymphonyRuntimeOrchestratorPort = {
    snapshot() {
      return orchestrator.snapshot();
    },

    isPollCycleInFlight() {
      return inFlightPollCycle !== null;
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
          const changed = JSON.stringify(before) !== JSON.stringify(after);

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

function publishRealtimeSnapshotDiff(
  realtime: SymphonyRealtimeHub,
  before: SymphonyOrchestratorSnapshot,
  after: SymphonyOrchestratorSnapshot,
  logger: SymphonyLogger
): void {
  if (JSON.stringify(before) === JSON.stringify(after)) {
    logger.debug("Skipped realtime invalidation because snapshot did not change");
    return;
  }

  logger.debug("Publishing realtime invalidation for snapshot change", {
    beforeRunningCount: before.running.length,
    afterRunningCount: after.running.length,
    beforeRetryingCount: before.retrying.length,
    afterRetryingCount: after.retrying.length
  });
  realtime.publishSnapshotUpdated();
  realtime.publishProblemRunsUpdated();

  const issueIdentifiers = new Set<string>();

  for (const entry of before.running) {
    issueIdentifiers.add(entry.issue.identifier);
  }

  for (const entry of before.retrying) {
    issueIdentifiers.add(entry.identifier);
  }

  for (const entry of after.running) {
    issueIdentifiers.add(entry.issue.identifier);
  }

  for (const entry of after.retrying) {
    issueIdentifiers.add(entry.identifier);
  }

  for (const issueIdentifier of issueIdentifiers) {
    realtime.publishIssueUpdated(issueIdentifier);
  }
}

function createDbBackedOrchestratorObserver(input: {
  runJournal: SymphonyRunJournal;
  issueTimelineStore: SymphonyIssueTimelineStore;
}): SymphonyOrchestratorObserver {
  return {
    async startRun({ issue, attempt, workspacePath, workerHost, startedAt }) {
      return await input.runJournal.recordRunStarted({
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        attempt,
        status: "dispatching",
        workerHost,
        workspacePath,
        startedAt,
        metadata: {
          runtime: "typescript"
        }
      });
    },

    async recordLifecycleEvent({
      issue,
      runId,
      source,
      eventType,
      message,
      payload,
      recordedAt
    }) {
      if (runId && source === "workspace") {
        const workspacePayload = asRecord(payload);
        await input.runJournal.updateRun(runId, {
          workspacePath:
            typeof workspacePayload?.workspacePath === "string"
              ? workspacePayload.workspacePath
              : null,
          workerHost:
            typeof workspacePayload?.workerHost === "string"
              ? workspacePayload.workerHost
              : null
        });
      }

      if (runId && eventType === "run_launched") {
        const launchPayload = asRecord(payload);
        await input.runJournal.updateRun(runId, {
          status: "running",
          workspacePath:
            typeof launchPayload?.workspacePath === "string"
              ? launchPayload.workspacePath
              : null,
          workerHost:
            typeof launchPayload?.workerHost === "string"
              ? launchPayload.workerHost
              : null,
          metadata: {
            sessionId:
              typeof launchPayload?.sessionId === "string"
                ? launchPayload.sessionId
                : null
          }
        });
      }

      await input.issueTimelineStore.record({
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        runId,
        source,
        eventType,
        message: message ?? null,
        payload: normalizeJsonValue(payload),
        recordedAt
      });
    },

    async finalizeRun({
      runId,
      completion,
      workerHost,
      workspacePath,
      endedAt,
      turnCount,
      inputTokens,
      outputTokens,
      totalTokens
    }) {
      if (!runId) {
        return;
      }

      await input.runJournal.finalizeRun(runId, {
        status: "finished",
        outcome: completionOutcome(completion),
        endedAt,
        metadata: {
          turnCount,
          workerHost,
          workspacePath,
          tokens: {
            inputTokens,
            outputTokens,
            totalTokens
          }
        },
        errorClass: completion.kind === "normal" ? null : completion.kind,
        errorMessage: completion.kind === "normal" ? null : completion.reason
      });
    }
  };
}

function completionOutcome(
  completion: Parameters<SymphonyOrchestratorObserver["finalizeRun"]>[0]["completion"]
): string {
  switch (completion.kind) {
    case "normal":
      return "completed_turn_batch";
    case "startup_failure":
      return "startup_failed";
    case "failure":
      return "failed";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeJsonValue(value: unknown): SymphonyJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeJsonValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        normalizeJsonValue(nestedValue)
      ])
    ) as SymphonyJsonValue;
  }

  return String(value);
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
