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
  createLinearSymphonyTracker,
  createMemorySymphonyTracker
} from "@symphony/tracker";
import {
  createSqliteAgentAnalyticsReadStore,
  createSqliteAgentAnalyticsStore,
  createSymphonyIssueDeliveryReportStore,
  createSqliteSymphonyRuntimeRunStore,
  createSymphonyGitHubIngressJournal,
  createSymphonyIssueTimelineStore,
  createSymphonyRuntimeLogStore,
  initializeSymphonyDb
} from "@symphony/db";
import type { SymphonyNormalizedRuntimeManifest } from "@symphony/runtime-contract";
import { createSymphonyLogger } from "@symphony/logger";
import {
  HarnessSessionError,
  resolveHarnessProviderEnvKey
} from "@symphony/agent-harnesses";
import {
  SymphonyRuntimePolicyError,
  type SymphonyResolvedRuntimePolicy
} from "@symphony/runtime-policy";
import type { SymphonyTracker } from "@symphony/tracker";
import {
  resolveDockerWorkspaceAuthContracts
} from "./runtime-auth-contract.js";
import type { SymphonyRuntimeAppEnv } from "./env.js";
import { createSymphonyGitHubReviewIngressService } from "./github-review-ingress.js";
import { createSymphonyAgentRuntime } from "./agent-harness-runtime.js";
import { createDbBackedOrchestratorObserver } from "./runtime-db-observer.js";
import { createSymphonyRealtimeHub } from "../realtime/symphony-realtime-hub.js";
import { SymphonyRuntimePollScheduler } from "./poll-scheduler.js";
import { validateSourceRepoRuntimeManifest } from "./runtime-manifest-startup-validator.js";
import { loadSymphonyRuntimePolicyConfig } from "./runtime-policy-config.js";
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
import { loadAdmittedRuntimeRepositories } from "./runtime-admitted-repositories.js";
import { createRepositoryScopedWorkspaceBackend } from "./runtime-workspace-backend-selector.js";
import { resolveRepositoryForLinearScope } from "./runtime-repository-routing.js";

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
    sourceRepos: env.sourceRepos,
    dbFile: env.dbFile,
    logLevel: env.logLevel
  });

  let runtimePolicy = loadSymphonyRuntimePolicyConfig({
    environmentSource,
    cwd: process.cwd()
  });
  if (runtimePolicy.agent.harness !== "pi") {
    throw new SymphonyRuntimePolicyError(
      "invalid_workflow_config",
      `Runtime execution rejects legacy harness '${runtimePolicy.agent.harness}' for launch/execute. Use agent.harness: "pi".`
    );
  }
  const harnessProviderEnvKey = resolveHarnessProviderEnvKey(runtimePolicy);
  const admittedRepositories =
    env.sourceRepos.length > 0
      ? await loadAdmittedRuntimeRepositories(env.sourceRepos)
      : [];
  const validatedRuntimeManifests =
    env.sourceRepos.length > 0
      ? await Promise.all(
          env.sourceRepos.map((sourceRepo) =>
            validateSourceRepoRuntimeManifest(sourceRepo, environmentSource)
          )
        )
      : [];
  const primaryRepository =
    admittedRepositories.length > 0
      ? resolveRepositoryForLinearScope(admittedRepositories, runtimePolicy.tracker)
      : null;
  const selectedRuntimeManifestEntry = primaryRepository
    ? validatedRuntimeManifests.find(
        (candidate) =>
          candidate.runtimeManifest.repoRoot === primaryRepository.repoRoot
      ) ?? null
    : null;
  const promptContract =
    primaryRepository?.promptContract ??
    (await loadAdmittedRuntimeRepositories([process.cwd()]))[0].promptContract;
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
  const repositoryKey = primaryRepository?.repositoryKey ?? resolveRuntimeRepositoryKey({
    sourceRepo: env.sourceRepo,
    githubRepo: runtimePolicy.github.repo
  });
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
  const agentAnalyticsRead = createAgentAnalyticsReadPort(agentAnalyticsReadStore);
  const forensics = createSymphonyForensicsReadModel({
    runStore: agentAnalyticsReadStore,
    async listIssueTimeline(input) {
      return issueTimelineStore.listIssueTimeline(input.issueIdentifier, {
        repositoryKey: input.repositoryKey,
        limit: input.limit
      });
    },
    async listRuntimeLogs(input) {
      return runtimeLogStore.list({
        limit: input.limit,
        repositoryKey: input.repositoryKey,
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
  const workspaceBackendPayload = {
    workspaceRoot: runtimePolicy.workspace.root,
    ...workspaceBackendSelection.metadata,
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
  const harnessLaunchEnv = {
    ...dockerPiAuth.launchEnv,
    ...dockerLinearLaunchEnv
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
  machineLoad.start();
  const observer = createDbBackedOrchestratorObserver({
    admittedRepositories,
    defaultRepositoryKey: repositoryKey,
    runStore,
    issueTimelineStore,
    agentAnalytics: agentAnalyticsStore,
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
      tracker,
      runStore,
      deliveryReports,
      issueTimelineStore,
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
  let shutdownPromise: Promise<void> | null = null;
  const issueTimeline = createIssueTimelinePort({
    issueTimelineStore
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

      if (result.status === "requeued") {
        await orchestratorPort.requestRefresh();
      }

      if (result.status !== "ignored" && issueIdentifier) {
        const trackedIssue = await tracker.fetchIssueByIdentifier(
          runtimePolicy.tracker,
          issueIdentifier
        );
        const requeuedHandoff =
          result.status === "requeued" &&
          "handoff" in result &&
          result.handoff &&
          typeof result.handoff === "object"
            ? result.handoff
            : null;

        if (trackedIssue) {
          if (requeuedHandoff) {
            await issueTimelineStore.record({
              issueId: trackedIssue.id,
              issueIdentifier: trackedIssue.identifier,
              source: "tracker",
              eventType: "github_review_rework_handoff",
              message: "Stored GitHub review rework handoff for the next run.",
              payload: normalizeRuntimeJsonValue(requeuedHandoff)
            });
          }

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
              issueTimelineStore,
              runtimeLogStore,
              agentAnalyticsStore,
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

function applyRuntimeManifestPiPolicy(
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

async function reconcilePersistedActiveRunsOnShutdown(input: {
  database: ReturnType<typeof initializeSymphonyDb>;
  tracker: SymphonyTracker;
  runtimePolicy: SymphonyResolvedRuntimePolicy;
  runStore: ReturnType<typeof createSqliteSymphonyRuntimeRunStore>;
  issueTimelineStore: ReturnType<typeof createSymphonyIssueTimelineStore>;
  runtimeLogStore: ReturnType<typeof createSymphonyRuntimeLogStore>;
  agentAnalyticsStore: ReturnType<typeof createSqliteAgentAnalyticsStore>;
  shutdownReason: string;
}): Promise<number> {
  const endedAt = new Date().toISOString();
  const activeRuns = input.database.client.prepare(`
    select run_id as runId, issue_id as issueId, issue_identifier as issueIdentifier, status
    from symphony_runs
    where status in ('dispatching', 'running')
  `).all() as Array<{
    runId: string;
    issueId: string;
    issueIdentifier: string;
    status: "dispatching" | "running";
  }>;

  if (activeRuns.length === 0) {
    return 0;
  }

  const issueIds = [...new Set(activeRuns.map((run) => run.issueId))];
  const trackedIssues = await input.tracker.fetchIssueStatesByIds(
    input.runtimePolicy.tracker,
    issueIds
  );
  const trackedIssuesById = new Map(
    trackedIssues.map((issue) => [issue.id, issue] as const)
  );

  for (const run of activeRuns) {
    const trackedIssue = trackedIssuesById.get(run.issueId) ?? null;

    await reconcileTrackerIssueOnShutdown({
      tracker: input.tracker,
      runtimePolicy: input.runtimePolicy,
      trackedIssue,
      issueTimelineStore: input.issueTimelineStore,
      runId: run.runId,
      endedAt,
      shutdownReason: input.shutdownReason
    });

    const runningTurns = input.database.client.prepare(`
      select turn_id as turnId
      from symphony_turns
      where run_id = ? and status = 'running'
    `).all(run.runId) as Array<{ turnId: string }>;

    for (const turn of runningTurns) {
      await input.runStore.finalizeTurn(turn.turnId, {
        status: "stopped",
        endedAt,
        metadata: {
          stopReason: "runtime_shutdown"
        }
      });
    }

    const runningAgentTurns = input.database.client.prepare(`
      select turn_id as turnId, thread_id as threadId, harness_kind as harnessKind, model, provider_id as providerId, provider_name as providerName,
             input_tokens as inputTokens, cached_input_tokens as cachedInputTokens, output_tokens as outputTokens
      from symphony_agent_turns
      where run_id = ? and status = 'running'
    `).all(run.runId) as Array<{
      turnId: string;
      threadId: string | null;
      harnessKind: "pi" | null;
      model: string | null;
      providerId: string | null;
      providerName: string | null;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
    }>;

    for (const turn of runningAgentTurns) {
      await input.agentAnalyticsStore.finalizeTurn({
        runId: run.runId,
        turnId: turn.turnId,
        threadId: turn.threadId,
        harnessKind: turn.harnessKind ?? "pi",
        model: turn.model,
        providerId: turn.providerId,
        providerName: turn.providerName,
        endedAt,
        status: "stopped",
        failureKind: "runtime_shutdown",
        failureMessagePreview: previewShutdownReason(input.shutdownReason),
        usage: {
          input_tokens: turn.inputTokens,
          cached_input_tokens: turn.cachedInputTokens,
          output_tokens: turn.outputTokens
        }
      });
    }

    const agentRun = input.database.client.prepare(`
      select thread_id as threadId
      from symphony_agent_runs
      where run_id = ?
    `).get(run.runId) as { threadId: string | null } | undefined;

    await input.runStore.finalizeRun(run.runId, {
      status: "paused",
      outcome: "runtime_shutdown",
      endedAt,
      errorClass: "runtime_shutdown",
      errorMessage: input.shutdownReason,
      metadata: {
        shutdown: {
          previousStatus: run.status,
          reason: "runtime_shutdown"
        }
      }
    });

    await input.agentAnalyticsStore.finalizeRun({
      runId: run.runId,
      status: "paused",
      endedAt,
      failureKind: "runtime_shutdown",
      failureOrigin: "runtime",
      failureMessagePreview: previewShutdownReason(input.shutdownReason),
      threadId: agentRun?.threadId ?? null
    });

    await input.issueTimelineStore.record({
      issueId: run.issueId,
      issueIdentifier: run.issueIdentifier,
      runId: run.runId,
      source: "runtime",
      eventType: "runtime_shutdown_reconciled",
      message: "Runtime shutdown reconciled an active run into a paused state.",
      payload: {
        previousStatus: run.status,
        shutdownReason: input.shutdownReason
      },
      recordedAt: endedAt
    });

    await input.runtimeLogStore.record({
      level: "warn",
      source: "runtime",
      eventType: "runtime_shutdown_reconciled_run",
      message: "Reconciled an active persisted run during shutdown.",
      issueId: run.issueId,
      issueIdentifier: run.issueIdentifier,
      runId: run.runId,
      payload: {
        previousStatus: run.status
      },
      recordedAt: endedAt
    });
  }

  return activeRuns.length;
}

async function reconcileTrackerIssueOnShutdown(input: {
  tracker: SymphonyTracker;
  runtimePolicy: SymphonyResolvedRuntimePolicy;
  trackedIssue: Awaited<ReturnType<SymphonyTracker["fetchIssueStatesByIds"]>>[number] | null;
  issueTimelineStore: ReturnType<typeof createSymphonyIssueTimelineStore>;
  runId: string;
  endedAt: string;
  shutdownReason: string;
}): Promise<void> {
  if (!input.trackedIssue) {
    return;
  }

  const pauseState = input.runtimePolicy.tracker.pauseTransitionToState;

  if (
    !pauseState ||
    input.trackedIssue.state.trim().toLowerCase() === pauseState.trim().toLowerCase()
  ) {
    return;
  }

  try {
    await input.tracker.updateIssueState(input.trackedIssue.id, pauseState);
    await input.issueTimelineStore.record({
      issueId: input.trackedIssue.id,
      issueIdentifier: input.trackedIssue.identifier,
      runId: input.runId,
      source: "tracker",
      eventType: "shutdown_pause_transition",
      message: "Issue moved to the paused state during runtime shutdown.",
      payload: {
        fromState: input.trackedIssue.state,
        toState: pauseState,
        shutdownReason: input.shutdownReason
      },
      recordedAt: input.endedAt
    });
  } catch {
    // Best-effort containment. The run is still reconciled locally even if tracker state fails.
  }
}

function previewShutdownReason(reason: string): string {
  return reason.length <= 280 ? reason : `${reason.slice(0, 279)}…`;
}

async function waitForPollSchedulerDrain(
  pollScheduler: SymphonyRuntimePollScheduler | null
): Promise<void> {
  if (!pollScheduler) {
    return;
  }

  const startedAt = Date.now();

  while (pollScheduler.snapshot().inFlight) {
    if (Date.now() - startedAt > 2_000) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
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
