import { createCodexAgentRuntime } from "@symphony/orchestrator";
import { createSymphonyRuntime } from "@symphony/runtime";
import {
  defaultSymphonyDockerWorkspacePreflightTimeoutMs,
  preflightSymphonyDockerWorkspaceImage,
  type SymphonyDockerWorkspacePreflightResult
} from "@symphony/workspace";
import { createSymphonyForensicsReadModel } from "@symphony/forensics";
import { SymphonyGithubReviewProcessor } from "@symphony/github-review";
import {
  createLinearSymphonyTracker,
  createMemorySymphonyTracker
} from "@symphony/tracker";
import {
  createSqliteCodexAnalyticsReadStore,
  createSqliteCodexAnalyticsStore,
  createSqliteSymphonyRuntimeRunStore,
  createSymphonyGitHubIngressJournal,
  createSymphonyIssueTimelineStore,
  createSymphonyRuntimeLogStore,
  initializeSymphonyDb
} from "@symphony/db";
import { loadSymphonyPromptContract } from "@symphony/runtime-contract";
import { createSymphonyLogger } from "@symphony/logger";
import { HarnessSessionError } from "./agent-session-types.js";
import {
  resolveDockerCodexAuthContract,
  resolveDockerGitHubCliAuthContract,
  resolveDockerOpenCodeAuthContract
} from "./codex-auth-contract.js";
import type { SymphonyRuntimeAppEnv } from "./env.js";
import { createSymphonyGitHubReviewIngressService } from "./github-review-ingress.js";
import { createHarnessBackedSymphonyAgentRuntime } from "./agent-harness-runtime.js";
import { createDbBackedOrchestratorObserver } from "./runtime-db-observer.js";
import { createSymphonyRealtimeHub } from "../realtime/symphony-realtime-hub.js";
import { SymphonyRuntimePollScheduler } from "./poll-scheduler.js";
import { validateSourceRepoRuntimeManifest } from "./runtime-manifest-startup-validator.js";
import { loadSymphonyRuntimePolicyConfig } from "./runtime-policy-config.js";
import { createRuntimeWorkspaceBackend } from "./runtime-workspace-backend.js";
import type { SymphonyRuntimeAppServices } from "./runtime-app-types.js";
import { createRuntimeOrchestratorPort } from "./runtime-orchestrator-port.js";
import {
  createIssueTimelinePort,
  createRuntimeHealthPort,
  createRuntimeLogsPort
} from "./runtime-observability-ports.js";
import {
  createGitHubIssueComment,
  fetchGitHubPullRequestMetadata
} from "./runtime-github-client.js";
import { normalizeRuntimeJsonValue } from "./runtime-json-value.js";
import { createCodexAnalyticsReadPort } from "./codex-analytics-read-port.js";
import { resolveRuntimeHarness } from "./runtime-harness.js";

export async function loadDefaultSymphonyRuntimeAppServices(
  env: SymphonyRuntimeAppEnv,
  environmentSource: Record<string, string | undefined>,
  hostCommandEnvSource: Record<string, string | undefined>
): Promise<SymphonyRuntimeAppServices> {
  const logger = createSymphonyLogger({
    name: "@symphony/api",
    level: env.logLevel
  });

  logger.info("Loading Symphony runtime services", {
    sourceRepo: env.sourceRepo,
    dbFile: env.dbFile,
    logLevel: env.logLevel
  });

  const runtimePolicy = loadSymphonyRuntimePolicyConfig({
    environmentSource,
    cwd: process.cwd()
  });
  const runtimeHarness = resolveRuntimeHarness(runtimePolicy.agent.harness);
  const promptContract = loadSymphonyPromptContract({
    repoRoot: env.sourceRepo ?? process.cwd()
  });
  const promptTemplate = {
    prompt: promptContract.template.trim(),
    promptTemplate: promptContract.template,
    sourcePath: promptContract.promptPath
  };

  logger.info("Loaded runtime prompt contract and platform policy", {
    trackerKind: runtimePolicy.tracker.kind,
    promptPath: promptContract.promptPath,
    workspaceRoot: runtimePolicy.workspace.root,
    pollIntervalMs: runtimePolicy.polling.intervalMs,
    maxConcurrentAgents: runtimePolicy.agent.maxConcurrentAgents
  });

  const validatedRuntimeManifest = env.sourceRepo
    ? await validateSourceRepoRuntimeManifest(
        env.sourceRepo,
        environmentSource
      )
    : null;

  if (validatedRuntimeManifest) {
    logger.info(
      "Validated source-repo runtime manifest",
      validatedRuntimeManifest.summary
    );
  }

  const database = initializeSymphonyDb({
    dbFile: env.dbFile
  });
  const issueTimelineStore = createSymphonyIssueTimelineStore(database.db);
  const runtimeLogStore = createSymphonyRuntimeLogStore(database.db);
  const runStore = createSqliteSymphonyRuntimeRunStore({
    db: database.db,
    timelineStore: issueTimelineStore
  });
  const codexAnalytics = createSqliteCodexAnalyticsStore({
    db: database.db
  });
  const codexAnalyticsReadStore = createSqliteCodexAnalyticsReadStore({
    db: database.db
  });
  const codexAnalyticsRead = createCodexAnalyticsReadPort(codexAnalyticsReadStore);
  const forensics = createSymphonyForensicsReadModel({
    runStore: codexAnalyticsReadStore,
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
    runtimePolicy.tracker.kind === "linear"
      ? createLinearSymphonyTracker({
          config: runtimePolicy.tracker
        })
      : createMemorySymphonyTracker([]);
  if (runtimePolicy.tracker.kind === "memory") {
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
        teamKey: runtimePolicy.tracker.teamKey,
        projectSlug: runtimePolicy.tracker.projectSlug
      }
    });
  }

  const dockerCodexAuth = resolveDockerCodexAuthContract(hostCommandEnvSource, {
    preferredApiKeyEnvKey: runtimePolicy.codex.provider?.envKey ?? null
  });
  const dockerGitHubCliAuth = resolveDockerGitHubCliAuthContract(
    hostCommandEnvSource
  );
  const dockerOpenCodeAuth = resolveDockerOpenCodeAuthContract(
    hostCommandEnvSource
  );

  if (runtimeHarness.kind === "codex" && dockerCodexAuth.mode === "unavailable") {
    throw new HarnessSessionError(
      "codex_auth_unavailable",
      "Docker-backed Symphony workspaces require host-owned Codex auth. Provide ~/.codex/auth.json (or $CODEX_HOME/auth.json) for subscription auth, or set the configured provider API key env as a host-only fallback."
    );
  }

  const workspaceBackendSelection = createRuntimeWorkspaceBackend(env, {
    dockerHostFileMounts: [
      ...(dockerCodexAuth?.mount ? [dockerCodexAuth.mount] : []),
      ...(dockerGitHubCliAuth.mount ? [dockerGitHubCliAuth.mount] : []),
      ...(dockerOpenCodeAuth.mount ? [dockerOpenCodeAuth.mount] : [])
    ],
    runtimeManifest: validatedRuntimeManifest?.runtimeManifest ?? null
  });
  const workspaceBackendPayload = {
    workspaceRoot: runtimePolicy.workspace.root,
    ...workspaceBackendSelection.metadata,
    dockerCodexAuthMode: dockerCodexAuth?.mode ?? null,
    dockerOpenCodeAuthMounted: dockerOpenCodeAuth.mount !== null
  };
  let dockerPreflight: SymphonyDockerWorkspacePreflightResult | null = null;
  if (workspaceBackendSelection.metadata.backendKind === "docker") {
    try {
      dockerPreflight = await preflightDockerWorkspaceBackendSelection({
        image: workspaceBackendSelection.metadata.image,
        shell: workspaceBackendSelection.metadata.shell
      });
    } catch (error) {
      logger.error("Docker workspace backend preflight failed", {
        workspaceRoot: runtimePolicy.workspace.root,
        ...workspaceBackendSelection.metadata,
        error
      });
      await runtimeLogStore.record({
        level: "error",
        source: "runtime",
        eventType: "workspace_backend_preflight_failed",
        message: "Docker workspace backend preflight failed.",
        payload: normalizeRuntimeJsonValue({
          ...workspaceBackendPayload,
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message
                }
              : {
                  message: String(error)
                }
        })
      });
      throw error;
    }
  }
  const workspaceBackend = workspaceBackendSelection.backend;
  logger.info("Initialized workspace backend", {
    workspaceRoot: runtimePolicy.workspace.root,
    ...workspaceBackendSelection.metadata,
    dockerPreflight
  });
  await runtimeLogStore.record({
    level: "info",
    source: "runtime",
    eventType: "workspace_backend_selected",
    message: "Selected the runtime workspace backend.",
    payload: normalizeRuntimeJsonValue({
      ...workspaceBackendPayload,
      dockerPreflight
    })
  });

  const realtime = createSymphonyRealtimeHub(
    undefined,
    logger.child({
      component: "realtime"
    })
  );
  const observer = createDbBackedOrchestratorObserver({
    runStore,
    issueTimelineStore,
    codexAnalytics
  });
  let runtimeRef: Pick<
    ReturnType<typeof createSymphonyRuntime>,
    "applyAgentUpdate" | "handleRunCompletion"
  > | null = null;
  const agentRuntime = createCodexAgentRuntime(
    createHarnessBackedSymphonyAgentRuntime({
      harness: runtimeHarness,
      promptContract,
      githubRepository: runtimePolicy.github.repo,
      tracker,
      runStore,
      codexAnalytics,
      runtimeLogs: runtimeLogStore,
      hostCommandEnvSource,
      codexHostLaunchEnv: dockerCodexAuth?.launchEnv ?? {},
      codexAuthMode: dockerCodexAuth?.mode ?? null,
      codexProviderEnvKey: runtimePolicy.codex.provider?.envKey ?? null,
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
    runtimePolicy,
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
  const issueTimeline = createIssueTimelinePort({
    issueTimelineStore
  });
  const runtimeLogs = createRuntimeLogsPort({
    runtimeLogStore
  });
  const health = createRuntimeHealthPort({
    dbFile: database.dbFile,
    runtimePolicy,
    readPollSchedulerSnapshot: () => pollScheduler?.snapshot() ?? null
  });

  const githubReviewIngress = createSymphonyGitHubReviewIngressService({
    githubPolicy: runtimePolicy.github,
    reviewProcessor: new SymphonyGithubReviewProcessor({
      policyConfig: {
        tracker: runtimePolicy.tracker,
        github: runtimePolicy.github
      },
      tracker,
      pullRequestResolver: {
        async fetchPullRequest(pullRequestUrl) {
          return fetchGitHubPullRequestMetadata(
            pullRequestUrl,
            runtimePolicy.github.apiToken,
            logger
          );
        },
        async createIssueComment(repository, issueNumber, body) {
          await createGitHubIssueComment({
            repository,
            issueNumber,
            body,
            apiToken: runtimePolicy.github.apiToken,
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
          runtimePolicy.tracker,
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
    intervalMs: runtimePolicy.polling.intervalMs,
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
      intervalMs: runtimePolicy.polling.intervalMs
    }
  });

  return {
    logger,
    promptTemplate,
    promptContract,
    runtimePolicy,
    tracker,
    orchestrator: orchestratorPort,
    codexAnalytics: codexAnalyticsRead,
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

async function preflightDockerWorkspaceBackendSelection(input: {
  image: string;
  shell: string | null;
}) {
  return await preflightSymphonyDockerWorkspaceImage({
    image: input.image,
    shell: input.shell,
    timeoutMs: defaultSymphonyDockerWorkspacePreflightTimeoutMs
  });
}
