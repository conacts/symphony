import type {
  SymphonyIssueSummary,
  SymphonyRunOutcome,
  SymphonyRunStatus,
  SymphonyRunSummary,
  SymphonyTurnStatus
} from "@symphony/runtime-run-ledger";
import {
  symphonyEventsTable,
  symphonyRunsTable,
  symphonyTurnsTable
} from "./schema.js";

type RuntimeRunRow = typeof symphonyRunsTable.$inferSelect;
type RuntimeTurnRow = typeof symphonyTurnsTable.$inferSelect;
type RuntimeEventRow = Pick<
  typeof symphonyEventsTable.$inferSelect,
  "runId" | "eventSequence" | "eventType" | "recordedAt"
>;
type RuntimeIssueRow = {
  issueIdentifier: string;
  trackerIssueId: string;
  repositoryKey: string;
  latestRunStartedAt: string | null;
  insertedAt: string | null;
  updatedAt: string | null;
};

type SymphonyRuntimeTokenTotals = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export function buildRuntimeRunSummary(
  issue: Pick<RuntimeIssueRow, "issueIdentifier" | "trackerIssueId">,
  run: RuntimeRunRow,
  turns: RuntimeTurnRow[],
  events: RuntimeEventRow[]
): SymphonyRunSummary {
  const runTurns = turns.filter((turn) => turn.runId === run.runId);
  const runEvents = events.filter((event) => event.runId === run.runId);
  const sortedEvents = [...runEvents].sort((left, right) => {
    const recordedAtOrder = compareDescendingTimestamps(left.recordedAt, right.recordedAt);

    if (recordedAtOrder !== 0) {
      return recordedAtOrder;
    }

    return right.eventSequence - left.eventSequence;
  });
  const lastEvent = sortedEvents[0];
  const tokenTotals = computeRuntimeRunTokenTotals(runTurns);

  return {
    runId: run.runId,
    repositoryKey: run.repositoryKey,
    trackerIssueId: issue.trackerIssueId,
    issueIdentifier: run.issueIdentifier,
    attempt: run.attempt,
    runMode: run.runMode,
    status: normalizeRuntimeRunStatus(run.status),
    outcome: normalizeOptionalRuntimeRunOutcome(run.outcome),
    workerHost: run.workerHost,
    workspacePath: run.workspacePath,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    commitHashStart: run.commitHashStart,
    commitHashEnd: run.commitHashEnd,
    turnCount: runTurns.length,
    eventCount: runEvents.length,
    lastEventType: lastEvent?.eventType ?? null,
    lastEventAt: lastEvent?.recordedAt ?? null,
    durationSeconds: computeDurationSeconds(run.startedAt, run.endedAt),
    errorClass: run.errorClass ?? null,
    errorMessage: run.errorMessage ?? null,
    inputTokens: tokenTotals.inputTokens,
    outputTokens: tokenTotals.outputTokens,
    totalTokens: tokenTotals.totalTokens
  };
}

export function computeRuntimeRunTokenTotals(
  turns: RuntimeTurnRow[]
): SymphonyRuntimeTokenTotals {
  return turns.reduce<SymphonyRuntimeTokenTotals>(
    (totals, turn) => {
      const turnTotals = parseRuntimeTurnTokenTotals(turn.usage);

      return {
        inputTokens: totals.inputTokens + turnTotals.inputTokens,
        cachedInputTokens: totals.cachedInputTokens + turnTotals.cachedInputTokens,
        outputTokens: totals.outputTokens + turnTotals.outputTokens,
        totalTokens: totals.totalTokens + turnTotals.totalTokens
      };
    },
    {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0
    }
  );
}

export function buildRuntimeIssueSummary(
  issue: RuntimeIssueRow,
  runs: RuntimeRunRow[]
): SymphonyIssueSummary {
  const issueRuns = runs
    .filter((run) => run.issueIdentifier === issue.issueIdentifier)
    .sort((left, right) => compareDescendingTimestamps(left.startedAt, right.startedAt));
  const latestRun = issueRuns[0];
  const latestProblemRun = issueRuns.find((run) =>
    isProblemOutcome(normalizeOptionalRuntimeRunOutcome(run.outcome))
  );
  const lastCompletedRun = issueRuns.find((run) =>
    isCompletedOutcome(normalizeOptionalRuntimeRunOutcome(run.outcome))
  );

  return {
    trackerIssueId: issue.trackerIssueId,
    repositoryKey: issue.repositoryKey,
    issueIdentifier: issue.issueIdentifier,
    latestRunStartedAt: issue.latestRunStartedAt ?? null,
    latestRunId: latestRun?.runId ?? null,
    latestRunStatus: latestRun ? normalizeRuntimeRunStatus(latestRun.status) : null,
    latestRunOutcome: normalizeOptionalRuntimeRunOutcome(latestRun?.outcome),
    runCount: issueRuns.length,
    latestProblemOutcome: normalizeOptionalRuntimeRunOutcome(latestProblemRun?.outcome),
    lastCompletedOutcome: normalizeOptionalRuntimeRunOutcome(lastCompletedRun?.outcome),
    insertedAt: issue.insertedAt ?? null,
    updatedAt: issue.updatedAt ?? null
  };
}

function parseRuntimeTurnTokenTotals(tokens: unknown): SymphonyRuntimeTokenTotals {
  const value =
    tokens && typeof tokens === "object" && !Array.isArray(tokens)
      ? (tokens as Record<string, unknown>)
      : null;
  const inputTokens = parseTokenCount(value?.input_tokens);
  const cachedInputTokens = parseTokenCount(value?.cached_input_tokens);
  const outputTokens = parseTokenCount(value?.output_tokens);

  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens: inputTokens + cachedInputTokens + outputTokens
  };
}

function parseTokenCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

function computeDurationSeconds(
  startedAt: string | null,
  endedAt: string | null
): number | null {
  if (!startedAt) {
    return null;
  }

  const startedMs = Date.parse(startedAt);
  if (Number.isNaN(startedMs)) {
    return null;
  }

  const endedMs = endedAt ? Date.parse(endedAt) : Date.now();
  if (Number.isNaN(endedMs)) {
    return null;
  }

  return Math.max(0, Math.floor((endedMs - startedMs) / 1_000));
}

function compareDescendingTimestamps(
  left: string | null | undefined,
  right: string | null | undefined
): number {
  const leftTime = left ? Date.parse(left) : Number.NEGATIVE_INFINITY;
  const rightTime = right ? Date.parse(right) : Number.NEGATIVE_INFINITY;
  return rightTime - leftTime;
}

function isCompletedOutcome(outcome: SymphonyRunOutcome | null): boolean {
  return outcome === "completed" || outcome === "merged" || outcome === "delivered";
}

export function isProblemOutcome(outcome: SymphonyRunOutcome | null): boolean {
  return outcome !== null && !isCompletedOutcome(outcome);
}

export function normalizeOptionalRuntimeRunOutcome(
  outcome: string | null | undefined
): SymphonyRunOutcome | null {
  if (outcome === null || outcome === undefined) {
    return null;
  }

  return normalizeRuntimeRunOutcome(outcome);
}

export function normalizeRuntimeRunStatus(status: string): SymphonyRunStatus {
  switch (status) {
    case "dispatching":
    case "running":
    case "finished":
    case "paused":
    case "failed":
    case "startup_failed":
    case "rate_limited":
    case "stalled":
    case "stopped":
      return status;
    default:
      throw new TypeError(`Unknown runtime run status: ${status}`);
  }
}

export function normalizeRuntimeRunOutcome(outcome: string): SymphonyRunOutcome {
  switch (outcome) {
    case "completed":
    case "merged":
    case "blocked":
    case "merge_blocked":
    case "paused_max_turns":
    case "startup_failed":
    case "rate_limited":
    case "provider_transient":
    case "stalled":
    case "failed":
    case "runtime_shutdown":
    case "run_stopped_inactive":
    case "run_stopped_terminal":
    case "delivered":
    case "max_turns_reached":
    case "blocked_repo":
    case "blocked_merge":
    case "blocked_merge_max_turns":
      return outcome;
    default:
      throw new TypeError(`Unknown runtime run outcome: ${outcome}`);
  }
}

export function normalizeRuntimeTurnStatus(status: string): SymphonyTurnStatus {
  switch (status) {
    case "running":
    case "completed":
    case "failed":
    case "stopped":
      return status;
    default:
      throw new TypeError(`Unknown runtime turn status: ${status}`);
  }
}
