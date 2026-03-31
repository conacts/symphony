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
  const workflow = await loadSymphonyWorkflow(env.workflowPath, {
    env: environmentSource
  });
  const tracker = createMemorySymphonyTracker([]);
  const runJournal = createFileBackedSymphonyRunJournal({
    dbFile: env.runJournalFile
  });
  const forensics = createSymphonyForensicsReadModel(runJournal);
  const workspaceManager = createLocalSymphonyWorkspaceManager();
  const realtime = createSymphonyRealtimeHub();
  const orchestrator = new SymphonyOrchestrator({
    workflowConfig: workflow.config,
    tracker,
    workspaceManager,
    agentRuntime: {
      async startRun(input) {
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
      const after = await orchestrator.runPollCycle();

      publishRealtimeSnapshotDiff(realtime, before, after);
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
    onProcessed(result) {
      realtime.publishSnapshotUpdated();
      realtime.publishProblemRunsUpdated();

      if (result.status !== "ignored" && result.issueIdentifier) {
        realtime.publishIssueUpdated(result.issueIdentifier);
      }
    }
  });

  return {
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
  after: SymphonyOrchestratorSnapshot
): void {
  if (JSON.stringify(before) === JSON.stringify(after)) {
    return;
  }

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
