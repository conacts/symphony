import {
  createFileBackedSymphonyRunJournal,
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
  SymphonyGitHubReviewIngressResult,
  SymphonyGitHubWebhookBody,
  SymphonyGitHubWebhookHeaders
} from "@symphony/contracts";
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

export type SymphonyRuntimeOrchestratorPort = {
  snapshot(): SymphonyOrchestratorSnapshot;
  runPollCycle(): Promise<SymphonyOrchestratorSnapshot>;
};

export type SymphonyGitHubReviewIngressPort = {
  ingest(input: {
    headers: SymphonyGitHubWebhookHeaders;
    body: SymphonyGitHubWebhookBody;
    rawBody: string;
  }): Promise<SymphonyGitHubReviewIngressResult>;
};

export type SymphonyRuntimeAppServices = {
  logger: SymphonyLogger;
  workflow: SymphonyLoadedWorkflow;
  workflowConfig: SymphonyResolvedWorkflowConfig;
  tracker: SymphonyTracker;
  orchestrator: SymphonyRuntimeOrchestratorPort;
  forensics: SymphonyForensicsReadModel;
  githubReviewIngress: SymphonyGitHubReviewIngressPort;
  realtime: SymphonyRealtimeHub;
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
    runJournalFile: env.runJournalFile,
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
  const tracker = createMemorySymphonyTracker([]);
  logger.warn("Using in-memory tracker placeholder", {
    linearGapTicket: "COL-161"
  });
  const runJournal = createFileBackedSymphonyRunJournal({
    dbFile: env.runJournalFile
  });
  logger.info("Opened run journal", {
    runJournalFile: env.runJournalFile
  });
  const forensics = createSymphonyForensicsReadModel(runJournal);
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
  const orchestrator = new SymphonyOrchestrator({
    workflowConfig: workflow.config,
    tracker,
    workspaceManager,
    agentRuntime: {
      async startRun(input) {
        logger.warn("Using stub agent runtime placeholder", {
          workspacePath: input.workspace.path,
          codexGapTicket: "COL-161"
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
  const orchestratorPort: SymphonyRuntimeOrchestratorPort = {
    snapshot() {
      return orchestrator.snapshot();
    },
    async runPollCycle() {
      const before = orchestrator.snapshot();
      logger.info("Starting orchestrator poll cycle", {
        runningCount: before.running.length,
        retryingCount: before.retrying.length
      });
      const after = await orchestrator.runPollCycle();
      const changed = JSON.stringify(before) !== JSON.stringify(after);

      logger.info("Finished orchestrator poll cycle", {
        runningCount: after.running.length,
        retryingCount: after.retrying.length,
        changed
      });

      publishRealtimeSnapshotDiff(realtime, before, after, logger);
      return after;
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
    logger: logger.child({
      component: "github_review_ingress"
    }),
    onProcessed(result) {
      logger.info("Publishing realtime invalidation after GitHub review ingress", {
        result
      });
      realtime.publishSnapshotUpdated();
      realtime.publishProblemRunsUpdated();

      if (result.status !== "ignored" && result.issueIdentifier) {
        realtime.publishIssueUpdated(result.issueIdentifier);
      }
    }
  });

  return {
    logger,
    workflow,
    workflowConfig: workflow.config,
    tracker,
    orchestrator: orchestratorPort,
    forensics,
    githubReviewIngress,
    realtime
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
