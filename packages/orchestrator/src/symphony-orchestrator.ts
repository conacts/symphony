import {
  issueMatchesDispatchableState,
  issueMatchesTerminalState,
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
  accumulateCodexTotals,
  createSymphonyOrchestratorSnapshot,
  createSymphonyOrchestratorState,
  systemClock
} from "./symphony-orchestrator-state.js";
import {
  applyAgentRuntimeUpdateToEntry,
  createRunningEntry,
  prepareIssueForDispatch
} from "./symphony-orchestrator-dispatch.js";
import {
  classifyStartupFailureOrigin,
  extractWorkspaceManifestLifecycleFailure,
  isFatalRuntimeError
} from "./symphony-orchestrator-failures.js";
import {
  stateSlotsAvailable
} from "./symphony-orchestrator-retries.js";
import {
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
import type {
  SymphonyAgentRuntimeCompletion,
  SymphonyAgentRuntimeUpdate,
  SymphonyClock,
  SymphonyOrchestratorObserver,
  SymphonyOrchestratorSnapshot,
  SymphonyOrchestratorState,
  SymphonyStartupFailureStage
} from "./symphony-orchestrator-types.js";

export { createSymphonyOrchestratorState } from "./symphony-orchestrator-state.js";
export { prepareIssueForDispatch } from "./symphony-orchestrator-dispatch.js";
export type {
  SymphonyAgentRuntimeCompletion,
  SymphonyAgentRuntimeUpdate,
  SymphonyClock,
  SymphonyCodexMessage,
  SymphonyCodexTotals,
  SymphonyOrchestratorObserver,
  SymphonyOrchestratorSnapshot,
  SymphonyOrchestratorState,
  SymphonyRetryEntry,
  SymphonyRunningEntry,
  SymphonyStartupFailureOrigin,
  SymphonyStartupFailureStage
} from "./symphony-orchestrator-types.js";

export class SymphonyOrchestrator {
  readonly #config: SymphonyOrchestratorConfig;
  readonly #tracker: SymphonyTracker;
  readonly #workspaceBackend: WorkspaceBackend;
  readonly #agentRuntime: AgentRuntime;
  readonly #observer: SymphonyOrchestratorObserver | null;
  readonly #clock: SymphonyClock;
  readonly #runnerEnv: Record<string, string | undefined> | undefined;
  #state: SymphonyOrchestratorState;

  constructor(input: {
    config: SymphonyOrchestratorConfig;
    tracker: SymphonyTracker;
    workspaceBackend: WorkspaceBackend;
    agentRuntime: AgentRuntime;
    observer?: SymphonyOrchestratorObserver;
    clock?: SymphonyClock;
    runnerEnv?: Record<string, string | undefined>;
  }) {
    this.#config = input.config;
    this.#tracker = input.tracker;
    this.#workspaceBackend = input.workspaceBackend;
    this.#agentRuntime = input.agentRuntime;
    this.#observer = input.observer ?? null;
    this.#clock = input.clock ?? systemClock;
    this.#runnerEnv = input.runnerEnv;
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

  async runPollCycle(): Promise<SymphonyOrchestratorSnapshot> {
    this.#state.pollCheckInProgress = true;
    try {
      await this.reconcileRunningIssues();

      if (this.availableSlots() > 0) {
        const issues = await this.#tracker.fetchCandidateIssues(
          this.#config.tracker
        );

        for (const issue of issues) {
          if (!this.shouldDispatchIssue(issue)) {
            continue;
          }

          await this.dispatchIssue(issue, 0);

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
        await this.#terminateRunningIssue(issueId, false);
        continue;
      }

      if (issueMatchesTerminalState(refreshedIssue, this.#config.tracker)) {
        await this.#terminateRunningIssue(issueId, true);
        continue;
      }

      if (
        !refreshedIssue.assignedToWorker ||
        !issueMatchesDispatchableState(
          refreshedIssue,
          this.#config.tracker
        )
      ) {
        await this.#terminateRunningIssue(issueId, false);
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
      this.#state.running[issue.id] ||
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
      this.#state.maxConcurrentAgents - Object.keys(this.#state.running).length
    );
  }

  async dispatchIssue(
    issue: SymphonyTrackerIssue,
    attempt: number,
    preferredWorkerHost: string | null = null
  ): Promise<void> {
    const preparedIssue = await prepareIssueForDispatch(
      this.#config,
      this.#tracker,
      issue
    );
    const startedAt = this.#clock.now().toISOString();
    const runId =
      (await this.#observer?.startRun({
        issue: preparedIssue,
        attempt,
        workspace: null,
        workerHost: preferredWorkerHost,
        startedAt
      })) ?? null;

    const workspaceContext: WorkspaceContext = {
      issueId: preparedIssue.id,
      issueIdentifier: preparedIssue.identifier
    };

    if (issue.state !== preparedIssue.state) {
      await this.#observer?.recordLifecycleEvent({
        issue: preparedIssue,
        runId,
        source: "tracker",
        eventType: "claim_transition",
        message: `Issue moved from ${issue.state} to ${preparedIssue.state}.`,
        payload: {
          fromState: issue.state,
          toState: preparedIssue.state
        },
        recordedAt: startedAt
      });
    }

    await this.#observer?.recordLifecycleEvent({
      issue: preparedIssue,
      runId,
      source: "orchestrator",
      eventType: "dispatch_started",
      message: "Dispatch started.",
      payload: {
        attempt,
        workerHost: preferredWorkerHost
      },
      recordedAt: startedAt
    });

    let workspace: PreparedWorkspace | null = null;
    let launchTarget: AgentRuntimeLaunchTarget | null = null;
    let startupFailureStage: SymphonyStartupFailureStage = "workspace_prepare";

    try {
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

      startupFailureStage = "workspace_before_run";
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

      const activeIssue =
        preparedIssue.state.trim().toLowerCase() === "bootstrapping"
          ? await this.#transitionIssueState({
              issue: preparedIssue,
              targetState: "In Progress",
              runId,
              eventType: "bootstrap_transition",
              message: "Issue moved from Bootstrapping to In Progress.",
              payload: {
                fromState: preparedIssue.state,
                toState: "In Progress"
              }
            })
          : preparedIssue;

      startupFailureStage = "runtime_launch";
      const launch = await this.#agentRuntime.startRun({
        issue: activeIssue,
        runId,
        attempt,
        runtimePolicy: this.#config.runtime,
        workspace
      });
      const workerHost = launch.workerHost ?? workspace.workerHost;
      launchTarget = launch.launchTarget;

      this.#state.running[preparedIssue.id] = createRunningEntry({
        issue: activeIssue,
        runId,
        sessionId: launch.sessionId,
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
          sessionId: launch.sessionId,
          workerHost,
          launchTarget,
          workspace: buildWorkspaceLifecyclePayload(workspace)
        }
      });

      this.#state.claimed.add(preparedIssue.id);
    } catch (error) {
      if (isFatalRuntimeError(error)) {
        throw error;
      }

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

    this.#state = accumulateCodexTotals(this.#state, runningEntry, this.#clock);
    delete this.#state.running[issueId];
    this.#state.claimed.delete(issueId);

    if (runningEntry.workspace) {
      const afterRunResult = await this.#workspaceBackend.runAfterRun({
        workspace: runningEntry.workspace,
        context: {
          issueId,
          issueIdentifier: runningEntry.issue.identifier
        },
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

    await this.#observer?.finalizeRun({
      issue: runningEntry.issue,
      runId: runningEntry.runId,
      completion,
      workerHost: runningEntry.workerHost,
      workspace: runningEntry.workspace,
      startedAt: runningEntry.startedAt,
      endedAt: this.#clock.now().toISOString(),
      turnCount: runningEntry.turnCount,
      inputTokens: runningEntry.codexInputTokens,
      outputTokens: runningEntry.codexOutputTokens,
      totalTokens: runningEntry.codexTotalTokens
    });

    let currentIssue = await this.#refreshIssue(runningEntry.issue);
    const destroyWorkspace =
      currentIssue !== null &&
      issueMatchesTerminalState(currentIssue, this.#config.tracker);
    const cleanupMode = destroyWorkspace ? "destroy" : "preserve";

    if (completion.kind === "normal" || completion.kind === "max_turns_reached") {
      if (completion.kind === "max_turns_reached") {
        currentIssue = await this.#transitionIssueState({
          issue: currentIssue ?? runningEntry.issue,
          targetState: this.#config.tracker.pauseTransitionToState,
          runId: runningEntry.runId,
          eventType: "pause_transition",
          message: "Issue moved to the paused state after hitting the max-turn limit.",
          payload: {
            reason: completion.reason
          },
          swallowErrors: true
        });
        await leaveFailureComment({
          tracker: this.#tracker,
          observer: this.#observer,
          issue: currentIssue ?? runningEntry.issue,
          reason: completion.reason,
          outcome: "paused_max_turns",
          runId: runningEntry.runId,
          options: {
            rateLimits: runningEntry.lastRateLimits
          }
        });
      }

      await this.#cleanupStoppedRun({
        issue: currentIssue ?? runningEntry.issue,
        runId: runningEntry.runId,
        workspace: runningEntry.workspace,
        workerHost: runningEntry.workerHost,
        completionKind: completion.kind,
        mode:
          completion.kind === "max_turns_reached"
            ? "preserve"
            : cleanupMode
      });
      return;
    }

    if (completion.kind === "startup_failure") {
      await this.#observer?.recordLifecycleEvent({
        issue: runningEntry.issue,
        runId: runningEntry.runId,
        source: "runtime",
        eventType: "runtime_startup_failed",
        message: "Agent runtime startup failed before the run became active.",
        payload: {
          reason: completion.reason,
          failureStage: completion.failureStage,
          failureOrigin: completion.failureOrigin,
          manifestLifecyclePhase: completion.manifestLifecyclePhase ?? null,
          manifestLifecycleStepName: completion.manifestLifecycleStepName ?? null,
          manifestLifecycle: completion.manifestLifecycle ?? null,
          launchTarget: completion.launchTarget ?? runningEntry.launchTarget ?? null,
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
        reason: completion.reason,
        runId: runningEntry.runId,
        completion
      });
      return;
    }

    currentIssue = await this.#transitionIssueState({
      issue: currentIssue ?? runningEntry.issue,
      targetState: this.#config.tracker.pauseTransitionToState,
      runId: runningEntry.runId,
      eventType: "pause_transition",
      message:
        completion.kind === "rate_limited"
          ? "Issue moved to the paused state after a provider rate limit."
          : completion.kind === "stalled"
            ? "Issue moved to the paused state after the run stalled."
            : "Issue moved to the paused state after a runtime failure.",
      payload: {
        reason: completion.reason,
        completionKind: completion.kind
      },
      swallowErrors: true
    });

    await leaveFailureComment({
      tracker: this.#tracker,
      observer: this.#observer,
      issue: currentIssue ?? runningEntry.issue,
      reason: completion.reason,
      outcome:
        completion.kind === "rate_limited"
          ? "rate_limited"
          : completion.kind === "stalled"
            ? "paused_stalled"
            : "paused_failure",
      runId: runningEntry.runId,
      options: {
        rateLimits: runningEntry.lastRateLimits
      }
    });

    await this.#cleanupStoppedRun({
      issue: currentIssue ?? runningEntry.issue,
      runId: runningEntry.runId,
      workspace: runningEntry.workspace,
      workerHost: runningEntry.workerHost,
      completionKind: completion.kind,
      mode: "preserve"
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

  async #terminateRunningIssue(
    issueId: string,
    cleanupWorkspace: boolean
  ): Promise<void> {
    const runningEntry = this.#state.running[issueId];
    if (!runningEntry) {
      return;
    }

    await this.#agentRuntime.stopRun({
      issue: runningEntry.issue,
      workspace: runningEntry.workspace,
      cleanupWorkspace
    });

    await this.#observer?.recordLifecycleEvent({
      issue: runningEntry.issue,
      runId: runningEntry.runId,
      source: "orchestrator",
      eventType: cleanupWorkspace ? "run_stopped_terminal" : "run_stopped_inactive",
      message: cleanupWorkspace
        ? "Running issue stopped because it entered a terminal state."
        : "Running issue stopped because it became ineligible.",
      payload: {
        cleanupWorkspace
      }
    });

    if (cleanupWorkspace && runningEntry.workspace) {
      await cleanupWorkspaceAndRecordLifecycle({
        observer: this.#observer,
        workspaceBackend: this.#workspaceBackend,
        config: this.#config,
        runnerEnv: this.#runnerEnv,
        issue: runningEntry.issue,
        runId: runningEntry.runId,
        workspace: runningEntry.workspace,
        workerHost: runningEntry.workerHost,
        reason: cleanupWorkspace ? "issue_stopped" : "issue_suspended",
        mode: cleanupWorkspace ? "destroy" : "preserve"
      });
    } else if (runningEntry.workspace) {
      await cleanupWorkspaceAndRecordLifecycle({
        observer: this.#observer,
        workspaceBackend: this.#workspaceBackend,
        config: this.#config,
        runnerEnv: this.#runnerEnv,
        issue: runningEntry.issue,
        runId: runningEntry.runId,
        workspace: runningEntry.workspace,
        workerHost: runningEntry.workerHost,
        reason: "issue_suspended",
        mode: "preserve"
      });
    }

    delete this.#state.running[issueId];
    this.#state.claimed.delete(issueId);
  }
}
