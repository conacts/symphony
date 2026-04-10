import {
  issueMatchesDispatchableState,
  issueMatchesTerminalState,
  issueBranchName,
  type SymphonyTrackerConfig,
  type SymphonyTracker,
  type SymphonyTrackerIssue
} from "@symphony/tracker";
import type {
  PreparedWorkspace,
  WorkspaceBackend,
  WorkspaceContext
} from "@symphony/workspace";
import type {
  AgentRuntime,
  AgentRuntimeLaunchTarget
} from "./agent-runtime.js";
import {
  accumulateAgentTotals,
  createSymphonyOrchestratorSnapshot,
  createSymphonyOrchestratorState,
  systemClock
} from "./symphony-orchestrator-state.js";
import {
  applyAgentRuntimeUpdateToEntry,
  createRunningEntry,
  resolveDispatchBootstrap
} from "./symphony-orchestrator-dispatch.js";
import {
  classifyStartupFailureOrigin,
  extractWorkspaceManifestLifecycleFailure,
  isFatalRuntimeError
} from "./symphony-orchestrator-failures.js";
import {
  isSymphonyDispatchCancelledError,
  SymphonyDispatchCancelledError,
  isSymphonyDispatchRefusedError
} from "./symphony-orchestrator-errors.js";
import {
  type SymphonyRunMode
} from "@symphony/runtime-contract";
import {
  createRetryEntry,
  stateSlotsAvailable
} from "./symphony-orchestrator-retries.js";
import {
  workspaceCleanupModeForIssue,
  cleanupWorkspaceAndRecordLifecycle,
  handleStartupFailure,
  leaveFailureComment
} from "./symphony-orchestrator-lifecycle.js";
import { reconcileStalledRunningIssues } from "./symphony-orchestrator-monitoring.js";
import {
  buildWorkspaceLifecyclePayload,
  createWorkspaceLifecycleRecorder,
  createWorkspaceRunnerOptions,
  recordDockerContainerPrepareEvent
} from "./symphony-orchestrator-workspace.js";
import type { SymphonyOrchestratorConfig } from "./orchestrator-config.js";
import type { SymphonyFailureStateTransition } from "./symphony-orchestrator-comments.js";
import type {
  SymphonyAgentRuntimeCompletion,
  SymphonyAgentRuntimeUpdate,
  SymphonyClock,
  SymphonyDispatchStopRequest,
  SymphonyDispatchBootstrapRouter,
  SymphonyOrchestratorObserver,
  SymphonyOrchestratorSnapshot,
  SymphonyOrchestratorState,
  SymphonyStartupFailureStage
} from "./symphony-orchestrator-types.js";

const maxProviderTransientRetries = 3;

export { createSymphonyOrchestratorState } from "./symphony-orchestrator-state.js";
export { prepareIssueForDispatch } from "./symphony-orchestrator-dispatch.js";

export class SymphonyOrchestrator {
  readonly #config: SymphonyOrchestratorConfig;
  readonly #tracker: SymphonyTracker;
  readonly #workspaceBackend: WorkspaceBackend;
  readonly #agentRuntime: AgentRuntime;
  readonly #observer: SymphonyOrchestratorObserver | null;
  readonly #clock: SymphonyClock;
  readonly #runnerEnv: Record<string, string | undefined> | undefined;
  readonly #dispatchBootstrapRouter: SymphonyDispatchBootstrapRouter | null;
  #state: SymphonyOrchestratorState;

  constructor(input: {
    config: SymphonyOrchestratorConfig;
    tracker: SymphonyTracker;
    workspaceBackend: WorkspaceBackend;
    agentRuntime: AgentRuntime;
    observer?: SymphonyOrchestratorObserver;
    clock?: SymphonyClock;
    runnerEnv?: Record<string, string | undefined>;
    dispatchBootstrapRouter?: SymphonyDispatchBootstrapRouter | null;
  }) {
    this.#config = input.config;
    this.#tracker = input.tracker;
    this.#workspaceBackend = input.workspaceBackend;
    this.#agentRuntime = input.agentRuntime;
    this.#observer = input.observer ?? null;
    this.#clock = input.clock ?? systemClock;
    this.#runnerEnv = input.runnerEnv;
    this.#dispatchBootstrapRouter = input.dispatchBootstrapRouter ?? null;
    this.#state = createSymphonyOrchestratorState(
      input.config,
      this.#clock
    );
  }

  get state(): SymphonyOrchestratorState {
    return this.#state;
  }

  snapshot(): SymphonyOrchestratorSnapshot {
    return createSymphonyOrchestratorSnapshot(this.#state, this.#clock);
  }

  async shutdownActiveRuns(reason: string): Promise<number> {
    const runningIssueIds = Object.keys(this.#state.running);
    const dispatchingIssueIds = Object.keys(this.#state.dispatching);

    for (const issueId of runningIssueIds) {
      const runningEntry = this.#state.running[issueId];
      if (!runningEntry) {
        continue;
      }

      await this.#agentRuntime.stopRun({
        issue: runningEntry.issue,
        workspace: runningEntry.workspace,
        cleanupMode: "preserve"
      });
      await this.handleRunCompletion(issueId, {
        kind: "failure",
        reason
      });
    }

    for (const issueId of dispatchingIssueIds) {
      await this.#drainDispatchingIssueOnShutdown(issueId, reason);
    }

    return runningIssueIds.length + dispatchingIssueIds.length;
  }

  async runPollCycle(): Promise<SymphonyOrchestratorSnapshot> {
    this.#state.pollCheckInProgress = true;
    try {
      await this.reconcileRunningIssues();
      await this.#dispatchDueRetries();

      if (this.availableSlots() > 0) {
        const issues = await this.#tracker.fetchCandidateIssues(
          this.#config.tracker
        );

        for (const issue of issues) {
          if (!this.shouldDispatchIssue(issue)) {
            continue;
          }

          await this.dispatchIssue(issue, 1);

          if (this.availableSlots() <= 0) {
            break;
          }
        }
      }

      this.#state.nextPollDueAtMs =
        this.#clock.nowMs() + this.#config.polling.intervalMs;

      return this.snapshot();
    } finally {
      this.#state.pollCheckInProgress = false;
    }
  }

  async reconcileRunningIssues(): Promise<void> {
    await reconcileStalledRunningIssues({
      config: this.#config,
      state: this.#state,
      agentRuntime: this.#agentRuntime,
      clock: this.#clock,
      handleRunCompletion: (issueId, completion) =>
        this.handleRunCompletion(issueId, completion)
    });
    await this.#reconcileDispatchingIssues();
    const runningIssueIds = Object.keys(this.#state.running);
    if (runningIssueIds.length === 0) {
      return;
    }

    const refreshed = await this.#tracker.fetchIssueStatesByIds(
      this.#config.tracker,
      runningIssueIds
    );
    const refreshedById = new Map(refreshed.map((issue) => [issue.id, issue]));

    for (const issueId of runningIssueIds) {
      const runningEntry = this.#state.running[issueId];
      if (!runningEntry) {
        continue;
      }

      const refreshedIssue = refreshedById.get(issueId);
      if (!refreshedIssue) {
        await this.#terminateRunningIssue(issueId, "destroy");
        continue;
      }

      if (issueMatchesTerminalState(refreshedIssue, this.#config.tracker)) {
        await this.#terminateRunningIssue(issueId, "destroy", refreshedIssue);
        continue;
      }

      if (
        !canIssueContinueRun({
          issue: refreshedIssue,
          runMode: runningEntry.runMode,
          tracker: this.#config.tracker
        })
      ) {
        await this.#terminateRunningIssue(
          issueId,
          workspaceCleanupModeForIssue({
            issue: refreshedIssue,
            tracker: this.#config.tracker
          }),
          refreshedIssue
        );
        continue;
      }

      this.#state.running[issueId] = {
        ...runningEntry,
        issue: refreshedIssue
      };
    }
  }

  shouldDispatchIssue(issue: SymphonyTrackerIssue): boolean {
    if (
      this.#state.dispatching[issue.id] ||
      this.#state.running[issue.id] ||
      this.#state.retryAttempts[issue.id] ||
      this.#state.claimed.has(issue.id) ||
      this.#state.completed.has(issue.id)
    ) {
      return false;
    }

    if (!issue.assignedToWorker) {
      return false;
    }

    if (
      !issueMatchesDispatchableState(issue, this.#config.tracker) ||
      issueMatchesTerminalState(issue, this.#config.tracker)
    ) {
      return false;
    }

    return (
      this.availableSlots() > 0 &&
      stateSlotsAvailable(
        this.#state,
        issue.state,
        this.#config.agent.maxConcurrentAgentsByState
      )
    );
  }

  availableSlots(): number {
    return Math.max(
      0,
      this.#state.maxConcurrentAgents -
        (Object.keys(this.#state.running).length +
          Object.keys(this.#state.dispatching).length)
    );
  }

  async dispatchIssue(
    issue: SymphonyTrackerIssue,
    attempt: number,
    preferredWorkerHost: string | null = null,
    runModeOverride?: SymphonyRunMode
  ): Promise<void> {
    if (attempt < 1) {
      throw new Error(`Dispatch attempt must be >= 1. Received ${attempt}.`);
    }

    this.#state.claimed.add(issue.id);

    const startedAt = this.#clock.now().toISOString();
    const bootstrap = await resolveDispatchBootstrap({
      config: this.#config,
      tracker: this.#tracker,
      issue,
      attempt,
      preferredWorkerHost,
      startedAt,
      runModeOverride,
      dispatchBootstrapRouter: this.#dispatchBootstrapRouter
    });
    const runMode = bootstrap.runMode;
    this.#state.dispatching[issue.id] = {
      issue: bootstrap.issue,
      runId: null,
      runMode,
      workerHost: preferredWorkerHost,
      workspace: null,
      launchTarget: null,
      attempt,
      startedAt,
      phase: "claim",
      runtimeStarted: false,
      stopRequest: null,
      shutdownDrainCompleted: false
    };

    let preparedIssue = issue;
    let runId: string | null = null;
    let workspace: PreparedWorkspace | null = null;
    let launchTarget: AgentRuntimeLaunchTarget | null = null;
    let startupFailureStage: SymphonyStartupFailureStage = "workspace_prepare";

    try {
      preparedIssue = await this.#checkpointDispatchEligibility(issue.id);

      runId =
        (await this.#observer?.startRun({
          issue: preparedIssue,
          attempt,
          runMode,
          harness: this.#config.runtime.agent.harness,
          workspace: null,
          workerHost: preferredWorkerHost,
          startedAt
        })) ?? null;
      this.#setDispatchingEntry(issue.id, {
        issue: preparedIssue,
        runId
      });

      await this.#observer?.recordLifecycleEvent({
        issue: preparedIssue,
        runId,
        source: "orchestrator",
        eventType: "dispatch_started",
        message: "Dispatch started.",
        payload: {
          attempt,
          workerHost: preferredWorkerHost,
          runMode
        },
        recordedAt: startedAt
      });

      const dispatchSourceIssue = issue;
      preparedIssue = await this.#checkpointDispatchEligibility(issue.id);
      this.#setDispatchingEntry(issue.id, {
        issue: preparedIssue
      });

      const workspaceContext: WorkspaceContext = {
        trackerIssueId: preparedIssue.id,
        issueIdentifier: preparedIssue.identifier
      };
      (workspaceContext as WorkspaceContext & { repositoryKey?: string | null }).repositoryKey =
        resolveRepositoryLabel(preparedIssue.labels);
      (
        workspaceContext as WorkspaceContext & {
          branchName?: string | null;
        }
      ).branchName =
        preparedIssue.branchName ?? issueBranchName(preparedIssue.identifier);

      if (dispatchSourceIssue.state !== preparedIssue.state) {
        await this.#observer?.recordLifecycleEvent({
          issue: preparedIssue,
          runId,
          source: "tracker",
          eventType: "claim_transition",
          message: `Issue moved from ${dispatchSourceIssue.state} to ${preparedIssue.state}.`,
          payload: {
            fromState: dispatchSourceIssue.state,
            toState: preparedIssue.state
          },
          recordedAt: startedAt
        });
      }

      startupFailureStage = "runtime_launch";
      assertPiRuntimeHarness(this.#config.runtime.agent.harness);
      startupFailureStage = "workspace_prepare";
      this.#setDispatchingEntry(issue.id, {
        issue: preparedIssue,
        phase: "workspace_prepare"
      });
      await this.#observer?.recordLifecycleEvent({
        issue: preparedIssue,
        runId,
        source: "workspace",
        eventType: "workspace_prepare_started",
        message: "Preparing workspace for the run.",
        payload: {
          workerHost: preferredWorkerHost,
          runMode
        },
        recordedAt: this.#clock.now().toISOString()
      });
      workspace = await this.#workspaceBackend.prepareWorkspace({
        context: workspaceContext,
        runId,
        config: this.#config.workspace,
        hooks: this.#config.hooks,
        lifecycleRecorder: createWorkspaceLifecycleRecorder(
          this.#observer,
          preparedIssue,
          runId
        ),
        ...createWorkspaceRunnerOptions(this.#runnerEnv, preferredWorkerHost)
      });
      this.#setDispatchingEntry(issue.id, {
        issue: preparedIssue,
        workspace
      });

      await this.#observer?.recordLifecycleEvent({
        issue: preparedIssue,
        runId,
        source: "workspace",
        eventType: "workspace_prepare_completed",
        message:
          workspace.prepareDisposition === "created"
            ? "Workspace prepare completed with a new workspace."
            : "Workspace prepare completed with a reused workspace.",
        payload: {
          workspace: buildWorkspaceLifecyclePayload(workspace)
        }
      });
      await recordDockerContainerPrepareEvent({
        observer: this.#observer,
        issue: preparedIssue,
        runId,
        workspace
      });

      preparedIssue = await this.#checkpointDispatchEligibility(issue.id);
      this.#setDispatchingEntry(issue.id, {
        issue: preparedIssue,
        workspace,
        phase: "workspace_before_run"
      });
      startupFailureStage = "workspace_before_run";
      await this.#observer?.recordLifecycleEvent({
        issue: preparedIssue,
        runId,
        source: "workspace",
        eventType: "workspace_before_run_started",
        message: "Running workspace before_run hook.",
        payload: {
          workspace: buildWorkspaceLifecyclePayload(workspace)
        },
        recordedAt: this.#clock.now().toISOString()
      });
      const beforeRunResult = await this.#workspaceBackend.runBeforeRun({
        workspace,
        context: workspaceContext,
        hooks: this.#config.hooks,
        ...createWorkspaceRunnerOptions(this.#runnerEnv, preferredWorkerHost)
      });

      await this.#observer?.recordLifecycleEvent({
        issue: preparedIssue,
        runId,
        source: "workspace",
        eventType: "workspace_before_run_completed",
        message: "before_run hook completed.",
        payload: {
          hookKind: beforeRunResult.hookKind,
          hookOutcome: beforeRunResult.outcome,
          workspace: buildWorkspaceLifecyclePayload(workspace)
        }
      });

      preparedIssue = await this.#checkpointDispatchEligibility(issue.id);
      const activatedIssue = await this.#activatePreparedIssue({
        issue: preparedIssue,
        runId,
        runMode
      });
      this.#setDispatchingEntry(issue.id, {
        issue: activatedIssue,
        workspace,
        phase: "runtime_launch"
      });
      const runtimeLaunchIssue = await this.#checkpointDispatchEligibility(issue.id);

      startupFailureStage = "runtime_launch";
      await this.#observer?.recordLifecycleEvent({
        issue: runtimeLaunchIssue,
        runId,
        source: "orchestrator",
        eventType: "runtime_launch_starting",
        message: "Launching the agent runtime.",
        payload: {
          attempt,
          runMode,
          workerHost: preferredWorkerHost,
          workspace: buildWorkspaceLifecyclePayload(workspace)
        },
        recordedAt: this.#clock.now().toISOString()
      });
      const launch = await this.#agentRuntime.startRun({
        issue: runtimeLaunchIssue,
        runId,
        attempt,
        runMode,
        runtimePolicy: this.#config.runtime,
        workspace
      });
      const workerHost = launch.workerHost ?? workspace.workerHost;
      launchTarget = launch.launchTarget;
      this.#setDispatchingEntry(issue.id, {
        issue: runtimeLaunchIssue,
        workerHost,
        workspace,
        launchTarget,
        runtimeStarted: true
      });
      const activeIssue = await this.#checkpointDispatchEligibility(issue.id);

      delete this.#state.dispatching[issue.id];
      this.#state.running[activeIssue.id] = createRunningEntry({
        issue: activeIssue,
        runId,
        runMode,
        threadId: launch.threadId,
        workerHost,
        workspace,
        launchTarget,
        attempt,
        startedAt
      });

      await this.#observer?.recordLifecycleEvent({
        issue: activeIssue,
        runId,
        source: "orchestrator",
        eventType: "runtime_launch_requested",
        message: "Agent runtime launch requested.",
        payload: {
          threadId: launch.threadId,
          workerHost,
          launchTarget,
          workspace: buildWorkspaceLifecyclePayload(workspace)
        }
      });

    } catch (error) {
      if (isSymphonyDispatchCancelledError(error)) {
        await this.#cancelDispatchingIssue(issue.id);
        return;
      }

      if (isSymphonyDispatchRefusedError(error)) {
        this.#clearDispatchState(issue.id);
        await this.#observer?.recordLifecycleEvent({
          issue,
          runId: null,
          source: "orchestrator",
          eventType: "dispatch_refused_active_run",
          message: "Dispatch refused because the issue already has an active run.",
          payload: {
            activeRunId: error.activeRunId,
            activeRunStatus: error.activeRunStatus
          },
          recordedAt: this.#clock.now().toISOString()
        });
        return;
      }

      if (isFatalRuntimeError(error)) {
        this.#clearDispatchState(issue.id);
        throw error;
      }

      this.#clearDispatchState(issue.id);

      const reason = String(error);
      const failureOrigin = classifyStartupFailureOrigin(
        error,
        startupFailureStage,
        this.#workspaceBackend.kind
      );
      const manifestLifecycleFailure =
        extractWorkspaceManifestLifecycleFailure(error);

      await this.#observer?.recordLifecycleEvent({
        issue: preparedIssue,
        runId,
        source: "orchestrator",
        eventType: "runtime_startup_failed",
        message: "Dispatch failed before the agent run became active.",
        payload: {
          reason,
          failureStage: startupFailureStage,
          failureOrigin,
          manifestLifecyclePhase:
            manifestLifecycleFailure?.manifestLifecyclePhase ?? null,
          manifestLifecycleStepName:
            manifestLifecycleFailure?.manifestLifecycleStepName ?? null,
          manifestLifecycle:
            manifestLifecycleFailure?.manifestLifecycle ?? null,
          launchTarget,
          workspace: buildWorkspaceLifecyclePayload(workspace)
        }
      });

      await this.#observer?.finalizeRun({
        issue: preparedIssue,
        runId,
        completion: {
          kind: "startup_failure",
          reason,
          failureStage: startupFailureStage,
          failureOrigin,
          launchTarget,
          manifestLifecyclePhase:
            manifestLifecycleFailure?.manifestLifecyclePhase ?? null,
          manifestLifecycleStepName:
            manifestLifecycleFailure?.manifestLifecycleStepName ?? null,
          manifestLifecycle:
            manifestLifecycleFailure?.manifestLifecycle ?? null
        },
        workerHost: preferredWorkerHost,
        workspace,
        startedAt,
        endedAt: this.#clock.now().toISOString(),
        turnCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
      });

      await handleStartupFailure({
        config: this.#config,
        tracker: this.#tracker,
        workspaceBackend: this.#workspaceBackend,
        observer: this.#observer,
        runnerEnv: this.#runnerEnv,
        issue: preparedIssue,
        workerHost: preferredWorkerHost,
        workspace,
        reason,
        runId,
        completion: {
          kind: "startup_failure",
          reason,
          failureStage: startupFailureStage,
          failureOrigin,
          launchTarget
        }
      });
    }
  }

  applyAgentUpdate(issueId: string, update: SymphonyAgentRuntimeUpdate): void {
    const runningEntry = this.#state.running[issueId];
    if (!runningEntry) {
      return;
    }

    const next = applyAgentRuntimeUpdateToEntry(runningEntry, update);

    if (next.rateLimits) {
      this.#state.rateLimits = next.rateLimits;
    }

    this.#state.running[issueId] = next.entry;
  }

  async handleRunCompletion(
    issueId: string,
    completion: SymphonyAgentRuntimeCompletion
  ): Promise<void> {
    const runningEntry = this.#state.running[issueId];
    if (!runningEntry) {
      return;
    }

    this.#state = accumulateAgentTotals(this.#state, runningEntry, this.#clock);
    delete this.#state.running[issueId];
    this.#state.claimed.delete(issueId);

    if (runningEntry.workspace) {
      const afterRunContext: WorkspaceContext = {
        trackerIssueId: issueId,
        issueIdentifier: runningEntry.issue.identifier
      };
      (afterRunContext as WorkspaceContext & { repositoryKey?: string | null }).repositoryKey =
        resolveRepositoryLabel(runningEntry.issue.labels);
      const afterRunResult = await this.#workspaceBackend.runAfterRun({
        workspace: runningEntry.workspace,
        context: afterRunContext,
        hooks: this.#config.hooks,
        ...createWorkspaceRunnerOptions(this.#runnerEnv, runningEntry.workerHost)
      });
      await this.#observer?.recordLifecycleEvent({
        issue: runningEntry.issue,
        runId: runningEntry.runId,
        source: "workspace",
        eventType:
          afterRunResult.outcome === "failed_ignored"
            ? "workspace_after_run_failed_ignored"
            : "workspace_after_run_completed",
        message:
          afterRunResult.outcome === "failed_ignored"
            ? "after_run hook failed and was ignored."
            : afterRunResult.outcome === "completed"
              ? "after_run hook completed."
              : "after_run hook was skipped.",
        payload: {
          hookKind: afterRunResult.hookKind,
          hookOutcome: afterRunResult.outcome,
          workspace: buildWorkspaceLifecyclePayload(runningEntry.workspace)
        }
      });
    }

    let currentIssue = await this.#refreshIssue(runningEntry.issue);
    let resolvedCompletion = completion;

    if (
      runningEntry.runMode === "approved_merge" &&
      completion.kind === "merged"
    ) {
      const mergeResolution = await this.#resolveApprovedMergeSuccess({
        runningEntry,
        completion,
        currentIssue
      });
      currentIssue = mergeResolution.currentIssue;
      resolvedCompletion = mergeResolution.completion;
    }

    await this.#observer?.finalizeRun({
      issue: runningEntry.issue,
      runId: runningEntry.runId,
      completion: resolvedCompletion,
      workerHost: runningEntry.workerHost,
      workspace: runningEntry.workspace,
      startedAt: runningEntry.startedAt,
      endedAt: this.#clock.now().toISOString(),
      turnCount: runningEntry.turnCount,
      inputTokens: runningEntry.agentInputTokens,
      outputTokens: runningEntry.agentOutputTokens,
      totalTokens: runningEntry.agentTotalTokens
    });
    const cleanupMode = workspaceCleanupModeForIssue({
      issue: currentIssue,
      tracker: this.#config.tracker
    });

    if (resolvedCompletion.kind === "blocked") {
      const blockedIssueBefore = currentIssue ?? runningEntry.issue;
      currentIssue = await this.#transitionIssueState({
        issue: blockedIssueBefore,
        targetState: this.#config.tracker.blockedTransitionToState,
        runId: runningEntry.runId,
        eventType: "blocked_transition",
        message: "Issue moved to Blocked after the run reported a repo or workspace blocker.",
        payload: {
          reason: resolvedCompletion.reason,
          completionKind: resolvedCompletion.kind
        },
        swallowErrors: true
      });
      const blockedCleanupMode = workspaceCleanupModeForIssue({
        issue: currentIssue ?? runningEntry.issue,
        tracker: this.#config.tracker
      });
      await leaveFailureComment({
        tracker: this.#tracker,
        observer: this.#observer,
        issue: currentIssue ?? runningEntry.issue,
        reason: resolvedCompletion.reason,
        outcome: "blocked_repo",
        runId: runningEntry.runId,
        options: {
          stateTransition: describeFailureStateTransition({
            beforeIssue: blockedIssueBefore,
            afterIssue: currentIssue ?? blockedIssueBefore,
            targetState: this.#config.tracker.blockedTransitionToState
          }),
          workspaceCleanupMode: blockedCleanupMode
        }
      });

      await this.#cleanupStoppedRun({
        issue: currentIssue ?? runningEntry.issue,
        runId: runningEntry.runId,
        workspace: runningEntry.workspace,
        workerHost: runningEntry.workerHost,
        completionKind: resolvedCompletion.kind,
        mode: blockedCleanupMode
      });
      return;
    }

    if (
      resolvedCompletion.kind === "delivered" ||
      resolvedCompletion.kind === "merged" ||
      resolvedCompletion.kind === "max_turns_reached"
    ) {
      if (
        runningEntry.runMode === "approved_merge" &&
        (resolvedCompletion.kind === "merged" ||
          resolvedCompletion.kind === "max_turns_reached")
      ) {
        await this.#handleApprovedMergeCompletion({
          runningEntry,
          completion: resolvedCompletion,
          currentIssue
        });
        return;
      }

      if (resolvedCompletion.kind === "max_turns_reached") {
        const pausedIssueBefore = currentIssue ?? runningEntry.issue;
        currentIssue = await this.#transitionIssueState({
          issue: pausedIssueBefore,
          targetState: this.#config.tracker.pauseTransitionToState,
          runId: runningEntry.runId,
          eventType: "pause_transition",
          message: "Issue moved to the paused state after hitting the max-turn limit.",
          payload: {
            reason: resolvedCompletion.reason
          },
          swallowErrors: true
        });
        const pausedCleanupMode = workspaceCleanupModeForIssue({
          issue: currentIssue ?? runningEntry.issue,
          tracker: this.#config.tracker
        });
        await leaveFailureComment({
          tracker: this.#tracker,
          observer: this.#observer,
          issue: currentIssue ?? runningEntry.issue,
          reason: resolvedCompletion.reason,
          outcome: "paused_max_turns",
          runId: runningEntry.runId,
          options: {
            rateLimits: runningEntry.lastRateLimits,
            stateTransition: describeFailureStateTransition({
              beforeIssue: pausedIssueBefore,
              afterIssue: currentIssue ?? pausedIssueBefore,
              targetState: this.#config.tracker.pauseTransitionToState
            }),
            workspaceCleanupMode: pausedCleanupMode
          }
        });
      }

      await this.#cleanupStoppedRun({
        issue: currentIssue ?? runningEntry.issue,
        runId: runningEntry.runId,
        workspace: runningEntry.workspace,
        workerHost: runningEntry.workerHost,
        completionKind: resolvedCompletion.kind,
        mode:
          resolvedCompletion.kind === "max_turns_reached"
            ? workspaceCleanupModeForIssue({
                issue: currentIssue ?? runningEntry.issue,
                tracker: this.#config.tracker
              })
            : cleanupMode
      });
      return;
    }

    if (resolvedCompletion.kind === "startup_failure") {
      await this.#observer?.recordLifecycleEvent({
        issue: runningEntry.issue,
        runId: runningEntry.runId,
        source: "runtime",
        eventType: "runtime_startup_failed",
        message: "Agent runtime startup failed before the run became active.",
        payload: {
          reason: resolvedCompletion.reason,
          failureStage: resolvedCompletion.failureStage,
          failureOrigin: resolvedCompletion.failureOrigin,
          manifestLifecyclePhase: resolvedCompletion.manifestLifecyclePhase ?? null,
          manifestLifecycleStepName: resolvedCompletion.manifestLifecycleStepName ?? null,
          manifestLifecycle: resolvedCompletion.manifestLifecycle ?? null,
          launchTarget: resolvedCompletion.launchTarget ?? runningEntry.launchTarget ?? null,
          workspace: buildWorkspaceLifecyclePayload(runningEntry.workspace)
        }
      });
      await handleStartupFailure({
        config: this.#config,
        tracker: this.#tracker,
        workspaceBackend: this.#workspaceBackend,
        observer: this.#observer,
        runnerEnv: this.#runnerEnv,
        issue: runningEntry.issue,
        workerHost: runningEntry.workerHost,
        workspace: runningEntry.workspace,
        reason: resolvedCompletion.reason,
        runId: runningEntry.runId,
        completion: resolvedCompletion
      });
      return;
    }

    if (
      resolvedCompletion.kind === "provider_transient" &&
      runningEntry.retryAttempt < maxProviderTransientRetries
    ) {
      await this.#scheduleTransientProviderRetry(runningEntry, resolvedCompletion.reason);
      await this.#cleanupStoppedRun({
        issue: currentIssue ?? runningEntry.issue,
        runId: runningEntry.runId,
        workspace: runningEntry.workspace,
        workerHost: runningEntry.workerHost,
        completionKind: resolvedCompletion.kind,
        mode: "preserve"
      });
      return;
    }

    if (
      runningEntry.runMode === "approved_merge" &&
      resolvedCompletion.kind === "merge_blocked"
    ) {
      const blockedIssueBefore = currentIssue ?? runningEntry.issue;
      currentIssue = await this.#transitionIssueState({
        issue: blockedIssueBefore,
        targetState: this.#config.tracker.blockedTransitionToState,
        runId: runningEntry.runId,
        eventType: "blocked_transition",
        message: "Issue moved to Blocked after merge automation reported a blocked merge result.",
        payload: {
          reason: resolvedCompletion.reason,
          completionKind: resolvedCompletion.kind,
          runMode: runningEntry.runMode
        },
        swallowErrors: true
      });
      const blockedCleanupMode = workspaceCleanupModeForIssue({
        issue: currentIssue,
        tracker: this.#config.tracker
      });
      await leaveFailureComment({
        tracker: this.#tracker,
        observer: this.#observer,
        issue: currentIssue,
        reason: resolvedCompletion.reason,
        outcome: "blocked_merge",
        runId: runningEntry.runId,
        options: {
          stateTransition: describeFailureStateTransition({
            beforeIssue: blockedIssueBefore,
            afterIssue: currentIssue,
            targetState: this.#config.tracker.blockedTransitionToState
          }),
          workspaceCleanupMode: blockedCleanupMode
        }
      });

      await this.#cleanupStoppedRun({
        issue: currentIssue,
        runId: runningEntry.runId,
        workspace: runningEntry.workspace,
        workerHost: runningEntry.workerHost,
        completionKind: resolvedCompletion.kind,
        mode: blockedCleanupMode
      });
      return;
    }

    if (
      runningEntry.runMode === "approved_merge" &&
      (resolvedCompletion.kind === "failure" || resolvedCompletion.kind === "stalled")
    ) {
      const blockedIssueBefore = currentIssue ?? runningEntry.issue;
      currentIssue = await this.#transitionIssueState({
        issue: blockedIssueBefore,
        targetState: this.#config.tracker.blockedTransitionToState,
        runId: runningEntry.runId,
        eventType: "blocked_transition",
        message:
          resolvedCompletion.kind === "stalled"
            ? "Issue moved to Blocked after merge automation stalled."
            : "Issue moved to Blocked after merge automation could not complete safely.",
        payload: {
          reason: resolvedCompletion.reason,
          completionKind: resolvedCompletion.kind,
          runMode: runningEntry.runMode
        },
        swallowErrors: true
      });
      const blockedCleanupMode = workspaceCleanupModeForIssue({
        issue: currentIssue,
        tracker: this.#config.tracker
      });

      await leaveFailureComment({
        tracker: this.#tracker,
        observer: this.#observer,
        issue: currentIssue,
        reason: resolvedCompletion.reason,
        outcome:
          resolvedCompletion.kind === "stalled"
            ? "blocked_merge_stalled"
            : "blocked_merge_failure",
        runId: runningEntry.runId,
        options: {
          stateTransition: describeFailureStateTransition({
            beforeIssue: blockedIssueBefore,
            afterIssue: currentIssue,
            targetState: this.#config.tracker.blockedTransitionToState
          }),
          workspaceCleanupMode: blockedCleanupMode
        }
      });

      await this.#cleanupStoppedRun({
        issue: currentIssue,
        runId: runningEntry.runId,
        workspace: runningEntry.workspace,
        workerHost: runningEntry.workerHost,
        completionKind: resolvedCompletion.kind,
        mode: blockedCleanupMode
      });
      return;
    }

    const pausedIssueBefore = currentIssue ?? runningEntry.issue;
    currentIssue = await this.#transitionIssueState({
      issue: pausedIssueBefore,
      targetState: this.#config.tracker.pauseTransitionToState,
      runId: runningEntry.runId,
      eventType: "pause_transition",
      message:
        resolvedCompletion.kind === "rate_limited"
          ? "Issue moved to the paused state after a provider rate limit."
          : resolvedCompletion.kind === "provider_transient"
            ? "Issue moved to the paused state after transient provider failures exhausted the retry budget."
          : resolvedCompletion.kind === "stalled"
            ? "Issue moved to the paused state after the run stalled."
            : "Issue moved to the paused state after a runtime failure.",
      payload: {
        reason: resolvedCompletion.reason,
        completionKind: resolvedCompletion.kind
      },
      swallowErrors: true
    });
    const pausedCleanupMode = workspaceCleanupModeForIssue({
      issue: currentIssue ?? runningEntry.issue,
      tracker: this.#config.tracker
    });

    await leaveFailureComment({
      tracker: this.#tracker,
      observer: this.#observer,
      issue: currentIssue ?? runningEntry.issue,
      reason: resolvedCompletion.reason,
      outcome:
        resolvedCompletion.kind === "rate_limited"
          ? "rate_limited"
          : resolvedCompletion.kind === "provider_transient"
            ? "paused_provider_transient"
          : resolvedCompletion.kind === "stalled"
            ? "paused_stalled"
            : "paused_failure",
      runId: runningEntry.runId,
      options: {
        rateLimits: runningEntry.lastRateLimits,
        stateTransition: describeFailureStateTransition({
          beforeIssue: pausedIssueBefore,
          afterIssue: currentIssue ?? pausedIssueBefore,
          targetState: this.#config.tracker.pauseTransitionToState
        }),
        workspaceCleanupMode: pausedCleanupMode
      }
    });

    await this.#cleanupStoppedRun({
      issue: currentIssue ?? runningEntry.issue,
      runId: runningEntry.runId,
      workspace: runningEntry.workspace,
      workerHost: runningEntry.workerHost,
      completionKind: resolvedCompletion.kind,
      mode: workspaceCleanupModeForIssue({
        issue: currentIssue ?? runningEntry.issue,
        tracker: this.#config.tracker
      })
    });
  }

  async #transitionIssueState(input: {
    issue: SymphonyTrackerIssue;
    targetState: string | null;
    runId: string | null;
    eventType: string;
    message: string;
    payload?: Record<string, unknown>;
    swallowErrors?: boolean;
  }): Promise<SymphonyTrackerIssue> {
    if (
      !input.targetState ||
      input.issue.state.trim().toLowerCase() === input.targetState.trim().toLowerCase()
    ) {
      return input.issue;
    }

    try {
      await this.#tracker.updateIssueState(input.issue.id, input.targetState);
      const nextIssue = {
        ...input.issue,
        state: input.targetState
      };
      await this.#observer?.recordLifecycleEvent({
        issue: nextIssue,
        runId: input.runId,
        source: "tracker",
        eventType: input.eventType,
        message: input.message,
        payload: {
          fromState: input.issue.state,
          toState: input.targetState,
          ...(input.payload ?? {})
        }
      });
      return nextIssue;
    } catch (error) {
      await this.#observer?.recordLifecycleEvent({
        issue: input.issue,
        runId: input.runId,
        source: "tracker",
        eventType: `${input.eventType}_failed`,
        message: `Failed to move issue to ${input.targetState}.`,
        payload: {
          fromState: input.issue.state,
          toState: input.targetState,
          reason: error instanceof Error ? error.message : String(error),
          ...(input.payload ?? {})
        }
      });

      if (input.swallowErrors) {
        return input.issue;
      }

      throw error;
    }
  }

  async #refreshIssue(
    issue: SymphonyTrackerIssue
  ): Promise<SymphonyTrackerIssue | null> {
    const refreshed = await this.#tracker.fetchIssueStatesByIds(
      this.#config.tracker,
      [issue.id]
    );

    return refreshed[0] ?? null;
  }

  async #activatePreparedIssue(input: {
    issue: SymphonyTrackerIssue;
    runId: string | null;
    runMode: SymphonyRunMode;
  }): Promise<SymphonyTrackerIssue> {
    const normalizedState = normalizeStateName(input.issue.state);

    if (normalizedState === "bootstrapping") {
      return await this.#transitionIssueState({
        issue: input.issue,
        targetState: "In Progress",
        runId: input.runId,
        eventType: "bootstrap_transition",
        message: "Issue moved from Bootstrapping to In Progress.",
        payload: {
          fromState: input.issue.state,
          toState: "In Progress"
        }
      });
    }

    if (
      input.runMode === "approved_merge" &&
      normalizedState === "approved"
    ) {
      return await this.#transitionIssueState({
        issue: input.issue,
        targetState: "In Progress",
        runId: input.runId,
        eventType: "approved_merge_transition",
        message: "Issue moved from Approved to In Progress for merge automation.",
        payload: {
          fromState: input.issue.state,
          toState: "In Progress",
          runMode: input.runMode
        }
      });
    }

    return input.issue;
  }

  async #handleApprovedMergeCompletion(input: {
    runningEntry: SymphonyOrchestratorState["running"][string];
    completion: Extract<
      SymphonyAgentRuntimeCompletion,
      { kind: "merged" | "max_turns_reached" }
    >;
    currentIssue: SymphonyTrackerIssue | null;
  }): Promise<void> {
    let finalIssue = input.currentIssue ?? input.runningEntry.issue;

    if (input.completion.kind === "max_turns_reached") {
      const blockedIssueBefore = finalIssue;
      finalIssue = await this.#transitionIssueState({
        issue: blockedIssueBefore,
        targetState: this.#config.tracker.blockedTransitionToState,
        runId: input.runningEntry.runId,
        eventType: "blocked_transition",
        message: "Issue moved to Blocked after merge automation hit the max-turn limit.",
        payload: {
          reason: input.completion.reason,
          completionKind: input.completion.kind,
          runMode: input.runningEntry.runMode
        },
        swallowErrors: true
      });

      await leaveFailureComment({
        tracker: this.#tracker,
        observer: this.#observer,
        issue: finalIssue,
        reason: input.completion.reason,
        outcome: "blocked_merge_max_turns",
        runId: input.runningEntry.runId,
        options: {
          stateTransition: describeFailureStateTransition({
            beforeIssue: blockedIssueBefore,
            afterIssue: finalIssue,
            targetState: this.#config.tracker.blockedTransitionToState
          }),
          workspaceCleanupMode: workspaceCleanupModeForIssue({
            issue: finalIssue,
            tracker: this.#config.tracker
          })
        }
      });
    }

    await this.#cleanupStoppedRun({
      issue: finalIssue,
      runId: input.runningEntry.runId,
      workspace: input.runningEntry.workspace,
      workerHost: input.runningEntry.workerHost,
      completionKind: input.completion.kind,
      mode: workspaceCleanupModeForIssue({
        issue: finalIssue,
        tracker: this.#config.tracker
      })
    });
  }

  async #resolveApprovedMergeSuccess(input: {
    runningEntry: SymphonyOrchestratorState["running"][string];
    completion: Extract<SymphonyAgentRuntimeCompletion, { kind: "merged" }>;
    currentIssue: SymphonyTrackerIssue | null;
  }): Promise<{
    currentIssue: SymphonyTrackerIssue;
    completion: SymphonyAgentRuntimeCompletion;
  }> {
    const issue = input.currentIssue ?? input.runningEntry.issue;

    try {
      const finalIssue = await this.#transitionIssueState({
        issue,
        targetState: "Done",
        runId: input.runningEntry.runId,
        eventType: "done_transition",
        message: "Issue moved to Done after merge automation completed successfully.",
        payload: {
          completionKind: input.completion.kind,
          runMode: input.runningEntry.runMode
        }
      });

      return {
        currentIssue: finalIssue,
        completion: input.completion
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      return {
        currentIssue: issue,
        completion: {
          kind: "failure",
          reason: `Merge was recorded as merged, but Symphony could not move the issue to \`Done\`: ${reason}`
        }
      };
    }
  }

  async #dispatchDueRetries(): Promise<void> {
    const dueRetries = Object.entries(this.#state.retryAttempts)
      .sort(([, left], [, right]) => left.dueAtMs - right.dueAtMs)
      .filter(([, entry]) => entry.dueAtMs <= this.#clock.nowMs());

    for (const [issueId, retry] of dueRetries) {
      if (this.availableSlots() <= 0) {
        break;
      }

      const issue = await this.#tracker.fetchIssueByIdentifier(
        this.#config.tracker,
        retry.identifier
      );

      if (
        !issue ||
        !issue.assignedToWorker ||
        !issueMatchesDispatchableState(issue, this.#config.tracker) ||
        issueMatchesTerminalState(issue, this.#config.tracker)
      ) {
        delete this.#state.retryAttempts[issueId];
        continue;
      }

      delete this.#state.retryAttempts[issueId];
      await this.dispatchIssue(
        issue,
        retry.attempt,
        retry.workerHost,
        retry.runMode
      );
    }
  }

  async #scheduleTransientProviderRetry(
    runningEntry: SymphonyOrchestratorState["running"][string],
    reason: string
  ): Promise<void> {
    const nextAttempt = runningEntry.retryAttempt + 1;
    const retry = createRetryEntry({
      attempt: nextAttempt,
      nowMs: this.#clock.nowMs(),
      identifier: runningEntry.issue.identifier,
      runMode: runningEntry.runMode,
      error: reason,
      workerHost: runningEntry.workerHost,
      workspace: runningEntry.workspace,
      launchTarget: runningEntry.launchTarget,
      delayType: "failure",
      maxRetryBackoffMs: this.#config.agent.maxRetryBackoffMs
    });

    this.#state.retryAttempts[runningEntry.issue.id] = retry;

    await this.#observer?.recordLifecycleEvent({
      issue: runningEntry.issue,
      runId: runningEntry.runId,
      source: "orchestrator",
      eventType: "retry_scheduled",
      message: "Transient provider failure retry scheduled.",
      payload: {
        retryAttempt: retry.attempt,
        retryDueAt: new Date(retry.dueAtMs).toISOString(),
        delayType: retry.delayType,
        reason
      }
    });
  }

  async #cleanupStoppedRun(input: {
    issue: SymphonyTrackerIssue;
    runId: string | null;
    workspace: PreparedWorkspace | null;
    workerHost: string | null;
    completionKind: SymphonyAgentRuntimeCompletion["kind"];
    mode: "destroy" | "preserve";
  }): Promise<void> {
    if (!input.workspace) {
      return;
    }

    await cleanupWorkspaceAndRecordLifecycle({
      observer: this.#observer,
      workspaceBackend: this.#workspaceBackend,
      config: this.#config,
      runnerEnv: this.#runnerEnv,
      issue: input.issue,
      runId: input.runId,
      workspace: input.workspace,
      workerHost: input.workerHost,
      reason:
        input.mode === "destroy" ? "issue_stopped" : "issue_suspended",
      mode: input.mode
    });

    await this.#observer?.recordLifecycleEvent({
      issue: input.issue,
      runId: input.runId,
      source: "orchestrator",
      eventType:
        input.mode === "destroy"
          ? "workspace_destroyed_after_run"
          : "workspace_preserved_after_run",
      message:
        input.mode === "destroy"
          ? "Workspace destroyed after the run stopped."
          : "Workspace preserved after the run stopped.",
      payload: {
        completionKind: input.completionKind,
        workspace: buildWorkspaceLifecyclePayload(input.workspace)
      }
    });
  }

  #setDispatchingEntry(
    issueId: string,
    next: Partial<SymphonyOrchestratorState["dispatching"][string]>
  ): void {
    const existing = this.#state.dispatching[issueId];
    if (!existing || existing.shutdownDrainCompleted) {
      return;
    }

    this.#state.dispatching[issueId] = {
      ...existing,
      ...next
    };
  }

  #clearDispatchState(issueId: string): void {
    delete this.#state.dispatching[issueId];
    this.#state.claimed.delete(issueId);
  }

  async #reconcileDispatchingIssues(): Promise<void> {
    const dispatchingIssueIds = Object.keys(this.#state.dispatching);
    if (dispatchingIssueIds.length === 0) {
      return;
    }

    const refreshed = await this.#tracker.fetchIssueStatesByIds(
      this.#config.tracker,
      dispatchingIssueIds
    );
    const refreshedById = new Map(refreshed.map((issue) => [issue.id, issue]));

    for (const issueId of dispatchingIssueIds) {
      const dispatchingEntry = this.#state.dispatching[issueId];
      if (!dispatchingEntry) {
        continue;
      }

      const refreshedIssue = refreshedById.get(issueId) ?? null;
      const nextStopRequest = resolveDispatchStopRequest({
        issue: refreshedIssue,
        fallbackIssue: dispatchingEntry.issue,
        runMode: dispatchingEntry.runMode,
        tracker: this.#config.tracker
      });

      if (!nextStopRequest) {
        if (dispatchingEntry.stopRequest) {
          continue;
        }

        if (refreshedIssue) {
          this.#setDispatchingEntry(issueId, {
            issue: refreshedIssue
          });
        }
        continue;
      }

      const stopRequest = mergeDispatchStopRequests(
        dispatchingEntry.stopRequest,
        nextStopRequest
      );

      this.#setDispatchingEntry(issueId, {
        issue: stopRequest.issue,
        stopRequest
      });
    }
  }

  async #checkpointDispatchEligibility(
    issueId: string
  ): Promise<SymphonyTrackerIssue> {
    const dispatchingEntry = this.#state.dispatching[issueId];
    if (!dispatchingEntry) {
      throw new Error(`Dispatch entry missing for issue ${issueId}.`);
    }

    if (dispatchingEntry.stopRequest) {
      throw new SymphonyDispatchCancelledError({
        reason: dispatchingEntry.stopRequest.reason,
        issueIdentifier: dispatchingEntry.stopRequest.issue.identifier
      });
    }

    const refreshedIssue = await this.#refreshIssue(dispatchingEntry.issue);
    const stopRequest = resolveDispatchStopRequest({
      issue: refreshedIssue,
      fallbackIssue: dispatchingEntry.issue,
      runMode: dispatchingEntry.runMode,
      tracker: this.#config.tracker
    });
    if (stopRequest) {
      this.#setDispatchingEntry(issueId, {
        issue: stopRequest.issue,
        stopRequest
      });
      throw new SymphonyDispatchCancelledError({
        reason: stopRequest.reason,
        issueIdentifier: stopRequest.issue.identifier
      });
    }

    const activeIssue = refreshedIssue;
    if (!activeIssue) {
      throw new Error(`Dispatch checkpoint resolved without an active issue for ${issueId}.`);
    }

    this.#setDispatchingEntry(issueId, {
      issue: activeIssue
    });
    return activeIssue;
  }

  async #cancelDispatchingIssue(issueId: string): Promise<void> {
    const dispatchingEntry = this.#state.dispatching[issueId];
    if (!dispatchingEntry) {
      this.#clearDispatchState(issueId);
      return;
    }

    if (!dispatchingEntry.stopRequest) {
      throw new Error(`Dispatch stop requested without a stop reason for ${issueId}.`);
    }

    if (dispatchingEntry.shutdownDrainCompleted) {
      this.#clearDispatchState(issueId);
      return;
    }

    const effectiveIssue = dispatchingEntry.stopRequest.issue;
    const cleanupMode =
      dispatchingEntry.stopRequest.reason === "terminal"
        ? "destroy"
        : workspaceCleanupModeForIssue({
            issue: effectiveIssue,
            tracker: this.#config.tracker
          });

    if (dispatchingEntry.runtimeStarted) {
      await this.#agentRuntime.stopRun({
        issue: effectiveIssue,
        workspace: dispatchingEntry.workspace,
        cleanupMode
      });
    }

    await this.#observer?.recordLifecycleEvent({
      issue: effectiveIssue,
      runId: dispatchingEntry.runId,
      source: "orchestrator",
      eventType:
        dispatchingEntry.stopRequest.reason === "terminal"
          ? "run_stopped_terminal"
          : "run_stopped_inactive",
      message:
        dispatchingEntry.stopRequest.reason === "terminal"
          ? "Dispatch stopped because the issue entered a terminal state before runtime launch."
          : "Dispatch stopped because the issue became ineligible before runtime launch.",
      payload: {
        cleanupMode,
        duringDispatch: true,
        dispatchPhase: dispatchingEntry.phase,
        runtimeStarted: dispatchingEntry.runtimeStarted
      }
    });

    if (dispatchingEntry.workspace) {
      await cleanupWorkspaceAndRecordLifecycle({
        observer: this.#observer,
        workspaceBackend: this.#workspaceBackend,
        config: this.#config,
        runnerEnv: this.#runnerEnv,
        issue: effectiveIssue,
        runId: dispatchingEntry.runId,
        workspace: dispatchingEntry.workspace,
        workerHost: dispatchingEntry.workerHost,
        reason: cleanupMode === "destroy" ? "issue_stopped" : "issue_suspended",
        mode: cleanupMode
      });
    }

    this.#clearDispatchState(issueId);
  }

  async #drainDispatchingIssueOnShutdown(
    issueId: string,
    reason: string
  ): Promise<void> {
    const dispatchingEntry = this.#state.dispatching[issueId];
    if (!dispatchingEntry || dispatchingEntry.shutdownDrainCompleted) {
      return;
    }

    const stopRequest: SymphonyDispatchStopRequest =
      dispatchingEntry.stopRequest ?? {
        reason: "inactive",
        issue: dispatchingEntry.issue
      };
    const cleanupMode = "preserve";
    const shouldStopRuntime =
      dispatchingEntry.workspace !== null &&
      (dispatchingEntry.runtimeStarted ||
        dispatchingEntry.phase === "runtime_launch");

    this.#setDispatchingEntry(issueId, {
      stopRequest
    });
    this.#state.claimed.delete(issueId);

    if (shouldStopRuntime) {
      await this.#agentRuntime.stopRun({
        issue: stopRequest.issue,
        workspace: dispatchingEntry.workspace,
        cleanupMode
      });
    }

    await this.#observer?.recordLifecycleEvent({
      issue: stopRequest.issue,
      runId: dispatchingEntry.runId,
      source: "runtime",
      eventType: "runtime_shutdown_dispatch_drained",
      message:
        "Runtime shutdown drained a dispatch before the run became active.",
      payload: {
        shutdownReason: reason,
        dispatchPhase: dispatchingEntry.phase,
        runtimeStopAttempted: shouldStopRuntime,
        cleanupMode
      }
    });

    if (dispatchingEntry.workspace) {
      await cleanupWorkspaceAndRecordLifecycle({
        observer: this.#observer,
        workspaceBackend: this.#workspaceBackend,
        config: this.#config,
        runnerEnv: this.#runnerEnv,
        issue: stopRequest.issue,
        runId: dispatchingEntry.runId,
        workspace: dispatchingEntry.workspace,
        workerHost: dispatchingEntry.workerHost,
        reason: "issue_suspended",
        mode: cleanupMode
      });
    }

    const currentDispatchingEntry = this.#state.dispatching[issueId];
    if (!currentDispatchingEntry) {
      return;
    }

    this.#state.dispatching[issueId] = {
      ...currentDispatchingEntry,
      issue: stopRequest.issue,
      stopRequest,
      workspace: null,
      runtimeStarted: false,
      shutdownDrainCompleted: true
    };
  }

  async #terminateRunningIssue(
    issueId: string,
    cleanupMode: "destroy" | "preserve",
    refreshedIssue?: SymphonyTrackerIssue
  ): Promise<void> {
    const runningEntry = this.#state.running[issueId];
    if (!runningEntry) {
      return;
    }

    const effectiveIssue = refreshedIssue ?? runningEntry.issue;

    const stopReason = issueMatchesTerminalState(
      effectiveIssue,
      this.#config.tracker
    )
      ? "terminal"
      : "inactive";

    await this.#agentRuntime.stopRun({
      issue: effectiveIssue,
      workspace: runningEntry.workspace,
      cleanupMode
    });

    await this.#observer?.recordLifecycleEvent({
      issue: effectiveIssue,
      runId: runningEntry.runId,
      source: "orchestrator",
      eventType:
        stopReason === "terminal"
          ? "run_stopped_terminal"
          : "run_stopped_inactive",
      message:
        stopReason === "terminal"
          ? "Running issue stopped because it entered a terminal state."
          : "Running issue stopped because it became ineligible.",
      payload: {
        cleanupMode
      }
    });

    if (runningEntry.workspace) {
      await cleanupWorkspaceAndRecordLifecycle({
        observer: this.#observer,
        workspaceBackend: this.#workspaceBackend,
        config: this.#config,
        runnerEnv: this.#runnerEnv,
        issue: effectiveIssue,
        runId: runningEntry.runId,
        workspace: runningEntry.workspace,
        workerHost: runningEntry.workerHost,
        reason: cleanupMode === "destroy" ? "issue_stopped" : "issue_suspended",
        mode: cleanupMode
      });
    }

    delete this.#state.running[issueId];
    this.#state.claimed.delete(issueId);
  }
}

function canIssueContinueRun(input: {
  issue: SymphonyTrackerIssue;
  runMode: SymphonyRunMode;
  tracker: SymphonyTrackerConfig;
}): boolean {
  if (!input.issue.assignedToWorker) {
    return false;
  }

  if (issueMatchesTerminalState(input.issue, input.tracker)) {
    return false;
  }

  if (!issueMatchesDispatchableState(input.issue, input.tracker)) {
    return false;
  }

  const normalizedState = normalizeStateName(input.issue.state);
  if (input.runMode === "approved_merge") {
    return normalizedState === "approved" || normalizedState === "in progress";
  }

  return normalizedState !== "approved";
}

function resolveDispatchStopRequest(input: {
  issue: SymphonyTrackerIssue | null;
  fallbackIssue: SymphonyTrackerIssue;
  runMode: SymphonyRunMode;
  tracker: SymphonyTrackerConfig;
}): SymphonyDispatchStopRequest | null {
  if (!input.issue) {
    return {
      reason: "terminal",
      issue: input.fallbackIssue
    };
  }

  if (
    !canIssueContinueRun({
      issue: input.issue,
      runMode: input.runMode,
      tracker: input.tracker
    })
  ) {
    return {
      reason: issueMatchesTerminalState(input.issue, input.tracker)
        ? "terminal"
        : "inactive",
      issue: input.issue
    };
  }

  return null;
}

function mergeDispatchStopRequests(
  current: SymphonyDispatchStopRequest | null,
  next: SymphonyDispatchStopRequest
): SymphonyDispatchStopRequest {
  if (!current) {
    return next;
  }

  if (current.reason === "terminal") {
    return current;
  }

  return next.reason === "terminal" ? next : current;
}

function normalizeStateName(state: string | null | undefined): string {
  return state?.trim().toLowerCase() ?? "";
}

function describeFailureStateTransition(input: {
  beforeIssue: SymphonyTrackerIssue;
  afterIssue: SymphonyTrackerIssue;
  targetState: string | null;
}): SymphonyFailureStateTransition {
  if (!input.targetState) {
    return {
      kind: "none"
    };
  }

  if (normalizeStateName(input.afterIssue.state) === normalizeStateName(input.targetState)) {
    return {
      kind: "moved",
      targetState: input.targetState
    };
  }

  return {
    kind: "failed",
    targetState: input.targetState,
    reason: `Tracker state remained \`${input.afterIssue.state}\`.`
  };
}

function assertPiRuntimeHarness(
  harness: "pi"
): asserts harness is "pi" {
  if (harness === "pi") {
    return;
  }

  const error = new Error(
    `Runtime execution rejects legacy harness '${harness}' for launch/execute. Use agent.harness: "pi".`
  );
  Object.assign(error, {
    name: "SymphonyRuntimePolicyError",
    code: "invalid_workflow_config"
  });
  throw error;
}

function resolveRepositoryLabel(labels: string[]): string | null {
  for (const label of labels) {
    const normalizedLabel = label.trim().toLowerCase();
    if (!normalizedLabel.startsWith("repo:")) {
      continue;
    }

    const repositoryKey = normalizedLabel.slice("repo:".length).trim();
    if (repositoryKey.length > 0) {
      return repositoryKey;
    }
  }

  return null;
}
