import type {
  SymphonyForensicsDiagnosticSuccessMetrics,
  SymphonyForensicsExecutiveSuccessMetrics,
  SymphonyForensicsIssueTimeRange,
  SymphonyForensicsRunSummary,
  SymphonyForensicsSuccessMetricWindow,
  SymphonyForensicsSuccessMetricsDay,
  SymphonyForensicsSuccessMetricsResult
} from "@symphony/contracts";
import { groupRunsByIssue } from "./symphony-forensics-aggregates.js";

export function buildSuccessMetrics(input: {
  runs: SymphonyForensicsRunSummary[];
  window: SymphonyForensicsSuccessMetricWindow;
}): SymphonyForensicsSuccessMetricsResult {
  const groupedRuns = groupRunsByIssue(input.runs);
  const issueMetrics = Array.from(groupedRuns.values()).map((runs) =>
    buildIssueSuccessMetrics(runs)
  );
  const deliveredIssues = issueMetrics.filter((issue) => issue.latestDeliveryStatus === "completed");
  const startedRunCount = input.runs.length;
  const maxTurnFailureCount = input.runs.filter((run) => isMaxTurnsRun(run)).length;
  const startupFailureCount = input.runs.filter((run) => isStartupFailureRun(run)).length;
  const rateLimitedRunCount = input.runs.filter((run) => isRateLimitedRun(run)).length;
  const highMachinePressureRunCount = input.runs.filter((run) => hasHighMachinePressure(run)).length;
  const missingDeliveryReportFailureCount = input.runs.filter((run) =>
    hasMissingDeliveryReportFailure(run)
  ).length;

  const executive: SymphonyForensicsExecutiveSuccessMetrics = {
    startedIssueCount: issueMetrics.length,
    deliveredIssueCount: deliveredIssues.length,
    issueDeliveryRate: ratio(deliveredIssues.length, issueMetrics.length),
    medianTokensPerDeliveredIssue: medianInteger(deliveredIssues.map((issue) => issue.totalTokens)),
    medianTimeToDeliveredIssueSeconds: medianInteger(
      deliveredIssues
        .map((issue) => issue.timeToDeliveredIssueSeconds)
        .filter((value): value is number => value !== null)
    ),
    deliveryRetryRate: ratio(
      deliveredIssues.filter((issue) => issue.runCount > 1).length,
      deliveredIssues.length
    ),
    maxTurnFailureRate: ratio(maxTurnFailureCount, startedRunCount)
  };

  const diagnostics: SymphonyForensicsDiagnosticSuccessMetrics = {
    startedRunCount,
    deliveredRunCount: input.runs.filter((run) => run.deliveryStatus === "completed").length,
    blockedIssueCount: issueMetrics.filter((issue) => issue.latestDeliveryStatus === "blocked")
      .length,
    partialIssueCount: issueMetrics.filter((issue) => issue.latestDeliveryStatus === "partial")
      .length,
    missingDeliveryReportFailureCount,
    startupFailureRate: ratio(startupFailureCount, startedRunCount),
    rateLimitedRunRate: ratio(rateLimitedRunCount, startedRunCount),
    highMachinePressureRunRate: ratio(highMachinePressureRunCount, startedRunCount),
    medianCachedInputShareDeliveredIssues: medianNumber(
      deliveredIssues
        .map((issue) =>
          issue.totalTokens > 0 ? issue.totalCachedInputTokens / issue.totalTokens : null
        )
        .filter((value): value is number => value !== null)
    )
  };

  return {
    window: input.window,
    executive,
    diagnostics,
    daily: buildDailySuccessMetrics(input.runs)
  };
}

export function buildSuccessMetricWindow(input: {
  timeRange: SymphonyForensicsIssueTimeRange;
  startedAfter?: string | null;
  startedBefore?: string | null;
}): SymphonyForensicsSuccessMetricWindow {
  return {
    timeRange: input.timeRange,
    startedAfter: input.startedAfter ?? null,
    startedBefore: input.startedBefore ?? null
  };
}

function buildDailySuccessMetrics(runs: SymphonyForensicsRunSummary[]): SymphonyForensicsSuccessMetricsDay[] {
  const rows = new Map<
    string,
    {
      startedIssues: Set<string>;
      deliveredIssues: Set<string>;
      startedRunCount: number;
      deliveredRunCount: number;
      maxTurnFailureCount: number;
      startupFailureCount: number;
      rateLimitedRunCount: number;
      totalTokens: number;
    }
  >();

  for (const run of runs) {
    const startedKey = calendarDate(run.startedAt);
    if (startedKey) {
      const startedRow = ensureDailyRow(rows, startedKey);
      startedRow.startedIssues.add(run.issueIdentifier);
      startedRow.startedRunCount += 1;
      startedRow.totalTokens += run.totalTokens;
      if (isMaxTurnsRun(run)) {
        startedRow.maxTurnFailureCount += 1;
      }
      if (isStartupFailureRun(run)) {
        startedRow.startupFailureCount += 1;
      }
      if (isRateLimitedRun(run)) {
        startedRow.rateLimitedRunCount += 1;
      }
    }

    const deliveryKey =
      run.deliveryStatus === "completed" ? calendarDate(run.deliveryReportedAt) : null;
    if (deliveryKey) {
      const deliveryRow = ensureDailyRow(rows, deliveryKey);
      deliveryRow.deliveredIssues.add(run.issueIdentifier);
      deliveryRow.deliveredRunCount += 1;
    }
  }

  return [...rows.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, row]) => ({
      date,
      startedIssueCount: row.startedIssues.size,
      deliveredIssueCount: row.deliveredIssues.size,
      startedRunCount: row.startedRunCount,
      deliveredRunCount: row.deliveredRunCount,
      maxTurnFailureCount: row.maxTurnFailureCount,
      startupFailureCount: row.startupFailureCount,
      rateLimitedRunCount: row.rateLimitedRunCount,
      totalTokens: row.totalTokens
    }));
}

function buildIssueSuccessMetrics(runs: SymphonyForensicsRunSummary[]) {
  const totalTokens = runs.reduce((sum, run) => sum + run.totalTokens, 0);
  const totalCachedInputTokens = runs.reduce((sum, run) => sum + run.cachedInputTokens, 0);
  const earliestStartedAt =
    runs.reduce<string | null>((earliest, run) => {
      if (!earliest) {
        return run.startedAt;
      }

      return Date.parse(run.startedAt) < Date.parse(earliest) ? run.startedAt : earliest;
    }, null) ?? null;
  const latestDeliveryRun =
    runs
      .filter((run) => run.deliveryStatus !== null && run.deliveryReportedAt !== null)
      .sort((left, right) => compareNullableDates(right.deliveryReportedAt, left.deliveryReportedAt))[0] ??
    null;
  const latestCompletedDeliveryRun =
    runs
      .filter((run) => run.deliveryStatus === "completed" && run.deliveryReportedAt !== null)
      .sort((left, right) => compareNullableDates(right.deliveryReportedAt, left.deliveryReportedAt))[0] ??
    null;

  return {
    issueIdentifier: runs[0]?.issueIdentifier ?? "[missing-issue-identifier]",
    runCount: runs.length,
    totalTokens,
    totalCachedInputTokens,
    latestDeliveryStatus: latestDeliveryRun?.deliveryStatus ?? null,
    timeToDeliveredIssueSeconds:
      earliestStartedAt && latestCompletedDeliveryRun?.deliveryReportedAt
        ? durationSeconds(earliestStartedAt, latestCompletedDeliveryRun.deliveryReportedAt)
        : null
  };
}

function ensureDailyRow(
  rows: Map<
    string,
    {
      startedIssues: Set<string>;
      deliveredIssues: Set<string>;
      startedRunCount: number;
      deliveredRunCount: number;
      maxTurnFailureCount: number;
      startupFailureCount: number;
      rateLimitedRunCount: number;
      totalTokens: number;
    }
  >,
  date: string
) {
  let row = rows.get(date);
  if (!row) {
    row = {
      startedIssues: new Set<string>(),
      deliveredIssues: new Set<string>(),
      startedRunCount: 0,
      deliveredRunCount: 0,
      maxTurnFailureCount: 0,
      startupFailureCount: 0,
      rateLimitedRunCount: 0,
      totalTokens: 0
    };
    rows.set(date, row);
  }

  return row;
}

function calendarDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return value.slice(0, 10);
}

function medianInteger(values: number[]): number | null {
  const value = medianNumber(values);
  return value === null ? null : Math.round(value);
}

function medianNumber(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middleIndex = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middleIndex] ?? null;
  }

  const left = sorted[middleIndex - 1];
  const right = sorted[middleIndex];
  return left !== undefined && right !== undefined ? (left + right) / 2 : null;
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return numerator / denominator;
}

function durationSeconds(startedAt: string, endedAt: string): number | null {
  const startedMs = Date.parse(startedAt);
  const endedMs = Date.parse(endedAt);

  if (Number.isNaN(startedMs) || Number.isNaN(endedMs) || endedMs < startedMs) {
    return null;
  }

  return Math.round((endedMs - startedMs) / 1_000);
}

function compareNullableDates(left: string | null, right: string | null): number {
  const leftMs = left ? Date.parse(left) : Number.NEGATIVE_INFINITY;
  const rightMs = right ? Date.parse(right) : Number.NEGATIVE_INFINITY;
  return leftMs - rightMs;
}

function isRateLimitedRun(run: SymphonyForensicsRunSummary): boolean {
  return run.outcome === "rate_limited" || run.errorClass === "rate_limited";
}

function isMaxTurnsRun(run: SymphonyForensicsRunSummary): boolean {
  return (
    run.outcome === "paused_max_turns" ||
    run.outcome === "max_turns_reached" ||
    run.errorClass === "max_turns_reached" ||
    run.agentFailureKind === "max_turns_reached"
  );
}

function isStartupFailureRun(run: SymphonyForensicsRunSummary): boolean {
  return (
    typeof run.outcome === "string" && run.outcome.includes("startup_failure")
  ) || (
    typeof run.errorClass === "string" && run.errorClass.includes("startup_failure")
  ) || run.agentFailureKind === "startup_failure";
}

function hasHighMachinePressure(run: SymphonyForensicsRunSummary): boolean {
  return Boolean(
    run.machineLoad?.hadHighCpu ||
      run.machineLoad?.hadHighMemory ||
      run.machineLoad?.hadHighDisk
  );
}

function hasMissingDeliveryReportFailure(run: SymphonyForensicsRunSummary): boolean {
  return (
    run.errorMessage?.includes("symphony tool finish") === true ||
    run.agentFailureMessagePreview?.includes("symphony tool finish") === true
  );
}
