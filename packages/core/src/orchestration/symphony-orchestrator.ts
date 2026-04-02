import { randomUUID } from "node:crypto";
import {
  issueMatchesDispatchableState,
  issueMatchesTerminalState,
  type SymphonyTracker,
  type SymphonyTrackerIssue
} from "../tracker/symphony-tracker.js";
import type {
  AgentRuntime,
  AgentRuntimeLaunchTarget
} from "../runtime/agent-runtime.js";
import type { SymphonyResolvedWorkflowConfig } from "../workflow/symphony-workflow.js";
import type { SymphonyJsonObject } from "../journal/symphony-run-journal-types.js";
import {
  summarizePreparedWorkspace,
  workspaceHostPath,
  type PreparedWorkspace,
  type WorkspaceBackend,
  type WorkspaceContext,
  type WorkspaceBackendKind,
  WorkspaceLifecycleMetadata
} from "../workspace/workspace-backend.js";
import {
  extractRateLimits,
  extractTokenUsage,
  isTerminalTurnEvent,
  runtimeSeconds,
  stallElapsedMs
} from "./symphony-orchestrator-codex-state.js";
import {
  buildFailureCommentBody,
  claimTransitionCommentBody,
  type SymphonyStartupFailureTransition
} from "./symphony-orchestrator-comments.js";

const continuationRetryDelayMs = 1_000;
const failureRetryBaseMs = 10_000;

export type SymphonyCodexMessage = {
  event: string;
  message: unknown;
  timestamp: string;
};

export type SymphonyCodexTotals = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  secondsRunning: number;
};

export type SymphonyStartupFailureStage =
  | "workspace_prepare"
  | "workspace_before_run"
  | "runtime_launch"
  | "runtime_session_start";

export type SymphonyStartupFailureOrigin =
  | "workspace_lifecycle"
  | "docker_lifecycle"
  | "runtime_launch"
  | "codex_startup";

export type SymphonyRunningEntry = {
  issue: SymphonyTrackerIssue;
  runId: string | null;
  sessionId: string | null;
  workerHost: string | null;
  workspace: PreparedWorkspace | null;
  launchTarget: AgentRuntimeLaunchTarget | null;
  workspacePath: string | null;
  retryAttempt: number;
  turnCount: number;
  lastCodexMessage: SymphonyCodexMessage | null;
  lastCodexTimestamp: string | null;
  lastCodexEvent: string | null;
  codexInputTokens: number;
  codexOutputTokens: number;
  codexTotalTokens: number;
  codexLastReportedInputTokens: number;
  codexLastReportedOutputTokens: number;
  codexLastReportedTotalTokens: number;
  lastRateLimits: SymphonyJsonObject | null;
  codexAppServerPid: string | null;
  startedAt: string;
};

export type SymphonyRetryEntry = {
  attempt: number;
  dueAtMs: number;
  retryToken: string;
  identifier: string;
  error: string | null;
  workerHost: string | null;
  workspace: PreparedWorkspace | null;
  launchTarget: AgentRuntimeLaunchTarget | null;
  workspacePath: string | null;
  delayType: "continuation" | "failure";
};

export type SymphonyOrchestratorState = {
  pollIntervalMs: number;
  maxConcurrentAgents: number;
  nextPollDueAtMs: number | null;
  pollCheckInProgress: boolean;
  running: Record<string, SymphonyRunningEntry>;
  completed: Set<string>;
  claimed: Set<string>;
  retryAttempts: Record<string, SymphonyRetryEntry>;
  codexTotals: SymphonyCodexTotals;
  rateLimits: SymphonyJsonObject | null;
};

export type SymphonyAgentRuntimeCompletion =
  | { kind: "normal" }
  | { kind: "max_turns_reached"; reason: string; maxTurns: number }
  | {
      kind: "startup_failure";
      reason: string;
      failureStage: SymphonyStartupFailureStage;
      failureOrigin: SymphonyStartupFailureOrigin;
      launchTarget?: AgentRuntimeLaunchTarget | null;
    }
  | { kind: "rate_limited"; reason: string }
  | { kind: "stalled"; reason: string }
  | { kind: "failure"; reason: string };

export type SymphonyAgentRuntimeUpdate = {
  event: string;
  payload?: unknown;
  timestamp: string;
  sessionId?: string | null;
  codexAppServerPid?: string | null;
};

export interface SymphonyOrchestratorObserver {
  startRun(input: {
    issue: SymphonyTrackerIssue;
    attempt: number;
    workspace: PreparedWorkspace | null;
    workerHost: string | null;
    startedAt: string;
  }): Promise<string | null> | string | null;
  recordLifecycleEvent(input: {
    issue: SymphonyTrackerIssue;
    runId: string | null;
    source: "orchestrator" | "tracker" | "workspace" | "runtime";
    eventType: string;
    message?: string | null;
    payload?: unknown;
    recordedAt?: string;
  }): Promise<void> | void;
  finalizeRun(input: {
    issue: SymphonyTrackerIssue;
    runId: string | null;
    completion: SymphonyAgentRuntimeCompletion;
    workerHost: string | null;
    workspace: PreparedWorkspace | null;
    startedAt: string;
    endedAt: string;
    turnCount: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }): Promise<void> | void;
}

export type SymphonyClock = {
  now(): Date;
  nowMs(): number;
};

export type SymphonyOrchestratorSnapshot = {
  running: Array<
    SymphonyRunningEntry & {
      issueId: string;
      runtimeSeconds: number;
    }
  >;
  retrying: Array<
    SymphonyRetryEntry & {
      issueId: string;
    }
  >;
  claimedIssueIds: string[];
  completedIssueIds: string[];
  pollIntervalMs: number;
  maxConcurrentAgents: number;
  nextPollDueAtMs: number | null;
  pollCheckInProgress: boolean;
  codexTotals: SymphonyCodexTotals;
  rateLimits: SymphonyJsonObject | null;
};

export function createSymphonyOrchestratorState(
  workflowConfig: SymphonyResolvedWorkflowConfig,
  clock: SymphonyClock = systemClock
): SymphonyOrchestratorState {
  return {
    pollIntervalMs: workflowConfig.polling.intervalMs,
    maxConcurrentAgents: workflowConfig.agent.maxConcurrentAgents,
    nextPollDueAtMs: clock.nowMs(),
    pollCheckInProgress: false,
    running: {},
    completed: new Set<string>(),
    claimed: new Set<string>(),
    retryAttempts: {},
    codexTotals: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      secondsRunning: 0
    },
    rateLimits: null
  };
}

export class SymphonyOrchestrator {
  readonly #workflowConfig: SymphonyResolvedWorkflowConfig;
  readonly #tracker: SymphonyTracker;
  readonly #workspaceBackend: WorkspaceBackend;
  readonly #agentRuntime: AgentRuntime;
  readonly #observer: SymphonyOrchestratorObserver | null;
  readonly #clock: SymphonyClock;
  readonly #runnerEnv: Record<string, string | undefined> | undefined;
  #state: SymphonyOrchestratorState;

  constructor(input: {
    workflowConfig: SymphonyResolvedWorkflowConfig;
    tracker: SymphonyTracker;
    workspaceBackend: WorkspaceBackend;
    agentRuntime: AgentRuntime;
    observer?: SymphonyOrchestratorObserver;
    clock?: SymphonyClock;
    runnerEnv?: Record<string, string | undefined>;
  }) {
    this.#workflowConfig = input.workflowConfig;
    this.#tracker = input.tracker;
    this.#workspaceBackend = input.workspaceBackend;
    this.#agentRuntime = input.agentRuntime;
    this.#observer = input.observer ?? null;
    this.#clock = input.clock ?? systemClock;
    this.#runnerEnv = input.runnerEnv;
    this.#state = createSymphonyOrchestratorState(
      input.workflowConfig,
      this.#clock
    );
  }

  get state(): SymphonyOrchestratorState {
    return this.#state;
  }

  snapshot(): SymphonyOrchestratorSnapshot {
    const now = this.#clock.now();

    return {
      running: Object.entries(this.#state.running)
        .map(([issueId, entry]) => ({
          issueId,
          ...entry,
          runtimeSeconds: runtimeSeconds(entry.startedAt, now)
        }))
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt)),
      retrying: Object.entries(this.#state.retryAttempts)
        .map(([issueId, retry]) => ({
          issueId,
          ...retry
        }))
        .sort((left, right) => left.dueAtMs - right.dueAtMs),
      claimedIssueIds: [...this.#state.claimed].sort(),
      completedIssueIds: [...this.#state.completed].sort(),
      pollIntervalMs: this.#state.pollIntervalMs,
      maxConcurrentAgents: this.#state.maxConcurrentAgents,
      nextPollDueAtMs: this.#state.nextPollDueAtMs,
      pollCheckInProgress: this.#state.pollCheckInProgress,
      codexTotals: this.#state.codexTotals,
      rateLimits: this.#state.rateLimits
    };
  }

  async runPollCycle(): Promise<SymphonyOrchestratorSnapshot> {
    this.#state.pollCheckInProgress = true;
    try {
      await this.reconcileRunningIssues();
      await this.#processDueRetries();

      if (this.availableSlots() > 0) {
        const issues = await this.#tracker.fetchCandidateIssues(
          this.#workflowConfig.tracker
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
        this.#clock.nowMs() + this.#workflowConfig.polling.intervalMs;

      return this.snapshot();
    } finally {
      this.#state.pollCheckInProgress = false;
    }
  }

  async reconcileRunningIssues(): Promise<void> {
    await this.#reconcileStalledRunningIssues();
    const runningIssueIds = Object.keys(this.#state.running);
    if (runningIssueIds.length === 0) {
      return;
    }

    const refreshed = await this.#tracker.fetchIssueStatesByIds(
      this.#workflowConfig.tracker,
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

      if (issueMatchesTerminalState(refreshedIssue, this.#workflowConfig.tracker)) {
        await this.#terminateRunningIssue(issueId, true);
        continue;
      }

      if (
        !refreshedIssue.assignedToWorker ||
        !issueMatchesDispatchableState(
          refreshedIssue,
          this.#workflowConfig.tracker
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
      this.#state.completed.has(issue.id) ||
      this.#state.retryAttempts[issue.id]
    ) {
      return false;
    }

    if (!issue.assignedToWorker) {
      return false;
    }

    if (
      !issueMatchesDispatchableState(issue, this.#workflowConfig.tracker) ||
      issueMatchesTerminalState(issue, this.#workflowConfig.tracker)
    ) {
      return false;
    }

    return (
      this.availableSlots() > 0 &&
      this.#stateSlotsAvailable(issue.state)
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
      this.#workflowConfig,
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
        config: this.#workflowConfig.workspace,
        hooks: this.#workflowConfig.hooks,
        ...this.#workspaceRunnerOptions(preferredWorkerHost)
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
      await this.#recordDockerContainerPrepareEvent(preparedIssue, runId, workspace);

      startupFailureStage = "workspace_before_run";
      const beforeRunResult = await this.#workspaceBackend.runBeforeRun({
        workspace,
        context: workspaceContext,
        hooks: this.#workflowConfig.hooks,
        ...this.#workspaceRunnerOptions(preferredWorkerHost)
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

      startupFailureStage = "runtime_launch";
      const launch = await this.#agentRuntime.startRun({
        issue: preparedIssue,
        runId,
        attempt,
        workflowConfig: this.#workflowConfig,
        workspace
      });
      const workerHost = launch.workerHost ?? workspace.workerHost;
      launchTarget = launch.launchTarget;

      this.#state.running[preparedIssue.id] = {
        issue: preparedIssue,
        runId,
        sessionId: launch.sessionId,
        workerHost,
        workspace,
        launchTarget,
        workspacePath: workspaceHostPath(workspace),
        retryAttempt: attempt,
        turnCount: 0,
        lastCodexMessage: null,
        lastCodexTimestamp: null,
        lastCodexEvent: null,
        codexInputTokens: 0,
        codexOutputTokens: 0,
        codexTotalTokens: 0,
        codexLastReportedInputTokens: 0,
        codexLastReportedOutputTokens: 0,
        codexLastReportedTotalTokens: 0,
        lastRateLimits: null,
        codexAppServerPid: null,
        startedAt
      };

      await this.#observer?.recordLifecycleEvent({
        issue: preparedIssue,
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

      delete this.#state.retryAttempts[preparedIssue.id];
      this.#state.completed.delete(preparedIssue.id);
      this.#state.claimed.add(preparedIssue.id);
    } catch (error) {
      if (isFatalRuntimeError(error)) {
        throw error;
      }

      const reason = String(error);
      const failureOrigin = classifyStartupFailureOrigin(
        startupFailureStage,
        this.#workspaceBackend.kind
      );

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
          launchTarget
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

      await this.#handleStartupFailure(
        preparedIssue,
        preferredWorkerHost,
        workspace,
        reason,
        runId,
        {
          kind: "startup_failure",
          reason,
          failureStage: startupFailureStage,
          failureOrigin,
          launchTarget
        }
      );
    }
  }

  applyAgentUpdate(issueId: string, update: SymphonyAgentRuntimeUpdate): void {
    const runningEntry = this.#state.running[issueId];
    if (!runningEntry) {
      return;
    }

    const usage = extractTokenUsage(update);
    const rateLimits = extractRateLimits(update);
    const nextInput = usage?.inputTokens ?? runningEntry.codexInputTokens;
    const nextOutput = usage?.outputTokens ?? runningEntry.codexOutputTokens;
    const nextTotal = usage?.totalTokens ?? runningEntry.codexTotalTokens;

    if (rateLimits) {
      this.#state.rateLimits = rateLimits;
    }

    this.#state.running[issueId] = {
      ...runningEntry,
      sessionId: update.sessionId ?? runningEntry.sessionId,
      turnCount:
        isTerminalTurnEvent(update.event)
          ? runningEntry.turnCount + 1
          : runningEntry.turnCount,
      lastCodexEvent: update.event,
      lastCodexTimestamp: update.timestamp,
      lastCodexMessage: {
        event: update.event,
        message: update.payload ?? null,
        timestamp: update.timestamp
      },
      codexInputTokens: nextInput,
      codexOutputTokens: nextOutput,
      codexTotalTokens: nextTotal,
      codexLastReportedInputTokens: nextInput,
      codexLastReportedOutputTokens: nextOutput,
      codexLastReportedTotalTokens: nextTotal,
      lastRateLimits: rateLimits ?? runningEntry.lastRateLimits,
      codexAppServerPid: update.codexAppServerPid ?? runningEntry.codexAppServerPid
    };
  }

  async handleRunCompletion(
    issueId: string,
    completion: SymphonyAgentRuntimeCompletion
  ): Promise<void> {
    const runningEntry = this.#state.running[issueId];
    if (!runningEntry) {
      return;
    }

    this.#accumulateCodexTotals(runningEntry);
    delete this.#state.running[issueId];
    this.#state.claimed.delete(issueId);

    if (runningEntry.workspace) {
      const afterRunResult = await this.#workspaceBackend.runAfterRun({
        workspace: runningEntry.workspace,
        context: {
          issueId,
          issueIdentifier: runningEntry.issue.identifier
        },
        hooks: this.#workflowConfig.hooks,
        ...this.#workspaceRunnerOptions(runningEntry.workerHost)
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

    if (completion.kind === "normal" || completion.kind === "max_turns_reached") {
      if (completion.kind === "max_turns_reached") {
        await this.#leaveFailureComment(
          runningEntry.issue,
          completion.reason,
          "paused_max_turns",
          runningEntry.runId,
          {
            rateLimits: runningEntry.lastRateLimits
          }
        );
      }

      this.#state.completed.add(issueId);
      await this.scheduleIssueRetry(issueId, 1, {
        identifier: runningEntry.issue.identifier,
        issue: runningEntry.issue,
        runId: runningEntry.runId,
        workerHost: runningEntry.workerHost,
        workspace: runningEntry.workspace,
        launchTarget: runningEntry.launchTarget,
        delayType: "continuation"
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
          launchTarget: completion.launchTarget ?? runningEntry.launchTarget ?? null,
          workspace: buildWorkspaceLifecyclePayload(runningEntry.workspace)
        }
      });
      await this.#handleStartupFailure(
        runningEntry.issue,
        runningEntry.workerHost,
        runningEntry.workspace,
        completion.reason,
        runningEntry.runId,
        completion
      );
      return;
    }

    if (completion.kind === "stalled") {
      await this.scheduleIssueRetry(issueId, runningEntry.retryAttempt + 1, {
        identifier: runningEntry.issue.identifier,
        error: completion.reason,
        issue: runningEntry.issue,
        runId: runningEntry.runId,
        workerHost: runningEntry.workerHost,
        workspace: runningEntry.workspace,
        launchTarget: runningEntry.launchTarget,
        delayType: "failure"
      });
      return;
    }

    await this.#leaveFailureComment(
      runningEntry.issue,
      completion.reason,
      completion.kind === "rate_limited"
        ? "rate_limited"
        : "retry_scheduled",
      runningEntry.runId,
      {
        rateLimits: runningEntry.lastRateLimits
      }
    );

    await this.scheduleIssueRetry(issueId, runningEntry.retryAttempt + 1, {
      identifier: runningEntry.issue.identifier,
      error: completion.reason,
      issue: runningEntry.issue,
      runId: runningEntry.runId,
      workerHost: runningEntry.workerHost,
      workspace: runningEntry.workspace,
      launchTarget: runningEntry.launchTarget,
      delayType: "failure"
    });
  }

  async scheduleIssueRetry(
    issueId: string,
    attempt: number,
    metadata: {
      identifier: string;
      error?: string;
      issue?: SymphonyTrackerIssue;
      runId?: string | null;
      workerHost?: string | null;
      workspace?: PreparedWorkspace | null;
      launchTarget?: AgentRuntimeLaunchTarget | null;
      delayType: "continuation" | "failure";
    }
  ): Promise<void> {
    const delayMs =
      metadata.delayType === "continuation"
        ? continuationRetryDelayMs
        : failureRetryDelay(attempt, this.#workflowConfig.agent.maxRetryBackoffMs);

    this.#state.retryAttempts[issueId] = {
      attempt,
      dueAtMs: this.#clock.nowMs() + delayMs,
      retryToken: randomUUID(),
      identifier: metadata.identifier,
      error: metadata.error ?? null,
      workerHost: metadata.workerHost ?? null,
      workspace: metadata.workspace ?? null,
      launchTarget: metadata.launchTarget ?? null,
      workspacePath: workspaceHostPath(metadata.workspace ?? null),
      delayType: metadata.delayType
    };

    const issue = metadata.issue ?? this.#state.running[issueId]?.issue;
    const runId = metadata.runId ?? this.#state.running[issueId]?.runId ?? null;

    if (issue) {
      await this.#observer?.recordLifecycleEvent({
        issue,
        runId,
        source: "orchestrator",
        eventType: "retry_scheduled",
        message:
          metadata.delayType === "continuation"
            ? "Continuation retry scheduled."
            : "Failure retry scheduled.",
        payload: {
          attempt,
          dueAtMs: this.#state.retryAttempts[issueId]?.dueAtMs ?? null,
          error: metadata.error ?? null,
          delayType: metadata.delayType,
          launchTarget: metadata.launchTarget ?? null,
          workspace: metadata.workspace
            ? buildWorkspaceLifecyclePayload(metadata.workspace)
            : null
        }
      });
    }
  }

  async #processDueRetries(): Promise<void> {
    const nowMs = this.#clock.nowMs();
    const dueRetries = Object.entries(this.#state.retryAttempts)
      .filter(([, retry]) => retry.dueAtMs <= nowMs)
      .sort((left, right) => left[1].dueAtMs - right[1].dueAtMs);

    for (const [issueId, retry] of dueRetries) {
      delete this.#state.retryAttempts[issueId];

      const issue = await this.#tracker.fetchIssueByIdentifier(
        this.#workflowConfig.tracker,
        retry.identifier
      );

      if (!issue) {
        continue;
      }

      if (!issueMatchesDispatchableState(issue, this.#workflowConfig.tracker)) {
        continue;
      }

      if (issueMatchesTerminalState(issue, this.#workflowConfig.tracker)) {
        continue;
      }

      if (!this.shouldDispatchIssue(issue)) {
        await this.scheduleIssueRetry(issue.id, retry.attempt, {
          identifier: retry.identifier,
          error: retry.error ?? undefined,
          workerHost: retry.workerHost,
          workspace: retry.workspace,
          launchTarget: retry.launchTarget,
          delayType: retry.delayType
        });
        continue;
      }

      await this.dispatchIssue(issue, retry.attempt, retry.workerHost);
    }
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
      await this.#cleanupWorkspaceAndRecordLifecycle({
        issue: runningEntry.issue,
        runId: runningEntry.runId,
        workspace: runningEntry.workspace,
        workerHost: runningEntry.workerHost,
        reason: "issue_stopped"
      });
    }

    delete this.#state.running[issueId];
    delete this.#state.retryAttempts[issueId];
    this.#state.claimed.delete(issueId);
  }

  #stateSlotsAvailable(issueState: string): boolean {
    const normalizedState = issueState.trim().toLowerCase();
    const configuredLimit =
      this.#workflowConfig.agent.maxConcurrentAgentsByState[normalizedState];

    if (!configuredLimit) {
      return true;
    }

    const runningInState = Object.values(this.#state.running).filter(
      (entry) => entry.issue.state.trim().toLowerCase() === normalizedState
    ).length;

    return runningInState < configuredLimit;
  }

  #accumulateCodexTotals(runningEntry: SymphonyRunningEntry): void {
    this.#state.codexTotals = {
      inputTokens: this.#state.codexTotals.inputTokens + runningEntry.codexInputTokens,
      outputTokens:
        this.#state.codexTotals.outputTokens + runningEntry.codexOutputTokens,
      totalTokens: this.#state.codexTotals.totalTokens + runningEntry.codexTotalTokens,
      secondsRunning:
        this.#state.codexTotals.secondsRunning +
        runtimeSeconds(runningEntry.startedAt, this.#clock.now())
    };
  }

  #workspaceRunnerOptions(workerHost: string | null): {
    env: Record<string, string | undefined> | undefined;
    workerHost: string | null;
  } {
    return {
      env: this.#runnerEnv,
      workerHost
    };
  }

  async #handleStartupFailure(
    issue: SymphonyTrackerIssue,
    workerHost: string | null,
    workspace: PreparedWorkspace | null,
    reason: string,
    runId: string | null,
    completion: Extract<SymphonyAgentRuntimeCompletion, { kind: "startup_failure" }>
  ): Promise<void> {
    const targetState =
      this.#workflowConfig.tracker.startupFailureTransitionToState;
    let transition: SymphonyStartupFailureTransition = {
      kind: "none"
    };

    if (targetState) {
      try {
        await this.#tracker.updateIssueState(issue.id, targetState);
        transition = {
          kind: "moved",
          targetState
        };
        await this.#observer?.recordLifecycleEvent({
          issue: {
            ...issue,
            state: targetState
          },
          runId,
          source: "tracker",
          eventType: "startup_failure_transition",
          message: `Issue moved to ${targetState} after startup failure.`,
          payload: {
            fromState: issue.state,
            toState: targetState
          }
        });
      } catch (error) {
        transition = {
          kind: "failed",
          targetState,
          reason: error instanceof Error ? error.message : String(error)
        };
        await this.#observer?.recordLifecycleEvent({
          issue,
          runId,
          source: "tracker",
          eventType: "startup_failure_transition_failed",
          message: `Issue could not be moved to ${targetState} after startup failure.`,
          payload: {
            fromState: issue.state,
            toState: targetState,
            reason: transition.reason
          }
        });
      }
    }

    await this.#leaveFailureComment(
      issue,
      reason,
      targetState ? "startup_failed_backlog" : "startup_failed",
      runId,
      {
        startupFailureTransition: transition
      }
    );

    await this.#cleanupWorkspaceAndRecordLifecycle({
      issue,
      runId,
      workspace,
      workerHost,
      reason: "startup_failure",
      startupFailure: completion
    });

    delete this.#state.retryAttempts[issue.id];
    this.#state.claimed.delete(issue.id);
  }

  async #cleanupWorkspaceAndRecordLifecycle(input: {
    issue: SymphonyTrackerIssue;
    runId: string | null;
    workspace: PreparedWorkspace | null;
    workerHost: string | null;
    reason: "startup_failure" | "issue_stopped";
    startupFailure?: Extract<SymphonyAgentRuntimeCompletion, { kind: "startup_failure" }>;
  }): Promise<void> {
    try {
      const cleanup = await this.#workspaceBackend.cleanupWorkspace({
        issueIdentifier: input.issue.identifier,
        workspace: input.workspace,
        config: this.#workflowConfig.workspace,
        hooks: this.#workflowConfig.hooks,
        ...this.#workspaceRunnerOptions(input.workerHost)
      });

      await this.#observer?.recordLifecycleEvent({
        issue: input.issue,
        runId: input.runId,
        source: "workspace",
        eventType: "workspace_cleanup_completed",
        message:
          input.reason === "startup_failure"
            ? "Workspace cleanup completed after startup failure."
            : "Workspace cleanup completed after the run stopped.",
        payload: {
          cleanup
        }
      });

      await this.#recordDockerContainerCleanupEvent(input.issue, input.runId, cleanup);
    } catch (error) {
      await this.#observer?.recordLifecycleEvent({
        issue: input.issue,
        runId: input.runId,
        source: "workspace",
        eventType: "workspace_cleanup_failed",
        message:
          input.reason === "startup_failure"
            ? "Workspace cleanup failed after startup failure."
            : "Workspace cleanup failed after the run stopped.",
        payload: {
          reason: error instanceof Error ? error.message : String(error),
          workspace: buildWorkspaceLifecyclePayload(input.workspace),
          startupFailure: input.startupFailure
            ? {
                failureStage: input.startupFailure.failureStage,
                failureOrigin: input.startupFailure.failureOrigin
              }
            : null
        }
      });
      throw error;
    }
  }

  async #recordDockerContainerPrepareEvent(
    issue: SymphonyTrackerIssue,
    runId: string | null,
    workspace: PreparedWorkspace
  ): Promise<void> {
    if (workspace.backendKind !== "docker") {
      return;
    }

    const eventType =
      workspace.containerDisposition === "reused"
        ? "docker_container_reused"
        : workspace.containerDisposition === "recreated"
          ? "docker_container_recreated"
          : "docker_container_started";

    await this.#observer?.recordLifecycleEvent({
      issue,
      runId,
      source: "workspace",
      eventType,
      message:
        workspace.containerDisposition === "reused"
          ? "Docker container reused for the prepared workspace."
          : workspace.containerDisposition === "recreated"
            ? "Docker container recreated for the prepared workspace."
            : "Docker container started for the prepared workspace.",
      payload: {
        workspace: buildWorkspaceLifecyclePayload(workspace)
      }
    });
  }

  async #recordDockerContainerCleanupEvent(
    issue: SymphonyTrackerIssue,
    runId: string | null,
    cleanup: Awaited<ReturnType<WorkspaceBackend["cleanupWorkspace"]>>
  ): Promise<void> {
    if (cleanup.backendKind !== "docker") {
      return;
    }

    const eventType =
      cleanup.containerRemovalDisposition === "removed"
        ? "docker_container_removed"
        : cleanup.containerRemovalDisposition === "missing"
          ? "docker_container_missing"
          : null;

    if (!eventType) {
      return;
    }

    await this.#observer?.recordLifecycleEvent({
      issue,
      runId,
      source: "workspace",
      eventType,
      message:
        cleanup.containerRemovalDisposition === "removed"
          ? "Docker container removed during workspace cleanup."
          : "Docker container was already missing during workspace cleanup.",
      payload: {
        cleanup
      }
    });
  }

  async #leaveFailureComment(
    issue: SymphonyTrackerIssue,
    reason: string,
    outcome: string,
    runId: string | null,
    options: {
      rateLimits?: SymphonyJsonObject | null;
      startupFailureTransition?: SymphonyStartupFailureTransition;
    } = {}
  ): Promise<void> {
    const comment = buildFailureCommentBody(issue, reason, outcome, options);

    try {
      await this.#tracker.createComment(issue.id, comment);
      await this.#observer?.recordLifecycleEvent({
        issue,
        runId,
        source: "tracker",
        eventType: "tracker_comment_created",
        message: "Failure comment posted to tracker.",
        payload: {
          outcome
        }
      });
    } catch {
      return;
    }
  }

  async #reconcileStalledRunningIssues(): Promise<void> {
    const timeoutMs = this.#workflowConfig.codex.stallTimeoutMs;
    if (timeoutMs <= 0) {
      return;
    }

    const runningIssueIds = Object.keys(this.#state.running);
    if (runningIssueIds.length === 0) {
      return;
    }

    for (const issueId of runningIssueIds) {
      const runningEntry = this.#state.running[issueId];
      if (!runningEntry) {
        continue;
      }

      const elapsedMs = stallElapsedMs(runningEntry, this.#clock.now());
      if (elapsedMs === null || elapsedMs <= timeoutMs) {
        continue;
      }

      const reason = `stalled for ${elapsedMs}ms without codex activity`;

      await this.#agentRuntime.stopRun({
        issue: runningEntry.issue,
        workspace: runningEntry.workspace,
        cleanupWorkspace: false
      });

      await this.handleRunCompletion(issueId, {
        kind: "stalled",
        reason
      });
    }
  }
}

function buildWorkspaceLifecyclePayload(
  workspace: PreparedWorkspace | null
): SymphonyJsonObject | null {
  return normalizeWorkspaceLifecycleMetadata(summarizePreparedWorkspace(workspace));
}

export async function prepareIssueForDispatch(
  workflowConfig: SymphonyResolvedWorkflowConfig,
  tracker: SymphonyTracker,
  issue: SymphonyTrackerIssue
): Promise<SymphonyTrackerIssue> {
  const targetState = workflowConfig.tracker.claimTransitionToState;
  const sourceStates = workflowConfig.tracker.claimTransitionFromStates.map(
    (stateName) => stateName.trim().toLowerCase()
  );

  if (
    !targetState ||
    !sourceStates.includes(issue.state.trim().toLowerCase())
  ) {
    return issue;
  }

  await tracker.updateIssueState(issue.id, targetState);
  await tracker.createComment(issue.id, claimTransitionCommentBody(issue, targetState));

  return {
    ...issue,
    state: targetState
  };
}

function failureRetryDelay(attempt: number, maxRetryBackoffMs: number): number {
  const exponent = Math.max(0, attempt - 1);
  return Math.min(
    failureRetryBaseMs * (1 << exponent),
    maxRetryBackoffMs
  );
}

function normalizeWorkspaceLifecycleMetadata(
  workspace: WorkspaceLifecycleMetadata | null
): SymphonyJsonObject | null {
  if (!workspace) {
    return null;
  }

  return {
    issueIdentifier: workspace.issueIdentifier,
    workspaceKey: workspace.workspaceKey,
    backendKind: workspace.backendKind,
    workerHost: workspace.workerHost,
    executionTargetKind: workspace.executionTargetKind,
    materializationKind: workspace.materializationKind,
    prepareDisposition: workspace.prepareDisposition,
    containerDisposition: workspace.containerDisposition,
    afterCreateHookOutcome: workspace.afterCreateHookOutcome,
    hostPath: workspace.hostPath,
    runtimePath: workspace.runtimePath,
    containerId: workspace.containerId,
    containerName: workspace.containerName,
    path: workspace.path
  };
}

function classifyStartupFailureOrigin(
  stage: SymphonyStartupFailureStage,
  backendKind: WorkspaceBackendKind
): SymphonyStartupFailureOrigin {
  if (stage === "runtime_session_start") {
    return "codex_startup";
  }

  if (stage === "runtime_launch") {
    return "runtime_launch";
  }

  if (backendKind === "docker") {
    return "docker_lifecycle";
  }

  return "workspace_lifecycle";
}

function isFatalRuntimeError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "fatal" in error &&
    (error as Error & { fatal?: unknown }).fatal === true
  );
}

const systemClock: SymphonyClock = {
  now() {
    return new Date();
  },
  nowMs() {
    return Date.now();
  }
};
