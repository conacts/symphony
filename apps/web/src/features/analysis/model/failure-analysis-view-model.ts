import type { SymphonyForensicsIssueListResult } from "@symphony/contracts";
import type { CodexAnalysisSampleResource } from "@/features/analysis/hooks/load-codex-analysis-sample";
import {
  formatCount,
  formatErrorClassLabel,
  formatOutcomeLabel,
  formatPercent,
  formatTimestamp
} from "@/core/display-formatters";

export type FailureAnalysisViewModel = {
  summaryCards: Array<{
    label: string;
    value: string;
    detail: string;
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
        label: "Issues with failures",
        value: formatCount(issuesWithFailures.length),
        detail: "Issue inventory entries currently carrying a problem signal."
      },
      {
        label: "Problem run share",
        value: formatPercent(problemRunShare),
        detail: `${formatCount(input.totals.problemRunCount)} problem runs across ${formatCount(input.totals.runCount)} recorded runs.`
      },
      {
        label: "Startup failures",
        value: formatCount(input.totals.startupFailureCount),
        detail: "Runs that failed before the active Codex session really began."
      },
      {
        label: "Dominant failure mode",
        value: formatOutcomeLabel(dominantFailureMode?.outcome ?? null),
        detail: dominantFailureMode
          ? `${formatCount(dominantFailureMode.issueCount)} impacted issues right now.`
          : "No cross-issue failure mode is currently dominant."
      }
    ],
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
        issueHref: `/issues/${issue.issueIdentifier}`,
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
  input: CodexAnalysisSampleResource
): FailureAnalysisViewModel {
  const issueRuns = new Map<
    string,
    CodexAnalysisSampleResource["sampledRuns"]
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
    .filter((issue) => issue !== null);
  const problemRunCount = input.sampledRuns.filter((sampledRun) =>
    isProblemRun(sampledRun.run)
  ).length;
  const startupFailureCount = input.sampledRuns.filter(
    (sampledRun) =>
      sampledRun.run.outcome === "startup_failed" ||
      sampledRun.run.errorClass === "startup_failure_runtime_prepare"
  ).length;
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
  const dominantFailureMode = failureModeRows[0];
  const dominantErrorClass = errorClassRows[0];
  const problemRunShare =
    input.sampledRuns.length === 0 ? 0 : problemRunCount / input.sampledRuns.length;

  return {
    summaryCards: [
      {
        label: "Issues with failures",
        value: formatCount(issueRows.length),
        detail: "Sampled issues currently carrying a problem signal under the active filter."
      },
      {
        label: "Problem run share",
        value: formatPercent(problemRunShare),
        detail: `${formatCount(problemRunCount)} problem runs across ${formatCount(input.sampledRuns.length)} filtered sampled runs.`
      },
      {
        label: "Startup failures",
        value: formatCount(startupFailureCount),
        detail: "Filtered sampled runs that failed before active execution began."
      },
      {
        label: "Dominant failure mode",
        value: formatOutcomeLabel(dominantFailureMode?.outcome ?? null),
        detail: dominantFailureMode
          ? `${formatCount(dominantFailureMode.issueCount)} sampled issues are currently led by this outcome.`
          : "No dominant failure mode is visible in the filtered sample."
      }
    ],
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
        issueHref: `/issues/${issue.issueIdentifier}`,
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
        ? `${formatCount(dominantFailureMode.issueCount)} sampled issues are currently led by this outcome.`
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
  sampledRuns: CodexAnalysisSampleResource["sampledRuns"]
): {
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

  return {
    issueIdentifier,
    latestProblemOutcome: latestProblemRun?.outcome ?? latestProblemRun?.codexFailureKind ?? null,
    latestErrorClass: latestProblemRun?.errorClass ?? latestProblemRun?.codexFailureKind ?? null,
    latestErrorMessage:
      latestProblemRun?.errorMessage ?? latestProblemRun?.codexFailureMessagePreview ?? null,
    latestActivityAt: latestRun?.lastEventAt ?? latestRun?.startedAt ?? null,
    problemRunCount: problemRuns.length,
    retryCount: Math.max(sampledRuns.length - 1, 0)
  };
}

function isProblemRun(
  run: CodexAnalysisSampleResource["sampledRuns"][number]["run"]
): boolean {
  return run.outcome !== "completed" && run.outcome !== null;
}
