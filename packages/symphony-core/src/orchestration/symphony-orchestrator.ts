import { randomUUID } from "node:crypto";
import {
  issueBranchName,
  issueMatchesDispatchableState,
  issueMatchesTerminalState,
  type SymphonyTracker,
  type SymphonyTrackerIssue
} from "../tracker/symphony-tracker.js";
import type { SymphonyResolvedWorkflowConfig } from "../workflow/symphony-workflow.js";
import type {
  SymphonyWorkspace,
  SymphonyWorkspaceContext,
  SymphonyWorkspaceManager
} from "../workspace/local-symphony-workspace-manager.js";

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

export type SymphonyRunningEntry = {
  issue: SymphonyTrackerIssue;
  sessionId: string | null;
  workerHost: string | null;
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
};

export type SymphonyAgentRuntimeLaunchResult = {
  sessionId: string | null;
  workerHost: string | null;
  workspacePath: string;
};

export type SymphonyAgentRuntimeCompletion =
  | { kind: "normal" }
  | { kind: "startup_failure"; reason: string }
  | { kind: "failure"; reason: string };

export type SymphonyAgentRuntimeUpdate = {
  event: string;
  payload?: unknown;
  timestamp: string;
  sessionId?: string | null;
  codexAppServerPid?: string | null;
};

export interface SymphonyAgentRuntime {
  startRun(input: {
    issue: SymphonyTrackerIssue;
    attempt: number;
    workflowConfig: SymphonyResolvedWorkflowConfig;
    workspace: SymphonyWorkspace;
  }): Promise<SymphonyAgentRuntimeLaunchResult>;
  stopRun(input: {
    issue: SymphonyTrackerIssue;
    workspacePath: string | null;
    workerHost: string | null;
    cleanupWorkspace: boolean;
  }): Promise<void>;
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
    }
  };
}

export class SymphonyOrchestrator {
  readonly #workflowConfig: SymphonyResolvedWorkflowConfig;
  readonly #tracker: SymphonyTracker;
  readonly #workspaceManager: SymphonyWorkspaceManager;
  readonly #agentRuntime: SymphonyAgentRuntime;
  readonly #clock: SymphonyClock;
  #state: SymphonyOrchestratorState;

  constructor(input: {
    workflowConfig: SymphonyResolvedWorkflowConfig;
    tracker: SymphonyTracker;
    workspaceManager: SymphonyWorkspaceManager;
    agentRuntime: SymphonyAgentRuntime;
    clock?: SymphonyClock;
  }) {
    this.#workflowConfig = input.workflowConfig;
    this.#tracker = input.tracker;
    this.#workspaceManager = input.workspaceManager;
    this.#agentRuntime = input.agentRuntime;
    this.#clock = input.clock ?? systemClock;
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
      codexTotals: this.#state.codexTotals
    };
  }

  async runPollCycle(): Promise<SymphonyOrchestratorSnapshot> {
    this.#state.pollCheckInProgress = true;

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

    this.#state.pollCheckInProgress = false;
    this.#state.nextPollDueAtMs =
      this.#clock.nowMs() + this.#workflowConfig.polling.intervalMs;

    return this.snapshot();
  }

  async reconcileRunningIssues(): Promise<void> {
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

    const workspaceContext: SymphonyWorkspaceContext = {
      issueId: preparedIssue.id,
      issueIdentifier: preparedIssue.identifier
    };

    try {
      const workspace = await this.#workspaceManager.createForIssue(
        workspaceContext,
        this.#workflowConfig.workspace,
        this.#workflowConfig.hooks,
        {
          workerHost: preferredWorkerHost
        }
      );

      await this.#workspaceManager.runBeforeRunHook(
        workspace.path,
        workspaceContext,
        this.#workflowConfig.hooks,
        {
          workerHost: preferredWorkerHost
        }
      );

      const launch = await this.#agentRuntime.startRun({
        issue: preparedIssue,
        attempt,
        workflowConfig: this.#workflowConfig,
        workspace
      });

      this.#state.running[preparedIssue.id] = {
        issue: preparedIssue,
        sessionId: launch.sessionId,
        workerHost: launch.workerHost,
        workspacePath: launch.workspacePath,
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
        codexAppServerPid: null,
        startedAt: this.#clock.now().toISOString()
      };

      delete this.#state.retryAttempts[preparedIssue.id];
      this.#state.completed.delete(preparedIssue.id);
      this.#state.claimed.add(preparedIssue.id);
    } catch (error) {
      this.scheduleIssueRetry(preparedIssue.id, attempt + 1, {
        identifier: preparedIssue.identifier,
        error: String(error),
        workerHost: preferredWorkerHost,
        delayType: "failure"
      });
    }
  }

  applyAgentUpdate(issueId: string, update: SymphonyAgentRuntimeUpdate): void {
    const runningEntry = this.#state.running[issueId];
    if (!runningEntry) {
      return;
    }

    const usage = extractTokenUsage(update);
    const nextInput = usage?.inputTokens ?? runningEntry.codexInputTokens;
    const nextOutput = usage?.outputTokens ?? runningEntry.codexOutputTokens;
    const nextTotal = usage?.totalTokens ?? runningEntry.codexTotalTokens;

    this.#state.running[issueId] = {
      ...runningEntry,
      sessionId: update.sessionId ?? runningEntry.sessionId,
      turnCount:
        update.event === "session_started"
          ? runningEntry.turnCount
          : runningEntry.turnCount + 1,
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

    await this.#workspaceManager.runAfterRunHook(
      runningEntry.workspacePath ?? this.#workspaceManager.workspacePathForIssue(
        runningEntry.issue.identifier,
        this.#workflowConfig.workspace.root
      ),
      {
        issueId,
        issueIdentifier: runningEntry.issue.identifier
      },
      this.#workflowConfig.hooks,
      {
        workerHost: runningEntry.workerHost
      }
    );

    if (completion.kind === "normal") {
      this.#state.completed.add(issueId);
      this.scheduleIssueRetry(issueId, 1, {
        identifier: runningEntry.issue.identifier,
        workerHost: runningEntry.workerHost,
        workspacePath: runningEntry.workspacePath,
        delayType: "continuation"
      });
      return;
    }

    if (completion.kind === "startup_failure") {
      const targetState =
        this.#workflowConfig.tracker.startupFailureTransitionToState;

      if (targetState) {
        await this.#tracker.updateIssueState(issueId, targetState);
      }

      if (runningEntry.workspacePath) {
        await this.#workspaceManager.removeIssueWorkspace(
          runningEntry.issue.identifier,
          this.#workflowConfig.workspace,
          this.#workflowConfig.hooks,
          {
            workerHost: runningEntry.workerHost
          }
        );
      }

      delete this.#state.retryAttempts[issueId];
      return;
    }

    this.scheduleIssueRetry(issueId, runningEntry.retryAttempt + 1, {
      identifier: runningEntry.issue.identifier,
      error: completion.reason,
      workerHost: runningEntry.workerHost,
      workspacePath: runningEntry.workspacePath,
      delayType: "failure"
    });
  }

  scheduleIssueRetry(
    issueId: string,
    attempt: number,
    metadata: {
      identifier: string;
      error?: string;
      workerHost?: string | null;
      workspacePath?: string | null;
      delayType: "continuation" | "failure";
    }
  ): void {
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
      workspacePath: metadata.workspacePath ?? null,
      delayType: metadata.delayType
    };
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
        this.scheduleIssueRetry(issue.id, retry.attempt, {
          identifier: retry.identifier,
          error: retry.error ?? undefined,
          workerHost: retry.workerHost,
          workspacePath: retry.workspacePath,
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
      workspacePath: runningEntry.workspacePath,
      workerHost: runningEntry.workerHost,
      cleanupWorkspace
    });

    if (cleanupWorkspace && runningEntry.workspacePath) {
      await this.#workspaceManager.removeIssueWorkspace(
        runningEntry.issue.identifier,
        this.#workflowConfig.workspace,
        this.#workflowConfig.hooks,
        {
          workerHost: runningEntry.workerHost
        }
      );
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

function claimTransitionCommentBody(
  issue: SymphonyTrackerIssue,
  targetState: string
): string {
  return [
    "Symphony status update.",
    "",
    `State: \`${targetState}\``,
    `What changed: picked up the ticket and moved it from \`${issue.state}\` to \`${targetState}\`.`,
    `Branch: \`${issueBranchName(issue.identifier)}\``,
    "Next update: Symphony will leave another status note when it hits a blocker, opens the first PR, or hands the ticket off for review."
  ].join("\n");
}

function failureRetryDelay(attempt: number, maxRetryBackoffMs: number): number {
  const exponent = Math.max(0, attempt - 1);
  return Math.min(
    failureRetryBaseMs * (1 << exponent),
    maxRetryBackoffMs
  );
}

function runtimeSeconds(startedAt: string, now: Date): number {
  const startedAtMs = Date.parse(startedAt);
  if (Number.isNaN(startedAtMs)) {
    return 0;
  }

  return Math.max(0, Math.floor((now.getTime() - startedAtMs) / 1_000));
}

function extractTokenUsage(
  update: SymphonyAgentRuntimeUpdate
):
  | {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    }
  | null {
  if (!update.payload || typeof update.payload !== "object") {
    return null;
  }

  const payload = update.payload as Record<string, unknown>;

  if (
    payload.method === "thread/tokenUsage/updated" &&
    isRecord(payload.params) &&
    isRecord(payload.params.tokenUsage) &&
    isRecord(payload.params.tokenUsage.total)
  ) {
    return extractTokenCountRecord(payload.params.tokenUsage.total);
  }

  if (update.event === "turn_completed" && isRecord(payload.usage)) {
    return {
      inputTokens: toInteger(payload.usage.input_tokens),
      outputTokens: toInteger(payload.usage.output_tokens),
      totalTokens: toInteger(payload.usage.total_tokens)
    };
  }

  return null;
}

function extractTokenCountRecord(
  total: Record<string, unknown>
): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  return {
    inputTokens: toInteger(total.inputTokens),
    outputTokens: toInteger(total.outputTokens),
    totalTokens: toInteger(total.totalTokens)
  };
}

function toInteger(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const systemClock: SymphonyClock = {
  now() {
    return new Date();
  },
  nowMs() {
    return Date.now();
  }
};
