import type { SymphonyForensicsSuccessMetricsResult } from "@symphony/contracts";
import {
  formatCount,
  formatDuration,
  formatPercent
} from "@/core/display-formatters";

export type OverviewSuccessMetricsViewModel = {
  cards: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
  completionRows: Array<{
    date: string;
    label: string;
    startedIssueCount: number;
    deliveredIssueCount: number;
    runsPerDeliveredIssue: number | null;
  }>;
  diagnostics: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
};

export function buildOverviewSuccessMetricsViewModel(
  result: SymphonyForensicsSuccessMetricsResult
): OverviewSuccessMetricsViewModel {
  const completedIssueCount = result.executive.deliveredIssueCount;
  const daysCovered = Math.max(1, result.daily.length);
  const deliveryVelocity = completedIssueCount / daysCovered;
  const runsPerDeliveredIssue =
    completedIssueCount === 0
      ? null
      : result.diagnostics.startedRunCount / completedIssueCount;

  return {
    cards: [
      {
        label: "Delivered issues",
        value: formatCount(completedIssueCount),
        detail: `Completed across ${formatCount(daysCovered)} days in the selected window.`
      },
      {
        label: "Delivery velocity",
        value: formatRate(deliveryVelocity),
        detail: "Average delivered issues per day in the selected window."
      },
      {
        label: "Runs per delivered issue",
        value:
          runsPerDeliveredIssue === null
            ? "n/a"
            : formatRate(runsPerDeliveredIssue),
        detail: "Average started runs required to land a completed issue."
      },
      {
        label: "Delivery retries",
        value: formatPercent(result.executive.deliveryRetryRate),
        detail: "Delivered issues that required more than one run."
      }
    ],
    completionRows: result.daily.map((row) => ({
      date: row.date,
      label: formatDayLabel(row.date),
      startedIssueCount: row.startedIssueCount,
      deliveredIssueCount: row.deliveredIssueCount,
      runsPerDeliveredIssue:
        row.deliveredIssueCount === 0
          ? null
          : row.startedRunCount / row.deliveredIssueCount
    })),
    diagnostics: [
      {
        label: "Issue delivery rate",
        value: formatPercent(result.executive.issueDeliveryRate),
        detail: `${formatCount(completedIssueCount)} of ${formatCount(result.executive.startedIssueCount)} started issues reported delivery.`
      },
      {
        label: "Median time to delivery",
        value:
          result.executive.medianTimeToDeliveredIssueSeconds === null
            ? "n/a"
            : formatDuration(result.executive.medianTimeToDeliveredIssueSeconds),
        detail: "Time from first run start to valid completed delivery report."
      },
      {
        label: "Median tokens per delivery",
        value:
          result.executive.medianTokensPerDeliveredIssue === null
            ? "n/a"
            : formatCount(result.executive.medianTokensPerDeliveredIssue),
        detail: "Includes cached input so Pi-heavy work is not understated."
      },
      {
        label: "Cached input share",
        value:
          result.diagnostics.medianCachedInputShareDeliveredIssues === null
            ? "n/a"
            : formatPercent(result.diagnostics.medianCachedInputShareDeliveredIssues),
        detail: "Median share of delivered issue tokens satisfied by cache reads."
      }
    ]
  };
}

function formatRate(value: number): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: value >= 10 ? 0 : 1
  }).format(value);
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
