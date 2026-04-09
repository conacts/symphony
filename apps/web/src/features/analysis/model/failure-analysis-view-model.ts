import type { SymphonyForensicsIssueListResult } from "@symphony/contracts";
import type { AgentAnalysisSampleResource } from "@/features/analysis/hooks/load-agent-analysis-sample";
import { buildFailureAnalysisWindowStart, type FailureAnalysisTimeRange } from "@/features/analysis/model/failure-analysis-query-state";
import {
  formatCount,
  formatErrorClassLabel,
  formatOutcomeLabel,
  formatPercent,
  formatTimestamp
} from "@/core/display-formatters";
import { buildIssueHref } from "@/core/control-plane-routes";

export type FailureAnalysisViewModel = {
  summaryCards: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
  timeSeriesRows: Array<{
    date: string;
    label: string;
    totalFailures: number;
    maxTurnsFailures: number;
    startupFailures: number;
    rateLimitedFailures: number;
    providerTransientFailures: number;
    otherFailures: number;
  }>;
  failureModeRows: Array<{
    outcome: string;
    issueCount: number;
  }>;
  errorClassRows: Array<{
    errorClass: string;
    issueCount: number;
  }>;
  hotspotRows: Array<{
    issueIdentifier: string;
    issueHref: string;
    latestProblemOutcome: string;
    latestErrorClass: string;
    problemRuns: string;
    retries: string;
    lastActive: string;
    latestErrorMessage: string;
  }>;
  spotlight: {
    dominantFailureMode: string;
    dominantFailureModeDetail: string;
    dominantErrorClass: string;
    dominantErrorClassDetail: string;
  };
};

export function buildFailureAnalysisViewModel(
  input: SymphonyForensicsIssueListResult
): FailureAnalysisViewModel {
  const issuesWithFailures = input.issues.filter(
    (issue) =>
      issue.problemRunCount > 0 ||
      issue.latestProblemOutcome !== null ||
      issue.latestErrorClass !== null
  );
  const failureModeRows = countIssueFrequency(
    issuesWithFailures,
    (issue) => issue.latestProblemOutcome
  )
    .map(([outcome, issueCount]) => ({
      outcome: formatOutcomeLabel(outcome),
      issueCount
    }))
    .slice(0, 6);
  const errorClassRows = countIssueFrequency(
    issuesWithFailures,
    (issue) => issue.latestErrorClass
  )
    .map(([errorClass, issueCount]) => ({
      errorClass: formatErrorClassLabel(errorClass),
      issueCount
    }))
    .slice(0, 6);
  const dominantFailureMode = failureModeRows[0];
  const dominantErrorClass = errorClassRows[0];
  const problemRunShare =
    input.totals.runCount === 0
      ? 0
      : input.totals.problemRunCount / input.totals.runCount;

  return {
    summaryCards: [
      {
        label: "Failed runs",
        value: formatCount(input.totals.problemRunCount),
        detail: "Problem runs across the full issue inventory."
      },
      {
        label: "Issues affected",
        value: formatCount(issuesWithFailures.length),
        detail: "Issue inventory entries currently carrying a problem signal."
      },
      {
        label: "Problem run share",
        value: formatPercent(problemRunShare),
        detail: `${formatCount(input.totals.problemRunCount)} problem runs across ${formatCount(input.totals.runCount)} recorded runs.`
      }
    ],
    timeSeriesRows: [],
    failureModeRows,
    errorClassRows,
    hotspotRows: [...issuesWithFailures]
      .sort(
        (left, right) =>
          right.problemRunCount - left.problemRunCount ||
          right.retryCount - left.retryCount ||
          (right.latestActivityAt ?? "").localeCompare(left.latestActivityAt ?? "")
      )
      .slice(0, 8)
      .map((issue) => ({
        issueIdentifier: issue.issueIdentifier,
        issueHref: buildIssueHref(issue.issueIdentifier, {
          repo: issue.repositoryKey
        }),
        latestProblemOutcome: formatOutcomeLabel(issue.latestProblemOutcome),
        latestErrorClass: formatErrorClassLabel(issue.latestErrorClass),
        problemRuns: formatCount(issue.problemRunCount),
        retries: formatCount(issue.retryCount),
        lastActive: formatTimestamp(issue.latestActivityAt),
        latestErrorMessage: issue.latestErrorMessage ?? "No error message recorded."
      })),
    spotlight: {
      dominantFailureMode:
        dominantFailureMode?.outcome === undefined
          ? "No current failure mode"
          : formatOutcomeLabel(dominantFailureMode.outcome),
      dominantFailureModeDetail: dominantFailureMode
        ? `${formatCount(dominantFailureMode.issueCount)} issues are currently led by this outcome.`
        : "The current issue set does not show a dominant failure outcome.",
      dominantErrorClass:
        dominantErrorClass?.errorClass === undefined
          ? "No current error class"
          : formatErrorClassLabel(dominantErrorClass.errorClass),
      dominantErrorClassDetail: dominantErrorClass
        ? `${formatCount(dominantErrorClass.issueCount)} issues currently report this class.`
        : "The current issue set does not show a dominant error class."
    }
  };
}

export function buildFailureAnalysisViewModelFromSample(
  input: AgentAnalysisSampleResource,
  options?: {
    timeRange?: FailureAnalysisTimeRange;
    now?: number;
  }
): FailureAnalysisViewModel {
  const issueRuns = new Map<
    string,
    AgentAnalysisSampleResource["sampledRuns"]
  >();

  for (const sampledRun of input.sampledRuns) {
    const current = issueRuns.get(sampledRun.issueIdentifier);

    if (current) {
      current.push(sampledRun);
      continue;
    }

    issueRuns.set(sampledRun.issueIdentifier, [sampledRun]);
  }

  const issueRows = Array.from(issueRuns.entries())
    .map(([issueIdentifier, sampledRuns]) => buildFailureIssueRow(issueIdentifier, sampledRuns))
    .filter(isFailureIssueRow);
  const timeSeriesRows = buildFailureTimeSeriesRows(
    input.sampledRuns,
    options?.timeRange ?? "7d",
    options?.now ?? Date.now()
  );
  const problemRuns = input.sampledRuns.filter((sampledRun) =>
    isProblemRun(sampledRun.run)
  );
  const failureTypeCounts = countFailureTypeFrequency(problemRuns);
  const totalProblemRuns = problemRuns.length;
  const affectedIssues = new Set(problemRuns.map((sampledRun) => sampledRun.issueIdentifier));
  const dominantFailureType = failureTypeCounts[0];
  const failureModeRows = countIssueFrequency(issueRows, (issue) => issue.latestProblemOutcome)
    .map(([outcome, issueCount]) => ({
      outcome: formatOutcomeLabel(outcome),
      issueCount
    }))
    .slice(0, 6);
  const errorClassRows = countIssueFrequency(issueRows, (issue) => issue.latestErrorClass)
    .map(([errorClass, issueCount]) => ({
      errorClass: formatErrorClassLabel(errorClass),
      issueCount
    }))
    .slice(0, 6);
  const dominantIssueOutcome = failureModeRows[0];
  const dominantErrorClass = errorClassRows[0];

  return {
    summaryCards: [
      {
        label: "Failed runs",
        value: formatCount(totalProblemRuns),
        detail: "Problem runs in the selected window."
      },
      {
        label: "Issues affected",
        value: formatCount(affectedIssues.size),
        detail: "Distinct issues carrying a failure signal."
      },
      {
        label: "Dominant failure type",
        value: formatOutcomeLabel(dominantFailureType?.type ?? null),
        detail: dominantFailureType
          ? `${formatCount(dominantFailureType.issueCount)} sampled runs carry this failure type.`
          : "No failure type is dominant in the selected window."
      }
    ],
    timeSeriesRows,
    failureModeRows,
    errorClassRows,
    hotspotRows: issueRows
      .sort(
        (left, right) =>
          right.problemRunCount - left.problemRunCount ||
          right.retryCount - left.retryCount ||
          (right.latestActivityAt ?? "").localeCompare(left.latestActivityAt ?? "")
      )
      .slice(0, 8)
      .map((issue) => ({
        issueIdentifier: issue.issueIdentifier,
        issueHref: buildIssueHref(issue.issueIdentifier, {
          repo: issue.repositoryKey
        }),
        latestProblemOutcome: formatOutcomeLabel(issue.latestProblemOutcome),
        latestErrorClass: formatErrorClassLabel(issue.latestErrorClass),
        problemRuns: formatCount(issue.problemRunCount),
        retries: formatCount(issue.retryCount),
        lastActive: formatTimestamp(issue.latestActivityAt),
        latestErrorMessage: issue.latestErrorMessage ?? "No error message recorded."
      })),
    spotlight: {
      dominantFailureMode:
        dominantIssueOutcome?.outcome === undefined
          ? "No current failure mode"
          : formatOutcomeLabel(dominantIssueOutcome.outcome),
      dominantFailureModeDetail: dominantIssueOutcome
        ? `${formatCount(dominantIssueOutcome.issueCount)} sampled issues are currently led by this outcome.`
        : "The filtered sample does not show a dominant failure outcome.",
      dominantErrorClass:
        dominantErrorClass?.errorClass === undefined
          ? "No current error class"
          : formatErrorClassLabel(dominantErrorClass.errorClass),
      dominantErrorClassDetail: dominantErrorClass
        ? `${formatCount(dominantErrorClass.issueCount)} sampled issues currently report this class.`
        : "The filtered sample does not show a dominant error class."
    }
  };
}

function buildFailureTimeSeriesRows(
  sampledRuns: AgentAnalysisSampleResource["sampledRuns"],
  timeRange: FailureAnalysisTimeRange,
  now: number
): Array<{
  date: string;
  label: string;
  totalFailures: number;
  maxTurnsFailures: number;
  startupFailures: number;
  rateLimitedFailures: number;
  providerTransientFailures: number;
  otherFailures: number;
}> {
  const startWindow = buildFailureAnalysisWindowStart(timeRange, now);
  const dailyTotals = new Map<
    string,
    {
      date: string;
      totalFailures: number;
      maxTurnsFailures: number;
      startupFailures: number;
      rateLimitedFailures: number;
      providerTransientFailures: number;
      otherFailures: number;
    }
  >();
  const problemRuns = sampledRuns.filter((sampledRun) => isProblemRun(sampledRun.run));

  for (const sampledRun of problemRuns) {
    const date = sampledRun.run.startedAt.slice(0, 10);
    if (!date) {
      continue;
    }

    if (startWindow !== null && Date.parse(sampledRun.run.startedAt) < startWindow) {
      continue;
    }

    const current = dailyTotals.get(date);
    const failureType = classifyFailureType(sampledRun.run);

    if (current) {
      current.totalFailures += 1;
      incrementFailureType(current, failureType);
      continue;
    }

    const row = {
      date,
      totalFailures: 1,
      maxTurnsFailures: 0,
      startupFailures: 0,
      rateLimitedFailures: 0,
      providerTransientFailures: 0,
      otherFailures: 0
    };
    incrementFailureType(row, failureType);
    dailyTotals.set(date, row);
  }

  const dates = [...dailyTotals.keys()].sort();

  if (dates.length === 0) {
    return [];
  }

  const startDate =
    startWindow !== null
      ? new Date(startWindow)
      : new Date(`${dates[0]}T00:00:00.000Z`);
  const endDate =
    startWindow !== null
      ? (() => {
          const end = new Date(now);
          end.setUTCHours(0, 0, 0, 0);
          return end;
        })()
      : new Date(`${dates[dates.length - 1]}T00:00:00.000Z`);
  const rows: Array<{
    date: string;
    label: string;
    totalFailures: number;
    maxTurnsFailures: number;
    startupFailures: number;
    rateLimitedFailures: number;
    providerTransientFailures: number;
    otherFailures: number;
  }> = [];

  for (
    let cursor = new Date(startDate.getTime());
    cursor.getTime() <= endDate.getTime();
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const date = cursor.toISOString().slice(0, 10);
    const row = dailyTotals.get(date);
    rows.push({
      date,
      label: formatDayLabel(date),
      totalFailures: row?.totalFailures ?? 0,
      maxTurnsFailures: row?.maxTurnsFailures ?? 0,
      startupFailures: row?.startupFailures ?? 0,
      rateLimitedFailures: row?.rateLimitedFailures ?? 0,
      providerTransientFailures: row?.providerTransientFailures ?? 0,
      otherFailures: row?.otherFailures ?? 0
    });
  }

  return rows;
}

function countFailureTypeFrequency(
  sampledRuns: AgentAnalysisSampleResource["sampledRuns"]
): Array<{
  type: FailureType;
  issueCount: number;
}> {
  const counts = new Map<FailureType, number>();

  for (const sampledRun of sampledRuns) {
    const type = classifyFailureType(sampledRun.run);
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  return Array.from(counts.entries()).sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return left[0].localeCompare(right[0]);
  }).map(([type, issueCount]) => ({
    type,
    issueCount
  }));
}

function incrementFailureType(
  target: {
    maxTurnsFailures: number;
    startupFailures: number;
    rateLimitedFailures: number;
    providerTransientFailures: number;
    otherFailures: number;
  },
  failureType: FailureType
) {
  if (failureType === "max_turns") {
    target.maxTurnsFailures += 1;
    return;
  }

  if (failureType === "startup_failure") {
    target.startupFailures += 1;
    return;
  }

  if (failureType === "rate_limited") {
    target.rateLimitedFailures += 1;
    return;
  }

  if (failureType === "provider_transient") {
    target.providerTransientFailures += 1;
    return;
  }

  target.otherFailures += 1;
}

function classifyFailureType(
  run: AgentAnalysisSampleResource["sampledRuns"][number]["run"]
): FailureType {
  const outcome = run.outcome ?? null;
  const errorClass = run.errorClass ?? null;
  const failureKind = run.agentFailureKind ?? null;

  if (
    outcome === "startup_failed" ||
    failureKind === "startup_failure" ||
    errorClass?.includes("startup_failure") === true
  ) {
    return "startup_failure";
  }

  if (
    outcome === "rate_limited" ||
    failureKind === "rate_limited" ||
    errorClass === "rate_limited" ||
    errorClass === "rate_limit_exceeded"
  ) {
    return "rate_limited";
  }

  if (
    outcome === "paused_max_turns" ||
    outcome === "max_turns_reached" ||
    failureKind === "max_turns_reached" ||
    errorClass === "max_turns_reached" ||
    errorClass === "max_turns"
  ) {
    return "max_turns";
  }

  if (
    outcome === "provider_transient" ||
    failureKind === "provider_transient" ||
    errorClass === "provider_transient"
  ) {
    return "provider_transient";
  }

  return "other";
}

function countIssueFrequency<T>(
  issues: Array<{
    latestProblemOutcome: string | null;
    latestErrorClass: string | null;
  }>,
  getValue: (issue: {
    latestProblemOutcome: string | null;
    latestErrorClass: string | null;
  }) => T | null
) {
  const counts = new Map<string, number>();

  for (const issue of issues) {
    const value = getValue(issue);

    if (!value) {
      continue;
    }

    const key = String(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries()).sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return left[0].localeCompare(right[0]);
  });
}

function buildFailureIssueRow(
  issueIdentifier: string,
  sampledRuns: AgentAnalysisSampleResource["sampledRuns"]
): {
  repositoryKey: string;
  issueIdentifier: string;
  latestProblemOutcome: string | null;
  latestErrorClass: string | null;
  latestErrorMessage: string | null;
  latestActivityAt: string | null;
  problemRunCount: number;
  retryCount: number;
} | null {
  const problemRuns = sampledRuns.filter((sampledRun) => isProblemRun(sampledRun.run));

  if (problemRuns.length === 0) {
    return null;
  }

  const latestRun = [...sampledRuns].sort((left, right) =>
    (right.run.startedAt ?? "").localeCompare(left.run.startedAt ?? "")
  )[0]?.run;
  const latestProblemRun = [...problemRuns].sort((left, right) =>
    (right.run.startedAt ?? "").localeCompare(left.run.startedAt ?? "")
  )[0]?.run;
  const latestFailureKind = latestProblemRun?.agentFailureKind ?? null;
  const latestFailureMessage = latestProblemRun?.agentFailureMessagePreview ?? null;

  return {
    repositoryKey:
      latestRun?.repositoryKey ??
      latestProblemRun?.repositoryKey ??
      DEFAULT_REPOSITORY_KEY,
    issueIdentifier,
    latestProblemOutcome: latestProblemRun?.outcome ?? latestFailureKind,
    latestErrorClass: latestProblemRun?.errorClass ?? latestFailureKind,
    latestErrorMessage: latestProblemRun?.errorMessage ?? latestFailureMessage,
    latestActivityAt: latestRun?.lastEventAt ?? latestRun?.startedAt ?? null,
    problemRunCount: problemRuns.length,
    retryCount: Math.max(sampledRuns.length - 1, 0)
  };
}

function isFailureIssueRow(
  value: ReturnType<typeof buildFailureIssueRow>
): value is NonNullable<ReturnType<typeof buildFailureIssueRow>> {
  return value !== null;
}

function formatDayLabel(value: string): string {
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(parsed));
}

const DEFAULT_REPOSITORY_KEY = "symphony";

type FailureType =
  | "max_turns"
  | "startup_failure"
  | "rate_limited"
  | "provider_transient"
  | "other";

function isProblemRun(
  run: AgentAnalysisSampleResource["sampledRuns"][number]["run"]
): boolean {
  return run.outcome !== "completed" && run.outcome !== null;
}
