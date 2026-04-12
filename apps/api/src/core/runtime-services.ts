import { createAgentRuntime } from "@symphony/orchestrator";
import { createSymphonyRuntime } from "@symphony/runtime";
import {
  defaultSymphonyDockerWorkspacePreflightTimeoutMs,
  preflightSymphonyDockerWorkspaceImage,
  type SymphonyDockerWorkspacePreflightResult
} from "@symphony/workspace";
import { createSymphonyForensicsReadModel } from "@symphony/forensics";
import { SymphonyGithubReviewProcessor } from "@symphony/github-review";
import {
  createSqliteAgentAnalyticsReadStore,
  createSqliteAgentAnalyticsStore,
  createRouteWorkflowStore,
  createSqliteRuntimeForensicsReadStore,
  createSymphonyIssueDeliveryReportStore,
  createSymphonyIssueStore,
  createSqliteSymphonyRuntimeRunStore,
  createSymphonyGitHubIngressJournal,
  createSymphonyIssueTimelineStore,
  createSymphonyRuntimeLogStore,
  initializeSymphonyDb
} from "@symphony/db";
import type {
  SymphonyNormalizedRuntimeManifest
} from "@symphony/runtime-contract";
import { createSymphonyLogger } from "@symphony/logger";
import {
  HarnessSessionError
} from "@symphony/agent-harnesses";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import {
  type SymphonyResolvedRuntimePolicy
} from "@symphony/runtime-policy";
import {
  resolveDockerWorkspaceAuthContracts,
  type DockerGitHubCliAuthContract,
  type DockerPiAuthContract
} from "./runtime-auth-contract.js";
import type { SymphonyRuntimeAppEnv } from "./env.js";
import { createSymphonyGitHubReviewIngressService } from "./github-review-ingress.js";
import { createSymphonyAgentRuntime } from "./agent-harness-runtime.js";
import { createDbBackedOrchestratorObserver } from "./runtime-db-observer.js";
import { createSymphonyRealtimeHub } from "../realtime/symphony-realtime-hub.js";
import { SymphonyRuntimePollScheduler } from "./poll-scheduler.js";
import { createRuntimeWorkspaceBackend } from "./runtime-workspace-backend.js";
import type { SymphonyRuntimeAppServices } from "./runtime-app-types.js";
import { createRuntimeOrchestratorPort } from "./runtime-orchestrator-port.js";
import { createRuntimeMachineLoadMonitor } from "./runtime-machine-load.js";
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
import { createAgentAnalyticsReadPort } from "./agent-analytics-read-port.js";
import { resolveRuntimeRepositoryKey } from "./runtime-repository-key.js";
import { createRepositoryScopedWorkspaceBackend } from "./runtime-workspace-backend-selector.js";
import { createRepositoryScopedLinearTracker } from "./runtime-linear-tracker-registry.js";
import { createRouteWorkflowPort } from "./runtime-route-workflows.js";
import { createRuntimeRouteLifecycleService } from "./runtime-route-lifecycle-service.js";
import { createRuntimeWorkflowSessionLoader } from "./runtime-workflow-session-loader.js";
import { loadRuntimeServiceBootstrap } from "./runtime-service-bootstrap.js";
import type { SymphonyTrackerStateDispatchRequest } from "./runtime-tracker-state-observation-routing.js";
import {
  compareRuntimeWorkflowByIssueIdentifier,
  compareRuntimeWorkflowByWorkflowId
} from "./runtime-workflow-comparison.js";
import {
  createRuntimeTrackerStateIngressPort
} from "./runtime-tracker-state-ingress-port.js";
import {
  createWorkflowDispatchTracker
} from "./runtime-workflow-dispatch-tracker.js";
import { createRuntimeToolsPort } from "./runtime-tools-port.js";
import {
  reconcilePersistedActiveRunsOnShutdown,
  waitForPollSchedulerDrain
} from "./runtime-shutdown-reconciliation.js";

export async function loadDefaultSymphonyRuntimeAppServices(
  env: SymphonyRuntimeAppEnv,
  environmentSource: Record<string, string | undefined>,
  hostCommandEnvSource: Record<string, string | undefined>,
  options: {
    startPollScheduler?: boolean;
    startMachineLoadMonitor?: boolean;
    enableDockerPreflight?: boolean;
  } = {}
): Promise<SymphonyRuntimeAppServices> {
  const startPollScheduler = options.startPollScheduler ?? true;
  const startMachineLoadMonitor = options.startMachineLoadMonitor ?? true;
  const enableDockerPreflight = options.enableDockerPreflight ?? true;
  const logger = createSymphonyLogger({
    name: "@symphony/api",
    level: env.logLevel
  });

  logger.info("Loading Symphony runtime services", {
    sourceRepo: env.sourceRepo,
    sourceRepos: env.sourceRepos,
    dbFile: env.dbFile,
    logLevel: env.logLevel
  });

  const {
    runtimePolicy: loadedRuntimePolicy,
    harnessProviderEnvKey,
    admittedRepositories,
    validatedRuntimeManifests,
    primaryRepository,
    selectedRuntimeManifestEntry,
    workflowPresetSelection,
    promptContract,
    promptTemplate
  } = await loadRuntimeServiceBootstrap({
    env,
    environmentSource
  });
  let runtimePolicy = loadedRuntimePolicy;

  logger.info("Loaded runtime prompt contract and platform policy", {
    trackerKind: runtimePolicy.tracker.kind,
    promptPath: promptContract.promptPath,
    workspaceRoot: runtimePolicy.workspace.root,
    pollIntervalMs: runtimePolicy.polling.intervalMs,
    maxConcurrentAgents: runtimePolicy.agent.maxConcurrentAgents
  });

  if (selectedRuntimeManifestEntry) {
    runtimePolicy = applyRuntimeManifestPiPolicy(
      runtimePolicy,
      selectedRuntimeManifestEntry.runtimeManifest.manifest
    );
    logger.info(
      "Validated source-repo runtime manifest",
      selectedRuntimeManifestEntry.summary
    );
  }

  const database = initializeSymphonyDb({
    dbFile: env.dbFile
  });
  const repositoryKey = resolveRuntimeRepositoryKey({
    githubRepo: runtimePolicy.github.repo
  });
  if (primaryRepository && primaryRepository.repositoryKey !== repositoryKey) {
    throw new TypeError(
      `Primary admitted repository ${primaryRepository.repositoryKey} does not match runtime repository ${repositoryKey}.`
    );
  }
  const issueTimelineStore = createSymphonyIssueTimelineStore(database.db, {
    repositoryKey
  });
  const issueStore = createSymphonyIssueStore(database.db);
  const routeWorkflowStore = createRouteWorkflowStore(database.db);
  const runtimeLogStore = createSymphonyRuntimeLogStore(database.db, {
    repositoryKey
  });
  const runStore = createSqliteSymphonyRuntimeRunStore({
    db: database.db
  });
  const deliveryReports = createSymphonyIssueDeliveryReportStore({
    db: database.db,
    timelineStore: issueTimelineStore,
    repositoryKey
  });
  const agentAnalyticsStore = createSqliteAgentAnalyticsStore({
    db: database.db
  });
  const agentAnalyticsReadStore = createSqliteAgentAnalyticsReadStore({
    db: database.db
  });
  const runtimeForensicsReadStore = createSqliteRuntimeForensicsReadStore({
    db: database.db
  });
  const agentAnalyticsRead = createAgentAnalyticsReadPort(agentAnalyticsReadStore);
  const forensics = createSymphonyForensicsReadModel({
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

  const tracker = createRepositoryScopedLinearTracker({
    trackerTemplate: runtimePolicy.tracker,
    admittedRepositories,
    primaryRepositoryKey: repositoryKey
  });
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
        teamKey: runtimePolicy.tracker.teamKey
      }
    });
  }

  const dockerAuth = resolveDockerWorkspaceAuthContracts(hostCommandEnvSource, {
    preferredApiKeyEnvKey: harnessProviderEnvKey
  });
  const dockerGitHubCliAuth = dockerAuth.githubCli;
  const dockerPiAuth = dockerAuth.pi;
  const dockerLinearLaunchEnv: Record<string, string> =
    typeof env.linearApiKey === "string" && env.linearApiKey.trim() !== ""
      ? {
          LINEAR_API_KEY: env.linearApiKey
        }
      : {};

  if (dockerPiAuth.mount === null && Object.keys(dockerPiAuth.launchEnv).length === 0) {
    throw new HarnessSessionError(
      "pi_auth_unavailable",
      "Docker-backed Symphony workspaces require Pi auth. Provide ~/.pi/agent/auth.json for subscription auth, or set the configured provider API key env on the host."
    );
  }

  const routeWorkflows = createRouteWorkflowPort({
    routeWorkflowStore
  });
  const workflowSessionLoader = await createRuntimeWorkflowSessionLoader({
    routeWorkflows,
    trackerConfig: runtimePolicy.tracker,
    now: undefined
  });
  const routeLifecycle = await createRuntimeRouteLifecycleService({
    routeWorkflows,
    tracker,
    trackerConfig: runtimePolicy.tracker,
    repositoryKey,
    presetSelection: workflowPresetSelection,
    sessionLoader: workflowSessionLoader,
    now: undefined
  });
  const runtimeTracker = createWorkflowDispatchTracker({
    tracker
  });

  const workspaceBackendSelections =
    admittedRepositories.length > 0
      ? admittedRepositories.map((repository) => ({
          repositoryKey: repository.repositoryKey,
          selection: createRuntimeWorkspaceBackend(
            {
              ...env,
              sourceRepo: repository.repoRoot
            },
            {
              dockerHostFileMounts: dockerAuth.mounts,
              dockerContainerEnv: {
                ...dockerGitHubCliAuth.launchEnv,
                ...dockerLinearLaunchEnv
              },
              runtimeManifest: repository.runtimeManifest
            }
          )
        }))
      : [
          {
            repositoryKey,
            selection: createRuntimeWorkspaceBackend(env, {
              dockerHostFileMounts: dockerAuth.mounts,
              dockerContainerEnv: {
                ...dockerGitHubCliAuth.launchEnv,
                ...dockerLinearLaunchEnv
              },
              runtimeManifest: validatedRuntimeManifests[0]?.runtimeManifest ?? null
            })
          }
        ];
  const workspaceBackendSelection =
    primaryRepository
      ? workspaceBackendSelections.find(
          (entry) => entry.repositoryKey === primaryRepository.repositoryKey
        )?.selection ??
        (() => {
          throw new TypeError(
            `Workspace backend selection missing for repository ${JSON.stringify(
              primaryRepository.repositoryKey
            )}.`
          );
        })()
      : workspaceBackendSelections[0].selection;
  const workspaceBackendsByRepository = new Map(
    workspaceBackendSelections.map((entry) => [entry.repositoryKey, entry.selection.backend])
  );
  const workspaceBackendPayload = buildWorkspaceBackendPayload({
    workspaceRoot: runtimePolicy.workspace.root,
    metadata: workspaceBackendSelection.metadata,
    dockerGitHubCliAuth,
    dockerLinearLaunchEnv,
    dockerPiAuth
  });
  const harnessLaunchEnv = {
    ...dockerPiAuth.launchEnv,
    ...dockerLinearLaunchEnv
  };
  let dockerPreflight: SymphonyDockerWorkspacePreflightResult | null = null;
  if (enableDockerPreflight && workspaceBackendSelection.metadata.backendKind === "docker") {
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
  const workspaceBackend =
    workspaceBackendsByRepository.size > 1
      ? createRepositoryScopedWorkspaceBackend({
          admittedRepositories,
          backends: workspaceBackendsByRepository
        })
      : workspaceBackendSelection.backend;
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
  const machineLoad = createRuntimeMachineLoadMonitor({
    samplePath: runtimePolicy.workspace.root,
    intervalMs: Math.max(5_000, runtimePolicy.polling.intervalMs)
  });
  if (startMachineLoadMonitor) {
    machineLoad.start();
  }
  const observer = createDbBackedOrchestratorObserver({
    admittedRepositories,
    runStore,
    issueTimelineStore,
    runtimeLogs: runtimeLogStore,
    machineLoad
  });
  let runtimeRef: Pick<
    ReturnType<typeof createSymphonyRuntime>,
    "applyAgentUpdate" | "handleRunCompletion"
  > | null = null;
  const agentRuntime = createAgentRuntime(
    createSymphonyAgentRuntime({
      promptContract,
      admittedRepositories,
      apiPort: env.port,
      tracker,
      runStore,
      deliveryReports,
      loadLatestReworkHandoff: (issueIdentifier) =>
        routeLifecycle.loadLatestReworkHandoff({
          issueIdentifier
        }),
      loadLatestMergeResult: (issueIdentifier, runId) =>
        routeLifecycle.loadLatestMergeResult({
          issueIdentifier,
          runId
        }),
      loadCurrentWorkflowTrackerState: (issueIdentifier) =>
        routeLifecycle.loadCurrentTrackerState({
          issueIdentifier
        }),
      agentAnalytics: agentAnalyticsStore,
      runtimeLogs: runtimeLogStore,
      hostCommandEnvSource,
      harnessLaunchEnv,
      harnessAuthMode: dockerPiAuth.mount ? "auth_json" : "api_key_env",
      harnessProviderEnvKey: harnessProviderEnvKey,
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
    tracker: runtimeTracker,
    workspaceBackend,
    observer,
    agentRuntime,
    runnerEnv: environmentSource,
    workflowRoutingAdapter: routeLifecycle.workflowRoutingAdapter
  });
  runtimeRef = runtime;
  let orchestratorPortRef: SymphonyRuntimeAppServices["orchestrator"] | null = null;
  const seedTrackedIssueIdentity = async (issue: SymphonyTrackerIssue) => {
    await issueStore.upsert({
      issueIdentifier: issue.identifier,
      trackerIssueId: issue.id,
      repositoryKey,
      latestRunStartedAt: null,
      recordedAt: new Date().toISOString()
    });
  };
  const ensureTrackedIssueIdentity = async (issueIdentifier: string) => {
    const trackedIssue = await tracker.fetchIssueByIdentifier(
      runtimePolicy.tracker,
      issueIdentifier
    );
    if (!trackedIssue) {
      return false;
    }

    await seedTrackedIssueIdentity(trackedIssue);
    return true;
  };
  const dispatchObservedIssue = async (
    request: SymphonyTrackerStateDispatchRequest
  ) => {
    if (!orchestratorPortRef) {
      throw new TypeError("Runtime orchestrator port is not initialized.");
    }

    await seedTrackedIssueIdentity(request.issue);
    await orchestratorPortRef.dispatchRoutedIssue(request);
  };
  const routeTrackerStateIngress = createRuntimeTrackerStateIngressPort({
    routeLifecycle,
    runtimeLogStore,
    async ensureIssueBinding({ issueIdentifier }) {
      return await ensureTrackedIssueIdentity(issueIdentifier);
    }
  });
  const orchestratorPort = createRuntimeOrchestratorPort({
    runtime,
    logger,
    runtimeLogs: runtimeLogStore,
    realtime,
    async beforePollCycle(snapshot) {
      await routeTrackerStateIngress.observeNonRunning({
        claimedIssueIds: snapshot.claimedIssueIds,
        recordedAt: new Date().toISOString(),
        onDispatchRequested: dispatchObservedIssue
      });
    }
  });
  orchestratorPortRef = orchestratorPort;

  let pollScheduler: SymphonyRuntimePollScheduler | null = null;
  let shutdownPromise: Promise<void> | null = null;
  const issueTimeline = createIssueTimelinePort({
    issueTimelineStore,
    issueStore
  });
  const runtimeLogs = createRuntimeLogsPort({
    runtimeLogStore
  });
  const health = createRuntimeHealthPort({
    dbFile: database.dbFile,
    runtimePolicy,
    readPollSchedulerSnapshot: () => pollScheduler?.snapshot() ?? null,
    readMachineLoadSnapshot: () => machineLoad.snapshot()
  });
  const trackerStateIngress = {
    async observeNonRunningIssue(input: { issueIdentifier: string }) {
      const trackedIssue = await tracker.fetchIssueByIdentifier(
        runtimePolicy.tracker,
        input.issueIdentifier
      );
      if (!trackedIssue) {
        return null;
      }

      await seedTrackedIssueIdentity(trackedIssue);
      const recordedAt = new Date().toISOString();
      const observation =
        await routeTrackerStateIngress.observeNonRunningByIdentifier({
          issueIdentifier: trackedIssue.identifier,
          recordedAt,
          onDispatchRequested: dispatchObservedIssue
        });
      if (!observation) {
        throw new TypeError(
          `Tracker state ingress lost ${trackedIssue.identifier} after seeding the canonical issue identity.`
        );
      }

      return {
        issueIdentifier: observation.issueIdentifier,
        trackerState: observation.trackerState,
        observed: observation.observed,
        recordedAt
      };
    }
  } satisfies SymphonyRuntimeAppServices["trackerStateIngress"];
  const workflowRead = {
    async loadCurrentWorkflowTrackerState(input: { issueIdentifier: string }) {
      return await routeLifecycle.loadCurrentTrackerState({
        issueIdentifier: input.issueIdentifier
      });
    }
  } satisfies SymphonyRuntimeAppServices["workflowRead"];
  const runtimeTools = createRuntimeToolsPort({
    tracker,
    deliveryReports,
    routeLifecycle,
    blockedTargetState: runtimePolicy.tracker.blockedTransitionToState,
    pauseTargetState: runtimePolicy.tracker.pauseTransitionToState,
    canceledTargetState: "Canceled",
    onDispatchRequested: dispatchObservedIssue
  });
  const workflowComparison = {
    async compareByWorkflowId(input: {
      workflowId: string;
      presetIds?: ReadonlyArray<string>;
    }) {
      return await compareRuntimeWorkflowByWorkflowId({
        workflowId: input.workflowId,
        routeWorkflows,
        trackerConfig: runtimePolicy.tracker,
        presetIds: input.presetIds
      });
    },
    async compareByIssueIdentifier(input: {
      issueIdentifier: string;
      presetIds?: ReadonlyArray<string>;
    }) {
      return await compareRuntimeWorkflowByIssueIdentifier({
        issueIdentifier: input.issueIdentifier,
        routeWorkflows,
        trackerConfig: runtimePolicy.tracker,
        presetIds: input.presetIds
      });
    }
  } satisfies SymphonyRuntimeAppServices["workflowComparison"];

  const githubReviewIngress = createSymphonyGitHubReviewIngressService({
    githubPolicy: runtimePolicy.github,
    admittedRepositories: admittedRepositories.map((entry) => entry.repositoryKey),
    resolveWebhookSecret: createRepositoryWebhookSecretResolver(
      environmentSource,
      runtimePolicy.github.webhookSecret
    ),
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
      const requeuedHandoff =
        result.status === "requeued" &&
        "handoff" in result &&
        result.handoff &&
        typeof result.handoff === "object"
          ? result.handoff
          : null;
      const seededTrackedIssue =
        issueIdentifier
          ? await tracker.fetchIssueByIdentifier(runtimePolicy.tracker, issueIdentifier)
          : null;

      if (seededTrackedIssue) {
        await seedTrackedIssueIdentity(seededTrackedIssue);
      }

      if (result.status !== "ignored" && issueIdentifier) {
        if (result.status === "requeued") {
          const routed = await routeLifecycle.routeReviewReworkRequest({
            issueIdentifier,
            recordedAt: requeuedHandoff?.recordedAt ?? new Date().toISOString(),
            handoff: result.handoff,
            onDispatchRequested: dispatchObservedIssue
          });
          if (!routed) {
            throw new TypeError(
              `GitHub review ingress requeued ${issueIdentifier} but no workflow-backed review rework route could be applied.`
            );
          }
        }
      }

      const trackedIssue =
        issueIdentifier
          ? await tracker.fetchIssueByIdentifier(runtimePolicy.tracker, issueIdentifier)
          : null;

      await runtimeLogStore.record({
        level: "info",
        source: "github_review_ingress",
        eventType: "github_review_ingress_processed",
        message: "Processed GitHub review ingress event.",
        issueIdentifier: trackedIssue?.identifier ?? null,
        payload: result
      });
      realtime.publishSnapshotUpdated();
      realtime.publishProblemRunsUpdated();

      if (result.status !== "ignored" && issueIdentifier) {
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
  if (startPollScheduler) {
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
  }

  return {
    logger,
    admittedRepositories,
    promptTemplate,
    promptContract,
    runtimePolicy,
    tracker,
    orchestrator: orchestratorPort,
    agentAnalytics: agentAnalyticsRead,
    forensics,
    issueTimeline,
    runtimeLogs,
    health,
    trackerStateIngress,
    workflowRead,
    runtimeTools,
    workflowComparison,
    routeWorkflows,
    githubReviewIngress,
    realtime,
    async shutdown() {
      if (shutdownPromise) {
        return await shutdownPromise;
      }

      shutdownPromise = (async () => {
        pollScheduler?.stop();
        const shutdownReason =
          "Symphony runtime shut down while the run was active.";

        try {
          await waitForPollSchedulerDrain(pollScheduler);
          const runtimeWithShutdown = runtime as typeof runtime & {
            shutdownActiveRuns(reason: string): Promise<number>;
          };
          const drainedInMemoryRuns = await runtimeWithShutdown.shutdownActiveRuns(
            shutdownReason
          );
          const reconciledPersistedRuns =
            await reconcilePersistedActiveRunsOnShutdown({
              database,
              tracker,
              runtimePolicy,
              runStore,
              routeLifecycle,
              shutdownReason
            });

          logger.info("Shutdown reconciled active runtime work", {
            drainedInMemoryRuns,
            reconciledPersistedRuns
          });
        } finally {
          machineLoad.stop();
          database.close();
        }
      })();

      return await shutdownPromise;
    }
  };
}

export function applyRuntimeManifestPiPolicy(
  runtimePolicy: SymphonyResolvedRuntimePolicy,
  runtimeManifest: SymphonyNormalizedRuntimeManifest
): SymphonyResolvedRuntimePolicy {
  if (!runtimeManifest.pi) {
    return runtimePolicy;
  }

  const mergedPresets = {
    ...runtimePolicy.pi.presets,
    ...Object.fromEntries(
      Object.entries(runtimeManifest.pi.presets).map(([presetName, preset]) => [
        presetName,
        {
          model: preset.model,
          reasoningEffort: preset.reasoningEffort ?? null,
          authMode: preset.auth ?? "provider"
        }
      ])
    )
  };
  const defaultPreset = runtimeManifest.pi.defaultPreset;
  const defaultPresetConfig = mergedPresets[defaultPreset] ?? null;
  const defaultModel = defaultPresetConfig?.model ?? runtimePolicy.pi.defaultModel;
  const defaultReasoningEffort =
    defaultPresetConfig?.reasoningEffort ?? runtimePolicy.pi.defaultReasoningEffort;

  return {
    ...runtimePolicy,
    pi: {
      ...runtimePolicy.pi,
      defaultPreset,
      presets: mergedPresets,
      defaultModel,
      defaultReasoningEffort
    },
    agentRuntime: {
      ...runtimePolicy.agentRuntime,
      defaultPreset,
      presets: mergedPresets,
      defaultModel,
      defaultReasoningEffort
    }
  };
}

export function buildWorkspaceBackendPayload(input: {
  workspaceRoot: string;
  metadata: Record<string, unknown>;
  dockerGitHubCliAuth: DockerGitHubCliAuthContract;
  dockerLinearLaunchEnv: Record<string, string>;
  dockerPiAuth: DockerPiAuthContract;
}): Record<string, unknown> {
  const {
    workspaceRoot,
    metadata,
    dockerGitHubCliAuth,
    dockerLinearLaunchEnv,
    dockerPiAuth
  } = input;

  return {
    workspaceRoot,
    ...metadata,
    dockerGitHubCliAuthMode:
      dockerGitHubCliAuth.authEnvKey !== null
        ? "env"
        : dockerGitHubCliAuth.mount !== null
          ? "mount"
          : "none",
    dockerGitHubCliAuthEnvKey: dockerGitHubCliAuth.authEnvKey,
    dockerLinearApiKeyInjected:
      Object.prototype.hasOwnProperty.call(dockerLinearLaunchEnv, "LINEAR_API_KEY"),
    dockerPiAuthMounted: dockerPiAuth.mount !== null,
    dockerPiProviderEnvKey: dockerPiAuth.providerEnvKey,
    dockerPiProviderEnvMounted:
      dockerPiAuth.providerEnvKey !== null &&
      Object.prototype.hasOwnProperty.call(dockerPiAuth.launchEnv, dockerPiAuth.providerEnvKey)
  };
}

function createRepositoryWebhookSecretResolver(
  environmentSource: Record<string, string | undefined>,
  fallbackSecret: string | null
): (repository: string) => string | null {
  const configuredSecrets =
    typeof environmentSource.SYMPHONY_GITHUB_WEBHOOK_SECRETS === "string"
      ? parseRepositorySecretMap(environmentSource.SYMPHONY_GITHUB_WEBHOOK_SECRETS)
      : new Map<string, string>();

  return (repository) => configuredSecrets.get(repository) ?? fallbackSecret;
}

function parseRepositorySecretMap(value: string): Map<string, string> {
  const secrets = new Map<string, string>();

  for (const entry of value.split(",")) {
    const normalized = entry.trim();
    if (normalized.length === 0) {
      continue;
    }

    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex <= 0 || separatorIndex >= normalized.length - 1) {
      continue;
    }

    const repositoryKey = normalized.slice(0, separatorIndex).trim();
    const secret = normalized.slice(separatorIndex + 1).trim();

    if (repositoryKey.length > 0 && secret.length > 0) {
      secrets.set(repositoryKey, secret);
    }
  }

  return secrets;
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
