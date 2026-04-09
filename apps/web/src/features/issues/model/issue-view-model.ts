import type {
  SymphonyForensicsIssueDetailResult,
  SymphonyForensicsIssueForensicsBundleResult,
  SymphonyForensicsIssueListResult
} from "@symphony/contracts";
import {
  formatCount,
  formatDuration,
  formatErrorClassLabel,
  formatEventTypeLabel,
  formatFlagLabel,
  formatOutcomeLabel,
  formatSourceLabel,
  formatStatusLabel,
  formatPercent,
  formatTimestamp,
  formatWholePercent,
  prettyValue
} from "@/core/display-formatters";
import { sortCounts } from "@/core/counts";
import {
  buildIssueHref,
  buildIssueRunHref
} from "@/core/control-plane-routes";

export type IssueActivityRow = {
  entryId: string;
  recordedAt: string;
  source: string;
  eventType: string;
  runId: string | null;
  message: string;
  detail: string;
};

export type IssueActivityViewModel = {
  metrics: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
  latestFailure: {
    runId: string;
    startedAt: string;
    outcome: string;
    errorClass: string;
    errorMessage: string;
  } | null;
  activityRows: IssueActivityRow[];
};

export type IssueRunMachineLoadChartRow = {
  runLabel: string;
  startedAt: string;
  cpuPercent: number | null;
  memoryPercent: number | null;
  diskPercent: number | null;
  pressureHit: boolean;
};

export function buildIssueIndexViewModel(input: SymphonyForensicsIssueListResult) {
  const successRate =
    input.totals.runCount === 0
      ? 0
      : input.totals.completedRunCount / input.totals.runCount;
  const outcomeChartRows = [...input.issues]
    .sort((left, right) => right.runCount - left.runCount)
    .slice(0, 6)
    .map((issue) => ({
      issueIdentifier: issue.issueIdentifier,
      completedRunCount: issue.completedRunCount,
      problemRunCount: issue.problemRunCount
    }));
  const pressureChartRows = [...input.issues]
    .sort(
      (left, right) =>
        right.retryCount +
        right.rateLimitedCount +
        right.maxTurnsCount -
        (left.retryCount + left.rateLimitedCount + left.maxTurnsCount)
    )
    .slice(0, 6)
    .map((issue) => ({
      issueIdentifier: issue.issueIdentifier,
      retryCount: issue.retryCount,
      rateLimitedCount: issue.rateLimitedCount,
      maxTurnsCount: issue.maxTurnsCount
    }));

  return {
    summaryCards: [
      {
        label: "Total issues",
        value: formatCount(input.totals.issueCount)
      },
      {
        label: "Total runs",
        value: formatCount(input.totals.runCount)
      },
      {
        label: "Problem runs",
        value: formatCount(input.totals.problemRunCount)
      },
      {
        label: "Success rate",
        value: formatPercent(successRate)
      }
    ],
    outcomeChartRows,
    pressureChartRows,
    rows: input.issues.map((issue) => ({
      repositoryKey: issue.repositoryKey,
      issueIdentifier: issue.issueIdentifier,
      issueHref: buildIssueHref(issue.issueIdentifier, {
        repo: issue.repositoryKey
      }),
      runCount: formatCount(issue.runCount),
      problemRate: formatPercent(issue.problemRate),
      latestProblemOutcome: formatOutcomeLabel(issue.latestProblemOutcome),
      lastCompletedOutcome: formatOutcomeLabel(issue.lastCompletedOutcome),
      retryCount: formatCount(issue.retryCount),
      avgDuration: formatDuration(issue.avgDurationSeconds),
      lastActive: formatTimestamp(issue.latestActivityAt),
      flags: issue.flags.map((flag) => formatFlagLabel(flag)),
      latestErrorClass: formatErrorClassLabel(issue.latestErrorClass),
      latestErrorMessage: issue.latestErrorMessage ?? "n/a"
    })),
    filters: input.filters,
    facets: input.facets
  };
}

export function buildIssueDetailViewModel(
  input: SymphonyForensicsIssueDetailResult
) {
  const outcomeCounts = new Map<string, number>();
  const recentRuns = [...input.runs].slice(0, 8).reverse();
  const problemRuns = input.runs.filter(
    (run) => run.outcome !== null && run.outcome !== "completed"
  );
  const problemOutcomeCounts = new Map<string, number>();
  const errorClassCounts = new Map<string, number>();
  const latestFailure = problemRuns[0] ?? null;

  for (const run of input.runs) {
    const outcome = run.outcome ?? "unknown";
    outcomeCounts.set(outcome, (outcomeCounts.get(outcome) ?? 0) + 1);
  }

  for (const run of problemRuns) {
    if (run.outcome) {
      problemOutcomeCounts.set(
        run.outcome,
        (problemOutcomeCounts.get(run.outcome) ?? 0) + 1
      );
    }

    if (run.errorClass) {
      errorClassCounts.set(
        run.errorClass,
        (errorClassCounts.get(run.errorClass) ?? 0) + 1
      );
    }
  }

  const dominantProblemOutcome = sortCounts(problemOutcomeCounts)[0];
  const totalInputTokens = input.runs.reduce((total, run) => total + run.inputTokens, 0);
  const totalCachedInputTokens = input.runs.reduce(
    (total, run) => total + run.cachedInputTokens,
    0
  );
  const totalOutputTokens = input.runs.reduce((total, run) => total + run.outputTokens, 0);
  const averageTotalTokens =
    input.runs.length === 0
      ? 0
      : input.runs.reduce((total, run) => total + run.totalTokens, 0) / input.runs.length;
  const heaviestRun = [...input.runs].sort((left, right) => right.totalTokens - left.totalTokens)[0];
  const runMachineLoads = input.runs
    .map((run) => run.machineLoad)
    .filter(
      (
        machineLoad
      ): machineLoad is NonNullable<SymphonyForensicsIssueDetailResult["runs"][number]["machineLoad"]> =>
        machineLoad !== null
    );
  const pressuredRunCount = input.runs.filter(
    (run) =>
      run.machineLoad?.hadHighCpu ||
      run.machineLoad?.hadHighMemory ||
      run.machineLoad?.hadHighDisk
  ).length;
  const peakCpuPercent = runMachineLoads.reduce<number | null>(
    (max, machineLoad) =>
      typeof machineLoad.maxCpuPercent === "number"
        ? Math.max(max ?? 0, machineLoad.maxCpuPercent)
        : max,
    null
  );
  const peakMemoryPercent = runMachineLoads.reduce<number | null>(
    (max, machineLoad) => Math.max(max ?? 0, machineLoad.maxMemoryPercent),
    null
  );
  const peakDiskPercent = runMachineLoads.reduce<number | null>(
    (max, machineLoad) =>
      typeof machineLoad.maxDiskPercent === "number"
        ? Math.max(max ?? 0, machineLoad.maxDiskPercent)
        : max,
    null
  );
  const machineLoadChartRows = recentRuns
    .map((run, index) => ({
      runLabel: buildIssueRunLabel(run.attempt, run.runId, index, recentRuns.length),
      startedAt: formatTimestamp(run.startedAt),
      cpuPercent: run.machineLoad?.maxCpuPercent ?? null,
      memoryPercent: run.machineLoad?.maxMemoryPercent ?? null,
      diskPercent: run.machineLoad?.maxDiskPercent ?? null,
      pressureHit:
        Boolean(run.machineLoad?.hadHighCpu) ||
        Boolean(run.machineLoad?.hadHighMemory) ||
        Boolean(run.machineLoad?.hadHighDisk)
    }))
    .filter(
      (row): row is IssueRunMachineLoadChartRow =>
        row.cpuPercent !== null ||
        row.memoryPercent !== null ||
        row.diskPercent !== null
    );

  return {
    metrics: [
      {
        label: "Runs",
        value: formatCount(input.summary.runCount),
        detail: "Recorded attempts for this issue."
      },
      {
        label: "Latest problem",
        value: formatOutcomeLabel(input.summary.latestProblemOutcome),
        detail: "Most recent non-success outcome."
      },
      {
        label: "Last completed",
        value: formatOutcomeLabel(input.summary.lastCompletedOutcome),
        detail: "Most recent successful/completed outcome."
      }
    ],
    outcomeChartRows: Array.from(outcomeCounts.entries()).map(([outcome, count]) => ({
      outcome: formatOutcomeLabel(outcome),
      count
    })),
    tokenChartRows: recentRuns.map((run, index) => ({
      runLabel: buildIssueRunLabel(run.attempt, run.runId, index, recentRuns.length),
      inputTokens: run.inputTokens,
      cachedInputTokens: run.cachedInputTokens,
      outputTokens: run.outputTokens
    })),
    machineLoadChartRows,
    tokenCards: [
      {
        label: "Issue input tokens",
        value: formatCount(totalInputTokens),
        detail: `${formatCount(totalCachedInputTokens)} cached input tokens across recorded runs.`
      },
      {
        label: "Issue cached input",
        value: formatCount(totalCachedInputTokens),
        detail: `${formatCount(totalOutputTokens)} output tokens across recorded runs.`
      },
      {
        label: "Average run tokens",
        value: formatCount(Math.round(averageTotalTokens)),
        detail: "Average total token load per recorded run."
      },
      {
        label: "Heaviest run",
        value: heaviestRun ? heaviestRun.runId.slice(0, 8) : "n/a",
        detail: heaviestRun
          ? `${formatCount(heaviestRun.totalTokens)} total tokens on the heaviest run.`
          : "No token-heavy run is available yet."
      }
    ],
    machineLoadCards: [
      {
        label: "Runs under pressure",
        value: `${formatCount(pressuredRunCount)} / ${formatCount(input.runs.length)}`,
        detail: "Runs that crossed CPU, memory, or disk high-pressure thresholds."
      },
      {
        label: "Peak CPU load",
        value: formatWholePercent(peakCpuPercent),
        detail: "Highest sampled CPU pressure across this issue's runs."
      },
      {
        label: "Peak memory load",
        value: formatWholePercent(peakMemoryPercent),
        detail: "Highest sampled memory pressure across this issue's runs."
      },
      {
        label: "Peak disk load",
        value: formatWholePercent(peakDiskPercent),
        detail: "Highest sampled disk pressure across this issue's runs."
      }
    ],
    failureCards: [
      {
        label: "Problem runs",
        value: formatCount(problemRuns.length),
        detail: "Non-success outcomes in this issue history."
      },
      {
        label: "Dominant failure",
        value: formatOutcomeLabel(dominantProblemOutcome?.[0] ?? null),
        detail: dominantProblemOutcome
          ? `${formatCount(dominantProblemOutcome[1])} runs currently cluster here.`
          : "No failure mode is currently dominant."
      },
      {
        label: "Latest error class",
        value: formatErrorClassLabel(latestFailure?.errorClass),
        detail:
          latestFailure?.errorMessage ??
          "No recent failure message has been recorded."
      }
    ],
    recentFailureRows: problemRuns.slice(0, 3).map((run) => ({
      runId: run.runId,
      runHref: buildIssueRunHref(input.issueIdentifier, run.runId, {
        repo: input.repositoryKey
      }),
      outcome: formatOutcomeLabel(run.outcome),
      errorClass: formatErrorClassLabel(run.errorClass),
      startedAt: formatTimestamp(run.startedAt),
      message: run.errorMessage ?? "No error message recorded."
    })),
    rows: input.runs.map((run) => ({
      runId: run.runId,
      runHref: buildIssueRunHref(input.issueIdentifier, run.runId, {
        repo: input.repositoryKey
      }),
      startedAtIso: run.startedAt,
      startedAt: formatTimestamp(run.startedAt),
      durationSeconds:
        run.durationSeconds === null ? "n/a" : formatDuration(run.durationSeconds),
      totalTokens: formatCount(run.totalTokens),
      turnsAndEvents: `${formatCount(run.turnCount)} / ${formatCount(run.eventCount)}`,
      status: formatStatusLabel(run.status),
      outcome: formatOutcomeLabel(run.outcome),
      model: run.model ?? "n/a"
    }))
  };
}

function buildIssueRunLabel(
  attempt: number | null,
  runId: string,
  index: number,
  totalRuns: number
) {
  if (typeof attempt === "number" && attempt > 0) {
    return `#${attempt}`;
  }

  const ordinal = totalRuns - index;
  return `Run ${ordinal} · ${runId.slice(0, 6)}`;
}

export function buildIssueActivityViewModel(
  input: SymphonyForensicsIssueForensicsBundleResult
): IssueActivityViewModel {
  const timelineRows = input.timeline.map((entry) => ({
    entryId: `timeline:${entry.entryId}`,
    recordedAt: entry.recordedAt,
    source: formatSourceLabel(entry.source),
    eventType: formatEventTypeLabel(entry.eventType),
    runId: entry.runId,
    message: entry.message ?? formatEventTypeLabel(entry.eventType) ?? "No message",
    detail: prettyValue(entry.payload)
  }));
  const timelineSignatures = new Set(
    input.timeline.map((entry) =>
      buildIssueActivityEntrySignature({
        source: entry.source,
        eventType: entry.eventType,
        runId: entry.runId,
        message: entry.message,
        payload: entry.payload,
        recordedAt: entry.recordedAt
      })
    )
  );
  const runtimeRows = input.runtimeLogs
    .filter(
      (entry) =>
        !timelineSignatures.has(
          buildIssueActivityEntrySignature({
            source: entry.source,
            eventType: entry.eventType,
            runId: entry.runId,
            message: entry.message,
            payload: entry.payload,
            recordedAt: entry.recordedAt
          })
        )
    )
    .map((entry) => ({
      entryId: `runtime:${entry.entryId}`,
      recordedAt: entry.recordedAt,
      source: formatSourceLabel(`runtime:${entry.source}`),
      eventType: formatEventTypeLabel(entry.eventType),
      runId: entry.runId,
      message: entry.message ?? formatEventTypeLabel(entry.eventType) ?? "No message",
      detail: prettyValue(entry.payload)
    }));
  const activityRows = [...timelineRows, ...runtimeRows]
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
    .map((row) => ({
      ...row,
      recordedAt: formatTimestamp(row.recordedAt)
    }));

  return {
    metrics: [
      {
        label: "Runs",
        value: formatCount(input.issue.runCount),
        detail: "Recorded attempts for this issue."
      },
      {
        label: "Problem rate",
        value: formatPercent(input.issue.problemRate),
        detail: "Share of runs ending in a non-success outcome."
      },
      {
        label: "Timeline entries",
        value: formatCount(input.timeline.length),
        detail: "Persisted issue-level timeline events."
      },
      {
        label: "Runtime logs",
        value: formatCount(input.runtimeLogs.length),
        detail: "Persisted runtime-side logs for this issue."
      }
    ],
    latestFailure:
      input.latestFailure === null
        ? null
        : {
            runId: input.latestFailure.runId,
            startedAt: formatTimestamp(input.latestFailure.startedAt),
            outcome: formatOutcomeLabel(input.latestFailure.outcome),
            errorClass: formatErrorClassLabel(input.latestFailure.errorClass),
            errorMessage: input.latestFailure.errorMessage ?? "n/a"
          },
    activityRows
  };
}

function buildIssueActivityEntrySignature(input: {
  source: string;
  eventType: string;
  runId: string | null;
  message: string | null;
  payload: unknown;
  recordedAt: string;
}) {
  return JSON.stringify([
    input.source,
    input.eventType,
    input.runId,
    input.message,
    input.recordedAt,
    prettyValue(input.payload)
  ]);
}
