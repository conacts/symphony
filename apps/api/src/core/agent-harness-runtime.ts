import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
  AgentRuntime,
  SymphonyAgentRuntimeConfig,
  SymphonyWorkerSessionContract
} from "@symphony/orchestrator";
import {
  renderSymphonyPromptContract,
  type SymphonyLoadedPromptContract,
  type SymphonyRunMode
} from "@symphony/runtime-contract";
import type { JsonObject } from "@symphony/contracts";
import type {
  SymphonyTracker,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import type {
  AgentAnalyticsStore,
  SymphonyRuntimeLogStore,
  SymphonyRuntimeRunStore
} from "@symphony/db";
import type { SymphonyLogger } from "@symphony/logger";
import {
  HarnessSessionError,
  resolveHarnessModelRuntimePolicy,
  type HarnessCompletionCandidate
} from "@symphony/agent-harnesses";
import { resolveRuntimeRepositoryKey } from "./runtime-repository-key.js";
import { resolveIssueRepository } from "./runtime-repository-routing.js";
import type { AdmittedRuntimeRepository } from "./runtime-admitted-repositories.js";
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
import { CommandResourceMonitor } from "./command-resource-monitor.js";
import {
  recordRunRepoEndSnapshot,
  recordRunRepoStartSnapshot
} from "./runtime-supervision/runtime-repo-snapshot-policy.js";
import {
  recordRuntimeLifecycleLog,
  buildRuntimeTerminalResultLogPayload
} from "./runtime-supervision/runtime-lifecycle-recorder.js";
import {
  capabilityManagedRunCompletion,
  classifyHarnessExecutionFailure,
  classifyHarnessTurnFailure,
  classifyStartupFailure,
  completionFromHarnessTurnResult,
  isRateLimitedError,
  isTransientProviderError,
  missingExplicitCompletion,
  resolveExplicitCompletionRequirement
} from "./runtime-supervision/runtime-outcome-classifier.js";
import {
  type ActiveRun,
  type RunCallbacks,
  type WorkflowLifecycleReaders
} from "./runtime-supervision/runtime-supervision-types.js";
import {
  toJsonValue
} from "./runtime-supervision/runtime-supervision-values.js";
import {
  finalizePersistedTurnFromResult,
  finalizeStoppedTurn,
  finalizeTurnForDetectedCompletion
} from "./runtime-supervision/runtime-turn-persistence.js";
import {
  createDefaultWorkerSessionContract,
} from "./runtime-supervision/runtime-worker-session.js";
import {
  isActiveIssueState,
  observeActiveIssueStateThroughWorkflow
} from "./runtime-supervision/runtime-workflow-state.js";
import { createRuntimeTurnProjection } from "./runtime-supervision/runtime-session-projection.js";
import {
  publishRuntimeCompletion,
  reportCompletionOverride
} from "./runtime-supervision/runtime-completion-reporter.js";
import type { RuntimeTurnProjection } from "./runtime-supervision/runtime-session-projection.js";

export function createSymphonyAgentRuntime(input: {
  promptContract: SymphonyLoadedPromptContract;
  admittedRepositories?: AdmittedRuntimeRepository[];
  runtimeWorkingDirectory?: string;
  githubRepository?: string | null;
  tracker: SymphonyTracker;
  runStore: SymphonyRuntimeRunStore;
  loadWorkflowLifecycleView: WorkflowLifecycleReaders["loadWorkflowLifecycleView"];
  observeActiveWorkflowIssueState: WorkflowLifecycleReaders["observeActiveWorkflowIssueState"];
  isCapabilityManagedRun?: WorkflowLifecycleReaders["isCapabilityManagedRun"];
  agentAnalytics: AgentAnalyticsStore;
  runtimeLogs: SymphonyRuntimeLogStore;
  hostCommandEnvSource: Record<string, string | undefined>;
  harnessLaunchEnv?: Record<string, string>;
  harnessAuthMode?: string | null;
  harnessProviderEnvKey?: string | null;
  workerSessionContract?: SymphonyWorkerSessionContract;
  logger: SymphonyLogger;
  callbacks: RunCallbacks;
}): AgentRuntime {
  const workerSessionContract =
    input.workerSessionContract ?? createDefaultWorkerSessionContract();

  return createHarnessBackedSymphonyAgentRuntime({
    ...input,
    workerSessionContract,
    harness: createPiRuntimeHarness()
  });
}

function createHarnessBackedSymphonyAgentRuntime(input: {
  harness: SymphonyRuntimeHarness;
  promptContract: SymphonyLoadedPromptContract;
  admittedRepositories?: AdmittedRuntimeRepository[];
  runtimeWorkingDirectory?: string;
  githubRepository?: string | null;
  tracker: SymphonyTracker;
  runStore: SymphonyRuntimeRunStore;
  loadWorkflowLifecycleView: WorkflowLifecycleReaders["loadWorkflowLifecycleView"];
  observeActiveWorkflowIssueState: WorkflowLifecycleReaders["observeActiveWorkflowIssueState"];
  isCapabilityManagedRun?: WorkflowLifecycleReaders["isCapabilityManagedRun"];
  agentAnalytics: AgentAnalyticsStore;
  runtimeLogs: SymphonyRuntimeLogStore;
  hostCommandEnvSource: Record<string, string | undefined>;
  harnessLaunchEnv?: Record<string, string>;
  harnessAuthMode?: string | null;
  harnessProviderEnvKey?: string | null;
  workerSessionContract: SymphonyWorkerSessionContract;
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
        client: null,
        completionOverride: null,
        completionReported: false
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
        githubRepository: repositoryKey,
        tracker: input.tracker,
        runStore: input.runStore,
        loadWorkflowLifecycleView: input.loadWorkflowLifecycleView,
        observeActiveWorkflowIssueState: input.observeActiveWorkflowIssueState,
        isCapabilityManagedRun:
          input.isCapabilityManagedRun ??
          (async () => false),
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
        workerSessionContract: input.workerSessionContract,
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
  githubRepository: string | null;
  tracker: SymphonyTracker;
  runStore: SymphonyRuntimeRunStore;
  loadWorkflowLifecycleView: WorkflowLifecycleReaders["loadWorkflowLifecycleView"];
  observeActiveWorkflowIssueState: WorkflowLifecycleReaders["observeActiveWorkflowIssueState"];
  isCapabilityManagedRun: NonNullable<
    WorkflowLifecycleReaders["isCapabilityManagedRun"]
  >;
  agentAnalytics: AgentAnalyticsStore;
  runtimeLogs: SymphonyRuntimeLogStore;
  runtimePolicy: SymphonyAgentRuntimeConfig;
  logger: SymphonyLogger;
  hostCommandEnvSource: Record<string, string | undefined>;
  harnessLaunchEnv: Record<string, string>;
  harnessAuthMode: string | null;
  harnessProviderEnvKey: string | null;
  workerSessionContract: SymphonyWorkerSessionContract;
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
  let recordedCanonicalSessionStart = false;
  let workerSessionId: string | null = null;
  let latestCompletionCandidate: HarnessCompletionCandidate | null = null;
  let activeTurnProjection: RuntimeTurnProjection | null = null;
  const capabilityManagedRun = await input.isCapabilityManagedRun({
    issueIdentifier: input.issue.identifier,
    runId: input.runId,
    runMode: input.runMode
  });
  const explicitCompletionRequirement =
    resolveExplicitCompletionRequirement(capabilityManagedRun);
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
      await recordRunRepoStartSnapshot({
        runStore: input.runStore,
        runId: input.runId,
        launchTarget: input.launchTarget,
        timeoutMs: input.runtimePolicy.hooks.timeoutMs
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
        SYMPHONY_REPOSITORY_KEY: repositoryKey,
        SYMPHONY_ISSUE_IDENTIFIER: input.issue.identifier,
        SYMPHONY_TRACKER_ISSUE_ID: input.issue.id,
        ...(input.runId ? { SYMPHONY_RUN_ID: input.runId } : {}),
      },
      hostCommandEnvSource: input.hostCommandEnvSource,
      runtimePolicy: input.runtimePolicy,
      issue: input.issue,
      logger: input.logger
    });
    await input.workerSessionContract.startSession({
      sessionId: session.threadId,
      issueId: input.issue.id,
      runId: input.runId,
      attempt: input.attempt,
      runMode: input.runMode,
      startedAt: new Date().toISOString(),
      workerHost: input.workspace.workerHost ?? null
    });
    input.activeRun.client = session.client;
    workerSessionId = session.threadId;
    sessionProviderId = session.providerId;
    sessionProviderName = session.providerName;
    const commandResourceMonitor = new CommandResourceMonitor(session.processId);
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
        await finalizeStoppedTurn({
          runStore: input.runStore,
          runId: input.runId,
          persistedTurnId
        });
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
        completion_contract: "module_result"
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
              runMode: input.runMode,
              completionContract: "module_result"
            });

      const persistedTurnStartedAt = new Date().toISOString();
      persistedTurnId = input.runId
        ? await input.runStore.recordTurnStarted(input.runId, {
            turnId: randomUUID(),
            turnSequence: turnNumber,
            threadId: session.threadId,
            promptText: prompt,
            status: "running",
            startedAt: persistedTurnStartedAt
          })
        : null;
      activeTurnProjection = createRuntimeTurnProjection({
        issue: currentIssue,
        runId: input.runId,
        attempt: input.attempt,
        runMode: input.runMode,
        persistedTurnId,
        session,
        runtimePolicy: input.runtimePolicy,
        runtimeContextBase,
        runStore: input.runStore,
        agentAnalytics: input.agentAnalytics,
        workerSessionContract: input.workerSessionContract,
        callbacks: input.callbacks,
        commandResourceMonitor,
        logger: input.logger,
        initialState: {
          recordedCanonicalSessionStart,
          latestCompletionCandidate
        }
      });
      await activeTurnProjection.recordSyntheticSessionStartedIfNeeded();
      recordedCanonicalSessionStart =
        activeTurnProjection.state.recordedCanonicalSessionStart;

      await recordRuntimeLifecycleLog({
        runtimeLogs: input.runtimeLogs,
        level: "info",
        eventType: "runtime_turn_started",
        message: "Started an agent runtime turn.",
        issueIdentifier: input.issue.identifier,
        runId: input.runId,
        payload: {
          turnNumber,
          maxTurns: input.runtimePolicy.agent.maxTurns,
          runMode: input.runMode,
          issueState: currentIssue.state,
          capabilityManagedRun,
          explicitCompletionRequirement
        }
      });

      const turnResult = await session.client.runTurn(session, {
        prompt,
        title: `${currentIssue.identifier}: ${currentIssue.title}`,
        turnTimeoutMs: input.runtimePolicy.pi.turnTimeoutMs,
        onMessage: async (update) => {
          const turnProjection = activeTurnProjection;
          if (!turnProjection) {
            throw new TypeError(
              "Runtime turn projection was not initialized before processing a harness update."
            );
          }

          const projectionResult = await turnProjection.handleUpdate(update);
          latestCompletionCandidate =
            turnProjection.state.latestCompletionCandidate;
          recordedCanonicalSessionStart =
            turnProjection.state.recordedCanonicalSessionStart;

          if (
            explicitCompletionRequirement === "none" &&
            projectionResult.detectedCompletion &&
            input.activeRun.completionOverride === null
          ) {
            const terminalCompletion = projectionResult.detectedCompletion;
            if (terminalCompletion) {
              // Capability-managed runs should stop as soon as a valid terminal
              // module result is visible, even if the runtime never emits a
              // clean session shutdown afterward.
              input.activeRun.completionOverride = terminalCompletion;
              input.activeRun.stopped = true;
              await input.runtimeLogs.record({
                level: "info",
                source: "agent_runtime",
                eventType: "runtime_terminal_result_detected",
                message:
                  "Capability-managed terminal module result detected before the runtime session closed.",
                issueIdentifier: input.issue.identifier,
                runId: input.runId,
                recordedAt: projectionResult.recordedAt,
                payload: {
                  completionKind: terminalCompletion.kind,
                  moduleId: terminalCompletion.moduleResult?.moduleId ?? null,
                  outcome:
                    terminalCompletion.moduleResult?.outcome ?? null,
                  requestedState:
                    terminalCompletion.moduleResult?.requestedState ?? null
                }
              });
              input.activeRun.client?.close();
            }
          }
        }
      });

      if (input.activeRun.completionOverride) {
        await finalizeTurnForDetectedCompletion({
          runStore: input.runStore,
          runId: input.runId,
          persistedTurnId,
          turnResult
        });
        await reportCompletionOverride({
          activeRun: input.activeRun,
          runtimeLogs: input.runtimeLogs,
          workerSessionContract: input.workerSessionContract,
          sessionId: workerSessionId,
          issueId: input.issue.id,
          issueIdentifier: input.issue.identifier,
          runId: input.runId,
          attempt: input.attempt,
          runMode: input.runMode,
          callbacks: input.callbacks,
          launchTarget: input.launchTarget,
          runtimePolicy: input.runtimePolicy,
          runStore: input.runStore
        });
        return;
      }

      persistedTurnId = await finalizePersistedTurnFromResult({
        runId: input.runId,
        persistedTurnId,
        runStore: input.runStore,
        turnResult
      });
      await recordRuntimeLifecycleLog({
        runtimeLogs: input.runtimeLogs,
        level: turnResult.kind === "failed" ? "warn" : "info",
        eventType: "runtime_terminal_result_returned",
        message: "Agent runtime returned a terminal result.",
        issueIdentifier: input.issue.identifier,
        runId: input.runId,
        payload: buildRuntimeTerminalResultLogPayload(turnResult)
      });

      if (turnResult.kind !== "completed") {
        const failedTurnClassification =
          turnResult.kind === "failed"
            ? classifyHarnessTurnFailure({
                turnResult,
                providerId: sessionProviderId
              })
            : null;

        if (input.runId) {
          await recordRunRepoEndSnapshot({
            runStore: input.runStore,
            runId: input.runId,
            launchTarget: input.launchTarget,
            timeoutMs: input.runtimePolicy.hooks.timeoutMs
          });
        }

        if (failedTurnClassification) {
          await recordRuntimeLifecycleLog({
            runtimeLogs: input.runtimeLogs,
            level: failedTurnClassification.level,
            eventType: failedTurnClassification.eventType,
            message: failedTurnClassification.message,
            issueIdentifier: input.issue.identifier,
            runId: input.runId,
            payload: {
              terminalResultKind: turnResult.kind,
              ...failedTurnClassification.payload
            }
          });
        }

        const completion =
          failedTurnClassification?.completion ??
          completionFromHarnessTurnResult(turnResult);
        await publishRuntimeCompletion({
          workerSessionContract: input.workerSessionContract,
          runtimeLogs: input.runtimeLogs,
          sessionId: session.threadId,
          issueId: input.issue.id,
          issueIdentifier: input.issue.identifier,
          runId: input.runId,
          attempt: input.attempt,
          runMode: input.runMode,
          completion,
          callbacks: input.callbacks
        });
        return;
      }

      if (explicitCompletionRequirement === "none") {
        break;
      }

      const refreshedIssue = await observeActiveIssueStateThroughWorkflow({
        issue: currentIssue,
        recordedAt: new Date().toISOString(),
        observeActiveWorkflowIssueState: input.observeActiveWorkflowIssueState,
        loadWorkflowLifecycleView: input.loadWorkflowLifecycleView
      });

      if (!isActiveIssueState(input.runtimePolicy, refreshedIssue.state)) {
        break;
      }

      if (turnNumber >= input.runtimePolicy.agent.maxTurns) {
        maxTurnsReached = true;
        break;
      }

      currentIssue = refreshedIssue;
    }

    if (input.activeRun.completionOverride) {
      await reportCompletionOverride({
        activeRun: input.activeRun,
        runtimeLogs: input.runtimeLogs,
        workerSessionContract: input.workerSessionContract,
        sessionId: workerSessionId,
        issueId: input.issue.id,
        issueIdentifier: input.issue.identifier,
        runId: input.runId,
        attempt: input.attempt,
        runMode: input.runMode,
        callbacks: input.callbacks,
        launchTarget: input.launchTarget,
        runtimePolicy: input.runtimePolicy,
        runStore: input.runStore
      });
      return;
    }

    if (!input.activeRun.stopped) {
      if (input.runId) {
        await recordRunRepoEndSnapshot({
          runStore: input.runStore,
          runId: input.runId,
          launchTarget: input.launchTarget,
          timeoutMs: input.runtimePolicy.hooks.timeoutMs
        });
      }

      if (explicitCompletionRequirement === "none") {
        const completion = capabilityManagedRunCompletion({
          completionCandidate: latestCompletionCandidate
        });
        await publishRuntimeCompletion({
          workerSessionContract: input.workerSessionContract,
          runtimeLogs: input.runtimeLogs,
          sessionId: session.threadId,
          issueId: input.issue.id,
          issueIdentifier: input.issue.identifier,
          runId: input.runId,
          attempt: input.attempt,
          runMode: input.runMode,
          completion,
          callbacks: input.callbacks
        });
      } else if (maxTurnsReached) {
        const completion = {
          kind: "max_turns_reached" as const,
          reason: `Reached the configured ${input.runtimePolicy.agent.maxTurns}-turn limit while the issue remained active.`,
          maxTurns: input.runtimePolicy.agent.maxTurns
        };
        await publishRuntimeCompletion({
          workerSessionContract: input.workerSessionContract,
          runtimeLogs: input.runtimeLogs,
          sessionId: session.threadId,
          issueId: input.issue.id,
          issueIdentifier: input.issue.identifier,
          runId: input.runId,
          attempt: input.attempt,
          runMode: input.runMode,
          completion,
          callbacks: input.callbacks
        });
      } else {
        const completion = missingExplicitCompletion();
        await publishRuntimeCompletion({
          workerSessionContract: input.workerSessionContract,
          runtimeLogs: input.runtimeLogs,
          sessionId: session.threadId,
          issueId: input.issue.id,
          issueIdentifier: input.issue.identifier,
          runId: input.runId,
          attempt: input.attempt,
          runMode: input.runMode,
          completion,
          callbacks: input.callbacks
        });
      }
    }
  } catch (error) {
    if (input.activeRun.completionOverride) {
      await finalizeTurnForDetectedCompletion({
        runStore: input.runStore,
        runId: input.runId,
        persistedTurnId
      });
      await reportCompletionOverride({
        activeRun: input.activeRun,
        runtimeLogs: input.runtimeLogs,
        workerSessionContract: input.workerSessionContract,
        sessionId: workerSessionId,
        issueId: input.issue.id,
        issueIdentifier: input.issue.identifier,
        runId: input.runId,
        attempt: input.attempt,
        runMode: input.runMode,
        callbacks: input.callbacks,
        launchTarget: input.launchTarget,
        runtimePolicy: input.runtimePolicy,
        runStore: input.runStore
      });
      return;
    }

    if (input.activeRun.stopped) {
      await finalizeStoppedTurn({
        runStore: input.runStore,
        runId: input.runId,
        persistedTurnId
      });
      return;
    }

    const reason = error instanceof Error ? error.message : String(error);
    const harnessError = error instanceof HarnessSessionError ? error : null;
    const runtimeFailure = classifyHarnessExecutionFailure({
      error,
      providerId: sessionProviderId
    });

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
      await recordRunRepoEndSnapshot({
        runStore: input.runStore,
        runId: input.runId,
        launchTarget: input.launchTarget,
        timeoutMs: input.runtimePolicy.hooks.timeoutMs
      });
    }

    const startupFailure = classifyStartupFailure(error);
    await input.runtimeLogs.record({
      level: runtimeFailure?.level ?? "error",
      source: "agent_runtime",
      eventType: startupFailure
        ? "runtime_startup_failed"
        : (runtimeFailure?.eventType ?? "runtime_execution_failed"),
      message: startupFailure
        ? "Agent runtime startup failed."
        : (runtimeFailure?.message ?? "Agent runtime execution failed."),
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
        diagnostics: harnessError ? toJsonValue(harnessError.detail) : null,
        ...(runtimeFailure?.payload ?? {})
      }
    });

    const completion = startupFailure
      ? {
          kind: "startup_failure" as const,
          reason,
          failureStage: startupFailure.failureStage,
          failureOrigin: startupFailure.failureOrigin,
          launchTarget: input.launchTarget
        }
      : (runtimeFailure?.completion ??
        (isRateLimitedError(error)
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
              }));

    await publishRuntimeCompletion({
      workerSessionContract: input.workerSessionContract,
      runtimeLogs: input.runtimeLogs,
      sessionId: workerSessionId,
      issueId: input.issue.id,
      issueIdentifier: input.issue.identifier,
      runId: input.runId,
      attempt: input.attempt,
      runMode: input.runMode,
      completion,
      callbacks: input.callbacks
    });
  } finally {
    if (activeTurnProjection) {
      await activeTurnProjection.flushCommandProfiles();
    }
    input.activeRun.client?.close();
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
export { isTransientProviderError };
