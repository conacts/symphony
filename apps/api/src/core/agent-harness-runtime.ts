import { execFileSync } from "node:child_process";
import path from "node:path";
import type {
  AgentRuntime,
  SymphonyAgentRuntimeCompletion,
  SymphonyAgentRuntimeConfig,
  SymphonyAgentRuntimeUpdate,
  SymphonyStartupFailureOrigin,
  SymphonyStartupFailureStage
} from "@symphony/orchestrator";
import {
  formatSymphonyReworkHandoffSection,
  renderSymphonyPromptContract,
  type SymphonyLoadedPromptContract,
  type SymphonyReworkHandoff,
  type SymphonyRunMode
} from "@symphony/runtime-contract";
import type { JsonObject, JsonValue } from "@symphony/contracts";
import {
  extractUsage,
  isThreadEvent
} from "@symphony/contracts";
import type {
  SymphonyTracker,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import type {
  AgentAnalyticsStore,
  SymphonyIssueDeliveryReportStore,
  SymphonyIssueTimelineStore,
  SymphonyRuntimeLogStore,
  SymphonyRuntimeRunStore
} from "@symphony/db";
import type { SymphonyLogger } from "@symphony/logger";
import {
  decodePiRuntimeEvent,
  extractPiRuntimeUsage,
  HarnessSessionError,
  resolveHarnessModelRuntimePolicy,
  type HarnessToolExecutor,
  type HarnessSessionClient
} from "@symphony/agent-harnesses";
import { resolveRuntimeRepositoryKey } from "./runtime-repository-key.js";
import { resolveIssueRepository } from "./runtime-repository-routing.js";
import type { AdmittedRuntimeRepository } from "./runtime-admitted-repositories.js";
import { captureRepoSnapshot } from "./agent-repo-snapshot.js";
import {
  resolveRuntimeLaunchTarget,
  type SymphonyRuntimeLaunchTarget
} from "./agent-runtime-launch-target.js";
import {
  buildSymphonyContinuationPrompt
} from "./symphony-prompt.js";
import {
  createPiRuntimeHarness,
  type SymphonyRuntimeHarness
} from "./runtime-harness.js";
import {
  deliveryTransitionState,
  runtimeMergeResultEventType,
  type RuntimeDeliveryReportResult,
  type RuntimeMergeResult
} from "@symphony/runtime-tools";
import { CommandResourceMonitor } from "./command-resource-monitor.js";

type RunCallbacks = {
  onUpdate(issueId: string, update: SymphonyAgentRuntimeUpdate): void | Promise<void>;
  onComplete(
    issueId: string,
    completion: SymphonyAgentRuntimeCompletion
  ): void | Promise<void>;
};

type ActiveRun = {
  stopped: boolean;
  client: HarnessSessionClient | null;
};

export function createSymphonyAgentRuntime(input: {
  promptContract: SymphonyLoadedPromptContract;
  admittedRepositories?: AdmittedRuntimeRepository[];
  runtimeWorkingDirectory?: string;
  apiPort?: number;
  githubRepository?: string | null;
  tracker: SymphonyTracker;
  runStore: SymphonyRuntimeRunStore;
  deliveryReports: SymphonyIssueDeliveryReportStore;
  issueTimelineStore?: SymphonyIssueTimelineStore;
  loadLatestReworkHandoff?(
    issueIdentifier: string
  ): Promise<SymphonyReworkHandoff | null>;
  agentAnalytics: AgentAnalyticsStore;
  runtimeLogs: SymphonyRuntimeLogStore;
  hostCommandEnvSource: Record<string, string | undefined>;
  harnessLaunchEnv?: Record<string, string>;
  harnessAuthMode?: string | null;
  harnessProviderEnvKey?: string | null;
  logger: SymphonyLogger;
  callbacks: RunCallbacks;
}): AgentRuntime {
  return createHarnessBackedSymphonyAgentRuntime({
    ...input,
    harness: createPiRuntimeHarness()
  });
}

function createHarnessBackedSymphonyAgentRuntime(input: {
  harness: SymphonyRuntimeHarness;
  promptContract: SymphonyLoadedPromptContract;
  admittedRepositories?: AdmittedRuntimeRepository[];
  runtimeWorkingDirectory?: string;
  apiPort?: number;
  githubRepository?: string | null;
  tracker: SymphonyTracker;
  runStore: SymphonyRuntimeRunStore;
  deliveryReports: SymphonyIssueDeliveryReportStore;
  issueTimelineStore?: SymphonyIssueTimelineStore;
  loadLatestReworkHandoff?(
    issueIdentifier: string
  ): Promise<SymphonyReworkHandoff | null>;
  agentAnalytics: AgentAnalyticsStore;
  runtimeLogs: SymphonyRuntimeLogStore;
  hostCommandEnvSource: Record<string, string | undefined>;
  harnessLaunchEnv?: Record<string, string>;
  harnessAuthMode?: string | null;
  harnessProviderEnvKey?: string | null;
  logger: SymphonyLogger;
  callbacks: RunCallbacks;
}): AgentRuntime {
  const activeRuns = new Map<string, ActiveRun>();

  return {
    async startRun(runInput) {
      const selectedRepository =
        input.admittedRepositories && input.admittedRepositories.length > 0
          ? resolveIssueRepository(input.admittedRepositories, runInput.issue)
          : null;
      const repositoryKey = resolveRuntimeRepositoryKey({
        githubRepo: selectedRepository?.repositoryKey ?? input.githubRepository ?? null
      });
      const activeRun: ActiveRun = {
        stopped: false,
        client: null
      };
      activeRuns.set(runInput.issue.id, activeRun);
      const launchTarget = resolveRuntimeLaunchTarget(
        runInput.workspace,
        runInput.runtimePolicy.workspace.root,
        selectedRepository?.runtimeManifest.manifest.workspace.workingDirectory ??
          input.runtimeWorkingDirectory ??
          "."
      );

      void executeRun({
        promptTemplate:
          selectedRepository?.promptContract.template ?? input.promptContract.template,
        harness: input.harness,
        promptContract: selectedRepository?.promptContract ?? input.promptContract,
        apiPort: input.apiPort,
        githubRepository: repositoryKey,
        tracker: input.tracker,
        runStore: input.runStore,
        deliveryReports: input.deliveryReports,
        issueTimelineStore: input.issueTimelineStore,
        loadLatestReworkHandoff: input.loadLatestReworkHandoff,
        agentAnalytics: input.agentAnalytics,
        runtimeLogs: input.runtimeLogs,
        runtimePolicy: runInput.runtimePolicy,
        logger: input.logger.child({
          component: "agent_runtime",
          issueId: runInput.issue.id,
          issueIdentifier: runInput.issue.identifier
        }),
        hostCommandEnvSource: input.hostCommandEnvSource,
        harnessLaunchEnv: input.harnessLaunchEnv ?? {},
        harnessAuthMode: input.harnessAuthMode ?? null,
        harnessProviderEnvKey: input.harnessProviderEnvKey ?? null,
        callbacks: input.callbacks,
        issue: runInput.issue,
        runId: runInput.runId,
        attempt: runInput.attempt,
        runMode: runInput.runMode,
        workspace: runInput.workspace,
        launchTarget,
        activeRun,
      }).finally(() => {
        activeRuns.delete(runInput.issue.id);
      });

      return {
        threadId: null,
        workerHost: runInput.workspace.workerHost ?? null,
        launchTarget
      };
    },

    async stopRun(stopInput) {
      const activeRun = activeRuns.get(stopInput.issue.id);
      if (!activeRun) {
        return;
      }

      activeRun.stopped = true;
      activeRun.client?.close();
    }
  };
}

async function executeRun(input: {
  promptTemplate: string;
  harness: SymphonyRuntimeHarness;
  promptContract: SymphonyLoadedPromptContract;
  apiPort?: number;
  githubRepository: string | null;
  tracker: SymphonyTracker;
  runStore: SymphonyRuntimeRunStore;
  deliveryReports: SymphonyIssueDeliveryReportStore;
  issueTimelineStore?: SymphonyIssueTimelineStore;
  loadLatestReworkHandoff?(
    issueIdentifier: string
  ): Promise<SymphonyReworkHandoff | null>;
  agentAnalytics: AgentAnalyticsStore;
  runtimeLogs: SymphonyRuntimeLogStore;
  runtimePolicy: SymphonyAgentRuntimeConfig;
  logger: SymphonyLogger;
  hostCommandEnvSource: Record<string, string | undefined>;
  harnessLaunchEnv: Record<string, string>;
  harnessAuthMode: string | null;
  harnessProviderEnvKey: string | null;
  callbacks: RunCallbacks;
  issue: SymphonyTrackerIssue;
  runId: string | null;
  attempt: number;
  runMode: SymphonyRunMode;
  workspace: Parameters<AgentRuntime["startRun"]>[0]["workspace"];
  launchTarget: SymphonyRuntimeLaunchTarget;
  activeRun: ActiveRun;
}): Promise<void> {
  const harnessModelPolicy = resolveHarnessModelRuntimePolicy(
    input.runtimePolicy,
    input.harness.kind
  );
  let persistedTurnId: string | null = null;
  let maxTurnsReached = false;
  let sessionProviderId: string | null = null;
  let sessionProviderName: string | null = null;
  let deliveryReport: RuntimeDeliveryReportResult | null = null;
  let mergeResult: RuntimeMergeResult | null = null;
  let commandResourceMonitor: CommandResourceMonitor | null = null;
  let recordedCanonicalSessionStart = false;
  const explicitCompletionRequirement = resolveExplicitCompletionRequirement(
    input.runMode
  );
  const latestReworkHandoff =
    input.runMode === "rework" && input.loadLatestReworkHandoff
      ? await input.loadLatestReworkHandoff(input.issue.identifier)
      : null;
  const repositoryKey = resolveRuntimeRepositoryKey({
    githubRepo: input.githubRepository
  });

  try {
    await input.runtimeLogs.record({
      level: "info",
      source: "agent_runtime",
      eventType: "runtime_launch_target_resolved",
      message: "Resolved the agent runtime launch target.",
      issueIdentifier: input.issue.identifier,
      runId: input.runId,
      payload: {
        harness: input.harness.kind,
        launchTarget: describeLaunchTarget(input.launchTarget)
      }
    });

    if (input.runId) {
      const repoStart = await captureRepoSnapshot(
        input.launchTarget,
        input.runtimePolicy.hooks.timeoutMs
      );
      await input.runStore.updateRun(input.runId, {
        commitHashStart: repoStart.commitHash,
        repoStart: repoStart.snapshot
      });
    }

    const session = await input.harness.startSession({
      launchTarget: input.launchTarget,
      env: {
        NO_COLOR: "1",
        FORCE_COLOR: "0",
        CLICOLOR: "0",
        CLICOLOR_FORCE: "0",
        ...input.workspace.envBundle.values,
        ...input.harnessLaunchEnv,
        SYMPHONY_API_BASE_URL:
          input.apiPort !== undefined
            ? buildRuntimeApiBaseUrl(input.launchTarget, input.apiPort)
            : "",
        SYMPHONY_REPOSITORY_KEY: repositoryKey,
        SYMPHONY_ISSUE_IDENTIFIER: input.issue.identifier,
        SYMPHONY_TRACKER_ISSUE_ID: input.issue.id,
        SYMPHONY_ISSUE_STATE: input.issue.state ?? "",
        ...(input.runId ? { SYMPHONY_RUN_ID: input.runId } : {}),
      },
      hostCommandEnvSource: input.hostCommandEnvSource,
      runtimePolicy: input.runtimePolicy,
      issue: input.issue,
      logger: input.logger
    });
    input.activeRun.client = session.client;
    sessionProviderId = session.providerId;
    sessionProviderName = session.providerName;
    commandResourceMonitor = new CommandResourceMonitor(session.processId);
    const runtimeContextBase = {
      harnessKind: input.harness.kind,
      processId: session.processId,
      model: session.model,
      reasoningEffort: session.reasoningEffort,
      profile: session.profile,
      providerId: session.providerId,
      providerName: session.providerName,
      authMode: input.harnessAuthMode,
      providerEnvKey: input.harnessProviderEnvKey,
      launchTarget: describeLaunchTarget(session.launchTarget)
    };

    await input.runtimeLogs.record({
      level: "info",
      source: "agent_runtime",
      eventType: "runtime_session_started",
      message: "Started the agent harness session.",
      issueIdentifier: input.issue.identifier,
      runId: input.runId,
      payload: {
        threadId: session.threadId,
        processId: session.processId,
        model: session.model,
        reasoningEffort: session.reasoningEffort,
        profile: session.profile,
        providerId: session.providerId,
        providerName: session.providerName,
        authMode: runtimeContextBase.authMode,
        providerEnvKey: runtimeContextBase.providerEnvKey,
        harness: input.harness.kind,
        launchTarget: runtimeContextBase.launchTarget
      }
    });

    if (input.runId) {
      await input.runStore.upsertRunContext(input.runId, {
        ...runtimeContextBase,
        threadId: session.threadId
      });
    }

    let currentIssue = input.issue;
    const promptRepoName = resolvePromptRepoName(
      input.githubRepository,
      input.promptContract.repoRoot
    );
    const promptRepoDefaultBranch = resolvePromptRepoDefaultBranch(
      input.promptContract.repoRoot
    );

    for (
      let turnNumber = 1;
      turnNumber <= input.runtimePolicy.agent.maxTurns;
      turnNumber += 1
    ) {
      if (input.activeRun.stopped) {
        await finalizeStoppedTurn(
          input.runStore,
          input.runId,
          persistedTurnId
        );
        return;
      }

      const promptPayload = {
        issue: {
          id: currentIssue.id,
          identifier: currentIssue.identifier,
          title: currentIssue.title,
          description: currentIssue.description,
          state: currentIssue.state,
          labels: currentIssue.labels,
          url: currentIssue.url,
          branch_name: currentIssue.branchName
        },
        repo: {
          name: promptRepoName,
          default_branch: promptRepoDefaultBranch
        },
        run: {
          id: input.runId ?? `attempt-${input.attempt}`
        },
        workspace: {
          path: session.workspacePath,
          branch: currentIssue.branchName
        },
        attempt: input.attempt,
        run_mode: input.runMode,
        handoff_section: formatSymphonyReworkHandoffSection(latestReworkHandoff)
      };

      const prompt =
        turnNumber === 1
          ? renderSymphonyPromptContract({
              template: input.promptTemplate,
              promptPath: input.promptContract.promptPath,
              payload: promptPayload as Parameters<
                typeof renderSymphonyPromptContract
              >[0]["payload"]
            })
          : buildSymphonyContinuationPrompt({
              turnNumber,
              maxTurns: input.runtimePolicy.agent.maxTurns,
              runMode: input.runMode
            });

      persistedTurnId = input.runId
        ? await input.runStore.recordTurnStarted(input.runId, {
            threadId: session.threadId,
            promptText: prompt,
            status: "running"
          })
        : null;

      if (
        input.runId &&
        persistedTurnId &&
        !recordedCanonicalSessionStart &&
        shouldSynthesizeSessionStartedEvent(input.runtimePolicy)
      ) {
        const sessionStartedEvent = buildSyntheticSessionStartedEvent({
          threadId: session.threadId,
          persistedTurnId,
          processId: session.processId,
          model: session.model,
          reasoningEffort: session.reasoningEffort
        });

        if (sessionStartedEvent) {
          await input.runStore.recordEvent(input.runId, persistedTurnId, {
            eventType: sessionStartedEvent.type,
            recordedAt: new Date().toISOString(),
            payload: sessionStartedEvent,
            summary: summarizeCanonicalRuntimeEvent(sessionStartedEvent),
            threadId: sessionStartedEvent.thread_id ?? session.threadId
          });
          await input.runStore.upsertRunContext(input.runId, {
            ...runtimeContextBase,
            threadId: sessionStartedEvent.thread_id ?? session.threadId,
            processId: sessionStartedEvent.agent_app_server_pid ?? session.processId,
            model: sessionStartedEvent.model ?? session.model,
            reasoningEffort:
              sessionStartedEvent.reasoning_effort ?? session.reasoningEffort
          });
          recordedCanonicalSessionStart = true;
        }
      }

      const turnResult = await session.client.runTurn(session, {
        prompt,
        title: `${currentIssue.identifier}: ${currentIssue.title}`,
        sandboxPolicy: null,
        toolExecutor: unsupportedRuntimeToolExecutor,
        turnTimeoutMs: input.runtimePolicy.pi.turnTimeoutMs,
        onMessage: async (update) => {
          const { message, projectionLosses, rawPayload } = update;
          const threadEvent = isThreadEvent(message) ? message : null;
          const runtimePayload = rawPayload ?? message;
          const runtimePayloadRecord = asRecord(runtimePayload);
          const sessionStartedEvent =
            extractCanonicalSessionStartedEvent(message) ??
            extractCanonicalSessionStartedEvent(runtimePayloadRecord);
          const eventName =
            threadEvent?.type ??
            getString(message, "type") ??
            getString(message, "event") ??
            getString(runtimePayloadRecord, "type") ??
            getString(runtimePayloadRecord, "event") ??
            "notification";
          const timestamp = new Date().toISOString();
          const turnUsage = extractRuntimeUsage(threadEvent, runtimePayloadRecord);
          const threadId =
            getString(message, "thread_id") ??
            getString(runtimePayloadRecord, "thread_id") ??
            session.threadId;
          const canonicalEvent =
            (threadEvent as CanonicalRuntimeEventPayload | null) ?? sessionStartedEvent;

          await input.callbacks.onUpdate(currentIssue.id, {
            event: eventName,
            payload: runtimePayload,
            timestamp,
            threadId:
              sessionStartedEvent?.thread_id ?? threadId,
            agentRuntimeProcessId:
              getString(message, "agent_app_server_pid") ?? session.processId
          });

          if (input.runId && persistedTurnId) {
            if (turnUsage) {
              await input.runStore.updateTurn(persistedTurnId, {
                usage: turnUsage
              });
            }

            if (canonicalEvent) {
              await input.runStore.recordEvent(input.runId, persistedTurnId, {
                eventType: canonicalEvent.type,
                recordedAt: timestamp,
                payload: canonicalEvent,
                summary: summarizeCanonicalRuntimeEvent(canonicalEvent),
                threadId:
                  (canonicalEvent.type === "session.started"
                    ? canonicalEvent.thread_id
                    : threadId) ?? session.threadId,
                agentTurnId:
                  canonicalEvent.type === "session.started"
                    ? canonicalEvent.turn_id
                    : getString(message, "turn_id") ??
                      getString(runtimePayloadRecord, "turn_id") ??
                      null
              });
              if (canonicalEvent.type === "session.started") {
                await input.runStore.upsertRunContext(input.runId, {
                  ...runtimeContextBase,
                  threadId: canonicalEvent.thread_id ?? session.threadId,
                  processId: canonicalEvent.agent_app_server_pid ?? session.processId,
                  model: canonicalEvent.model ?? session.model,
                  reasoningEffort:
                    canonicalEvent.reasoning_effort ?? session.reasoningEffort
                });
                recordedCanonicalSessionStart = true;
              }
            }

            if (threadEvent) {
              await input.agentAnalytics.recordEvent({
                runId: input.runId,
                turnId: persistedTurnId,
                threadId,
                recordedAt: timestamp,
                payload: threadEvent,
                projectionLosses,
                rawPayload
              });

              if (commandResourceMonitor) {
                try {
                  const completedProfiles = await commandResourceMonitor.observe(
                    threadEvent,
                    timestamp
                  );
                  for (const profile of completedProfiles) {
                    await input.agentAnalytics.recordCommandResourceProfile({
                      runId: input.runId,
                      turnId: persistedTurnId,
                      itemId: profile.itemId,
                      resourceProfile: profile.profile
                    });
                  }
                } catch (monitorError) {
                  input.logger.warn("Failed to record command resource metrics", {
                    runId: input.runId,
                    turnId: persistedTurnId,
                    error:
                      monitorError instanceof Error
                        ? monitorError.message
                        : String(monitorError)
                  });
                }
              }
            }
          }
        }
      });

      if (input.runId && persistedTurnId) {
        const endedAt = new Date().toISOString();
        await input.runStore.finalizeTurn(persistedTurnId, {
          status: "completed",
          endedAt,
          threadId: turnResult.threadId,
          agentTurnId: turnResult.turnId,
          usage: turnResult.usage ?? null
        });
        persistedTurnId = null;
      }

      if (input.runId) {
        if (explicitCompletionRequirement === "delivery_report") {
          deliveryReport = await loadLatestDeliveryReportForRun(
            input.deliveryReports,
            input.runId
          );
        } else if (input.issueTimelineStore) {
          mergeResult = await loadLatestMergeResultForRun(
            input.issueTimelineStore,
            currentIssue.identifier,
            input.runId
          );
        }
      }

      if (deliveryReport) {
        const refreshedIssue = await refreshIssueState(
          input.tracker,
          input.runtimePolicy,
          currentIssue
        );
        currentIssue = refreshedIssue ?? currentIssue;
        break;
      }

      if (mergeResult) {
        break;
      }

      const refreshedIssue = await refreshIssueState(
        input.tracker,
        input.runtimePolicy,
        currentIssue
      );

      if (!refreshedIssue || !isActiveIssueState(input.runtimePolicy, refreshedIssue.state)) {
        break;
      }

      if (turnNumber >= input.runtimePolicy.agent.maxTurns) {
        maxTurnsReached = true;
        break;
      }

      currentIssue = refreshedIssue;
    }

    if (!input.activeRun.stopped) {
      if (input.runId) {
        const repoEnd = await captureRepoSnapshot(
          input.launchTarget,
          input.runtimePolicy.hooks.timeoutMs
        );
        await input.runStore.updateRun(input.runId, {
          commitHashEnd: repoEnd.commitHash,
          repoEnd: repoEnd.snapshot
        });
      }

      if (deliveryReport) {
        await input.callbacks.onComplete(
          input.issue.id,
          deliveryCompletion(deliveryReport, currentIssue, input.runtimePolicy)
        );
      } else if (mergeResult) {
        const refreshedIssue = await refreshIssueState(
          input.tracker,
          input.runtimePolicy,
          currentIssue
        );
        currentIssue = refreshedIssue ?? currentIssue;
        await input.callbacks.onComplete(
          input.issue.id,
          mergeResultCompletion(mergeResult, currentIssue, input.runtimePolicy)
        );
      } else if (maxTurnsReached) {
        await input.callbacks.onComplete(input.issue.id, {
          kind: "max_turns_reached",
          reason: `Reached the configured ${input.runtimePolicy.agent.maxTurns}-turn limit while the issue remained active.`,
          maxTurns: input.runtimePolicy.agent.maxTurns
        });
      } else {
        await input.callbacks.onComplete(
          input.issue.id,
          missingExplicitCompletion(explicitCompletionRequirement)
        );
      }
    }
  } catch (error) {
    if (input.activeRun.stopped) {
      await finalizeStoppedTurn(
        input.runStore,
        input.runId,
        persistedTurnId
      );
      return;
    }

    const reason = error instanceof Error ? error.message : String(error);
    const harnessError = error instanceof HarnessSessionError ? error : null;

    if (input.runId && persistedTurnId) {
      const endedAt = new Date().toISOString();
      await input.runStore.finalizeTurn(persistedTurnId, {
        status: "failed",
        endedAt,
        metadata: {
          reason
        }
      });
    }

    if (input.runId) {
      const repoEnd = await captureRepoSnapshot(
        input.launchTarget,
        input.runtimePolicy.hooks.timeoutMs
      );
      await input.runStore.updateRun(input.runId, {
        commitHashEnd: repoEnd.commitHash,
        repoEnd: repoEnd.snapshot
      });
    }

    const startupFailure = classifyStartupFailure(error);
    await input.runtimeLogs.record({
      level: "error",
      source: "agent_runtime",
      eventType: startupFailure
        ? "runtime_startup_failed"
        : "runtime_execution_failed",
      message: startupFailure
        ? "Agent runtime startup failed."
        : "Agent runtime execution failed.",
      issueIdentifier: input.issue.identifier,
      runId: input.runId,
      payload: {
        reason,
        failureStage: startupFailure?.failureStage ?? null,
        failureOrigin: startupFailure?.failureOrigin ?? null,
        model: harnessModelPolicy.defaultModel,
        providerId: sessionProviderId,
        providerName: sessionProviderName,
        authMode: input.harnessAuthMode,
        providerEnvKey: input.harnessProviderEnvKey,
        harness: input.harness.kind,
        launchTarget: describeLaunchTarget(input.launchTarget),
        diagnostics: harnessError ? toJsonValue(harnessError.detail) : null
      }
    });

    await input.callbacks.onComplete(input.issue.id, {
      ...(startupFailure
        ? {
            kind: "startup_failure" as const,
            reason,
            failureStage: startupFailure.failureStage,
            failureOrigin: startupFailure.failureOrigin,
            launchTarget: input.launchTarget
          }
        : isRateLimitedError(error)
          ? {
              kind: "rate_limited" as const,
              reason
            }
          : isTransientProviderError(error, sessionProviderId)
            ? {
                kind: "provider_transient" as const,
                reason
              }
          : {
              kind: "failure" as const,
              reason
            })
    });
  } finally {
    if (commandResourceMonitor && input.runId && persistedTurnId) {
      try {
        const flushedProfiles = await commandResourceMonitor.flush();
        for (const profile of flushedProfiles) {
          await input.agentAnalytics.recordCommandResourceProfile({
            runId: input.runId,
            turnId: persistedTurnId,
            itemId: profile.itemId,
            resourceProfile: profile.profile
          });
        }
      } catch (monitorError) {
        input.logger.warn("Failed to flush command resource metrics", {
          runId: input.runId,
          turnId: persistedTurnId,
          error:
            monitorError instanceof Error
              ? monitorError.message
              : String(monitorError)
        });
      }
    }
    input.activeRun.client?.close();
  }
}

function buildRuntimeApiBaseUrl(
  launchTarget: SymphonyRuntimeLaunchTarget,
  apiPort: number
): string {
  switch (launchTarget.kind) {
    case "container":
      return `http://host.docker.internal:${apiPort}/api/v1/internal/runtime-tools`;
    default:
      return `http://127.0.0.1:${apiPort}/api/v1/internal/runtime-tools`;
  }
}

function resolvePromptRepoName(
  configuredGitHubRepo: string | null,
  repoRoot: string
): string {
  const configuredName = configuredGitHubRepo?.split("/").pop()?.trim();

  if (configuredName) {
    return configuredName;
  }

  const basename = path.basename(repoRoot).trim();
  return basename === "" ? "repository" : basename;
}

function resolvePromptRepoDefaultBranch(repoRoot: string): string {
  try {
    const ref = execFileSync(
      "git",
      ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      }
    ).trim();
    const branch = ref.replace(/^origin\//, "").trim();

    if (branch !== "") {
      return branch;
    }
  } catch {
    // Ignore missing/non-git repos and fall back to the conventional default.
  }

  return "main";
}

function describeLaunchTarget(target: SymphonyRuntimeLaunchTarget): JsonObject {
  return {
    kind: target.kind,
    hostLaunchPath: target.hostLaunchPath,
    hostWorkspacePath: target.hostWorkspacePath,
    runtimeWorkspacePath: target.runtimeWorkspacePath,
    containerId: target.containerId,
    containerName: target.containerName,
    shell: target.shell,
    user: target.user
  };
}

function deliveryCompletion(
  deliveryReport: RuntimeDeliveryReportResult,
  currentIssue: SymphonyTrackerIssue,
  runtimePolicy: SymphonyAgentRuntimeConfig
): SymphonyAgentRuntimeCompletion {
  switch (deliveryReport.status) {
    case "completed":
      if (!matchesIssueState(currentIssue.state, deliveryTransitionState)) {
        return {
          kind: "failure",
          reason: buildUnexpectedDeliveryStateReason(
            deliveryReport.status,
            deliveryTransitionState,
            currentIssue.state
          )
        };
      }

      return {
        kind: "delivered"
      };
    case "blocked":
      if (
        !matchesIssueState(
          currentIssue.state,
          runtimePolicy.tracker.blockedTransitionToState
        )
      ) {
        return {
          kind: "failure",
          reason: buildUnexpectedDeliveryStateReason(
            deliveryReport.status,
            runtimePolicy.tracker.blockedTransitionToState,
            currentIssue.state
          )
        };
      }

      return {
        kind: "blocked",
        reason:
          deliveryReport.blockingReason ??
          `Delivery reported as blocked: ${deliveryReport.summary}`
      };
    case "partial":
    default:
      return {
        kind: "failure",
        reason: `Delivery reported as partial: ${deliveryReport.summary}`
      };
  }
}

function matchesIssueState(actualState: string, expectedState: string | null): boolean {
  const normalizedActual = actualState.trim().toLowerCase();
  const normalizedExpected = expectedState?.trim().toLowerCase();

  return normalizedExpected !== undefined && normalizedExpected !== null
    ? normalizedActual === normalizedExpected
    : false;
}

function buildUnexpectedDeliveryStateReason(
  deliveryStatus: RuntimeDeliveryReportResult["status"],
  expectedState: string | null,
  actualState: string
): string {
  const expected = expectedState?.trim() || "the expected terminal state";

  return deliveryStatus === "completed"
    ? `Delivery was recorded as completed, but the issue did not reach \`${expected}\`. Current state: \`${actualState}\`.`
    : `Delivery was recorded as blocked, but the issue did not reach \`${expected}\`. Current state: \`${actualState}\`.`;
}

function buildUnexpectedMergeResultStateReason(
  mergeStatus: RuntimeMergeResult["status"],
  expectedState: string | null,
  actualState: string
): string {
  const expected = expectedState?.trim() || "the expected terminal state";

  return mergeStatus === "merged"
    ? `Merge was recorded as merged, but the issue did not reach \`${expected}\`. Current state: \`${actualState}\`.`
    : `Merge was recorded as blocked, but the issue did not reach \`${expected}\`. Current state: \`${actualState}\`.`;
}

type ExplicitCompletionRequirement =
  | "delivery_report"
  | "merge_result";

function resolveExplicitCompletionRequirement(
  runMode: SymphonyRunMode
): ExplicitCompletionRequirement {
  return runMode === "approved_merge" ? "merge_result" : "delivery_report";
}

async function loadLatestDeliveryReportForRun(
  deliveryReports: SymphonyIssueDeliveryReportStore,
  runId: string
): Promise<RuntimeDeliveryReportResult | null> {
  const persistedReport = await deliveryReports.fetchLatestForRun(runId);
  if (!persistedReport) {
    return null;
  }

  return {
    reportId: persistedReport.reportId,
    status: persistedReport.status,
    summary: persistedReport.summary,
    prUrl: persistedReport.prUrl,
    blockingReason: persistedReport.blockingReason
  };
}

async function loadLatestMergeResultForRun(
  issueTimelineStore: SymphonyIssueTimelineStore,
  issueIdentifier: string,
  runId: string
): Promise<RuntimeMergeResult | null> {
  const entries = await issueTimelineStore.listIssueTimeline(issueIdentifier, {
    limit: 50
  });
  const matchingEntry = entries.find(
    (entry) =>
      entry.runId === runId && entry.eventType === runtimeMergeResultEventType
  );

  return matchingEntry ? parseMergeResult(matchingEntry.payload) : null;
}

function parseMergeResult(payload: JsonValue): RuntimeMergeResult | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const status = getStringValue(record.status);
  const summary = getStringValue(record.summary);
  if ((status !== "merged" && status !== "blocked") || !summary) {
    return null;
  }

  return {
    status,
    summary,
    prUrl: getStringValue(record.prUrl),
    mergeCommitSha: getStringValue(record.mergeCommitSha),
    blockingReason: getStringValue(record.blockingReason),
    testsSummary: getStringValue(record.testsSummary)
  };
}

function mergeResultCompletion(
  mergeResult: RuntimeMergeResult,
  currentIssue: SymphonyTrackerIssue,
  runtimePolicy: SymphonyAgentRuntimeConfig
): SymphonyAgentRuntimeCompletion {
  if (mergeResult.status === "merged") {
    if (!matchesIssueState(currentIssue.state, "Done")) {
      return {
        kind: "failure",
        reason: buildUnexpectedMergeResultStateReason(
          mergeResult.status,
          "Done",
          currentIssue.state
        )
      };
    }

    return {
      kind: "merged"
    };
  }

  if (
    !matchesIssueState(
      currentIssue.state,
      runtimePolicy.tracker.blockedTransitionToState
    )
  ) {
    return {
      kind: "failure",
      reason: buildUnexpectedMergeResultStateReason(
        mergeResult.status,
        runtimePolicy.tracker.blockedTransitionToState,
        currentIssue.state
      )
    };
  }

  return {
    kind: "merge_blocked",
    reason:
      mergeResult.blockingReason ??
      `Merge reported as blocked: ${mergeResult.summary}`
  };
}

function getStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function missingDeliveryReportCompletion(): SymphonyAgentRuntimeCompletion {
  return {
    kind: "failure",
    reason:
      "Run ended without recording delivery explicitly through `pnpm exec symphony tool finish ...`. Delivery success must be reported before the run can complete."
  };
}

function missingMergeResultCompletion(): SymphonyAgentRuntimeCompletion {
  return {
    kind: "failure",
    reason:
      "Approved merge run ended without recording the merge result explicitly through `pnpm exec symphony tool merge-result ...`. Merge success or a blocked merge outcome must be reported before the run can complete."
  };
}

function missingExplicitCompletion(
  requirement: ExplicitCompletionRequirement
): SymphonyAgentRuntimeCompletion {
  return requirement === "merge_result"
    ? missingMergeResultCompletion()
    : missingDeliveryReportCompletion();
}

async function refreshIssueState(
  tracker: SymphonyTracker,
  runtimePolicy: SymphonyAgentRuntimeConfig,
  issue: SymphonyTrackerIssue
): Promise<SymphonyTrackerIssue | null> {
  const refreshed = await tracker.fetchIssueStatesByIds(runtimePolicy.tracker, [
    issue.id
  ]);

  return refreshed[0] ?? null;
}

function isActiveIssueState(
  runtimePolicy: SymphonyAgentRuntimeConfig,
  state: string
): boolean {
  const normalizedState = state.trim().toLowerCase();

  return runtimePolicy.tracker.dispatchableStates.some(
    (activeState) => activeState.trim().toLowerCase() === normalizedState
  );
}

function classifyStartupFailure(error: unknown): {
  failureStage: SymphonyStartupFailureStage;
  failureOrigin: SymphonyStartupFailureOrigin;
} | null {
  const harnessError = error instanceof HarnessSessionError ? error : null;
  if (harnessError) {
    if (
      [
        "initialize_failed",
        "thread_start_failed",
        "invalid_workspace_cwd",
        "invalid_thread_payload",
        "invalid_turn_payload",
        "invalid_issue_label_override",
        "pi_launch_unsupported",
        "pi_session_start_failed",
        "pi_turn_start_failed"
      ].includes(harnessError.code)
    ) {
      return {
        failureStage: "runtime_session_start",
        failureOrigin: "pi_startup"
      };
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes("Pi RPC")
  ) {
    return {
      failureStage: "runtime_session_start",
      failureOrigin: "pi_startup"
    };
  }

  return null;
}

function isRateLimitedError(error: unknown): boolean {
  const harnessError = error instanceof HarnessSessionError ? error : null;
  const messages = [
    error instanceof Error ? error.message : String(error)
  ];

  if (harnessError?.detail) {
    messages.push(JSON.stringify(harnessError.detail));
  }

  return messages.some((message) => {
    const normalized = message.toLowerCase();

    return (
      normalized.includes("rate limit") ||
      normalized.includes("rate_limit") ||
      normalized.includes("ratelimit") ||
      normalized.includes("too many requests") ||
      normalized.includes("rate_limit_exceeded")
    );
  });
}

export function isTransientProviderError(
  error: unknown,
  providerId: string | null
): boolean {
  if (!providerId) {
    return false;
  }

  const harnessError = error instanceof HarnessSessionError ? error : null;
  const messages = [
    error instanceof Error ? error.message : String(error)
  ];

  if (harnessError?.detail) {
    messages.push(JSON.stringify(harnessError.detail));
  }

  return messages.some((message) => {
    const normalized = message.toLowerCase();

    return (
      normalized.includes("502 bad gateway") ||
      normalized.includes("503 service unavailable") ||
      normalized.includes("504 gateway timeout") ||
      normalized.includes("error code: 502") ||
      normalized.includes("error code: 503") ||
      normalized.includes("error code: 504") ||
      normalized.includes("unexpected status 502") ||
      normalized.includes("unexpected status 503") ||
      normalized.includes("unexpected status 504") ||
      normalized.includes("socket hang up") ||
      normalized.includes("connection reset") ||
      normalized.includes("econnreset") ||
      normalized.includes("etimedout") ||
      normalized.includes("eai_again") ||
      normalized.includes("temporary failure in name resolution") ||
      normalized.includes("upstream connect error") ||
      normalized.includes("upstream request timeout")
    );
  });
}

function getString(
  value: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const nested = value?.[key];
  return typeof nested === "string" && nested.trim() !== "" ? nested : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toJsonValue(value: unknown): JsonValue | null {
  if (value === undefined) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  } catch {
    return null;
  }
}

function extractRuntimeUsage(
  threadEvent: Parameters<typeof extractUsage>[0] | null,
  payload: Record<string, unknown> | null
): {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
} | null {
  const eventUsage = threadEvent ? extractUsage(threadEvent) : null;
  if (eventUsage) {
    return eventUsage;
  }

  const decodedPiEvent =
    decodePiRuntimeEvent(payload) ??
    decodePiRuntimeEvent(asRecord(asRecord(payload?.params)?.msg));
  const piUsage =
    decodedPiEvent &&
    (decodedPiEvent.type === "message_end" || decodedPiEvent.type === "turn_end")
      ? extractPiRuntimeUsage(decodedPiEvent)
      : null;

  if (piUsage) {
    return {
      input_tokens: piUsage.input,
      cached_input_tokens: piUsage.cacheRead,
      output_tokens: piUsage.output
    };
  }

  const directUsage =
    asRecord(payload?.usage) ??
    asRecord(asRecord(payload?.message)?.usage) ??
    asRecord(asRecord(asRecord(payload?.params)?.msg)?.usage);

  if (!directUsage) {
    return null;
  }

  const inputTokens = getNumber(directUsage, "input_tokens") ?? getNumber(directUsage, "input");
  const cachedInputTokens =
    getNumber(directUsage, "cached_input_tokens") ?? getNumber(directUsage, "cacheRead");
  const outputTokens =
    getNumber(directUsage, "output_tokens") ?? getNumber(directUsage, "output");

  return inputTokens !== null || cachedInputTokens !== null || outputTokens !== null
    ? {
        input_tokens: inputTokens ?? 0,
        cached_input_tokens: cachedInputTokens ?? 0,
        output_tokens: outputTokens ?? 0
      }
    : null;
}

function getNumber(
  value: Record<string, unknown> | null | undefined,
  key: string
): number | null {
  const nested = value?.[key];
  return typeof nested === "number" && Number.isFinite(nested) ? nested : null;
}

type CanonicalRuntimeEventPayload =
  Parameters<SymphonyRuntimeRunStore["recordEvent"]>[2]["payload"];
type CanonicalRuntimeSessionStartedEvent = Extract<
  CanonicalRuntimeEventPayload,
  { type: "session.started" }
>;

function shouldSynthesizeSessionStartedEvent(
  runtimePolicy: SymphonyAgentRuntimeConfig
): boolean {
  return !/(?:^|\s)app-server(?=\s|$)/u.test(runtimePolicy.agentRuntime.command.trim());
}

function buildSyntheticSessionStartedEvent(input: {
  threadId: string | null;
  persistedTurnId: string;
  processId: string | null;
  model: string | null;
  reasoningEffort: string | null;
}): CanonicalRuntimeSessionStartedEvent | null {
  if (!input.threadId) {
    return null;
  }

  return {
    type: "session.started",
    session_id: input.threadId,
    thread_id: input.threadId,
    turn_id: input.persistedTurnId,
    agent_app_server_pid: input.processId,
    model: input.model,
    reasoning_effort: input.reasoningEffort
  };
}

function extractCanonicalSessionStartedEvent(
  value: Record<string, unknown> | null | undefined
): CanonicalRuntimeSessionStartedEvent | null {
  if (getString(value, "type") !== "session.started") {
    return null;
  }

  const rawSessionId = getString(value, "session_id");
  const turnId = getString(value, "turn_id");

  if (!rawSessionId || !turnId) {
    return null;
  }

  return {
    type: "session.started",
    session_id: rawSessionId,
    thread_id: getString(value, "thread_id"),
    turn_id: turnId,
    agent_app_server_pid: getString(value, "agent_app_server_pid"),
    model: getString(value, "model"),
    reasoning_effort: getString(value, "reasoning_effort")
  };
}

function summarizeCanonicalRuntimeEvent(event: CanonicalRuntimeEventPayload): string | null {
  switch (event.type) {
    case "session.started":
      return "Runtime session started.";
    case "thread.started":
      return "Thread started.";
    case "turn.started":
      return "Turn started.";
    case "turn.completed":
      return "Turn completed.";
    case "turn.failed":
      return "Turn failed.";
    case "error":
      return event.message;
    case "item.started":
      return `${event.item.type} started.`;
    case "item.updated":
      return `${event.item.type} updated.`;
    case "item.completed":
      return `${event.item.type} completed.`;
    default:
      return null;
  }
}

async function finalizeStoppedTurn(
  runStore: SymphonyRuntimeRunStore,
  runId: string | null,
  persistedTurnId: string | null
): Promise<void> {
  if (!runId || !persistedTurnId) {
    return;
  }

  await runStore.finalizeTurn(persistedTurnId, {
    status: "stopped",
    endedAt: new Date().toISOString(),
    metadata: {
      stopReason: "runtime_stopped"
    }
  });
}

const unsupportedRuntimeToolExecutor: HarnessToolExecutor = async () => {
  return {
    success: false,
    output: JSON.stringify(
      {
        error: {
          message:
            "Symphony runtime-injected tools are disabled. Use the workspace CLI instead."
        }
      },
      null,
      2
    ),
    contentItems: []
  };
};
