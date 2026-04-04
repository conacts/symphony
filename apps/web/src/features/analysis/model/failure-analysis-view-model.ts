import type { SymphonyForensicsIssueListResult } from "@symphony/contracts";
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

function countIssueFrequency<T>(
  issues: SymphonyForensicsIssueListResult["issues"],
  getValue: (issue: SymphonyForensicsIssueListResult["issues"][number]) => T | null
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
