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
  trendRows: Array<{
    date: string;
    label: string;
    startedIssueCount: number;
    deliveredIssueCount: number;
    maxTurnFailureCount: number;
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
  return {
    cards: [
      {
        label: "Issue delivery rate",
        value: formatPercent(result.executive.issueDeliveryRate),
        detail: `${formatCount(result.executive.deliveredIssueCount)} of ${formatCount(result.executive.startedIssueCount)} started issues reported delivery.`
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
        label: "Delivery retries",
        value: formatPercent(result.executive.deliveryRetryRate),
        detail: "Delivered issues that required more than one run."
      }
    ],
    trendRows: result.daily.map((row) => ({
      date: row.date,
      label: formatDayLabel(row.date),
      startedIssueCount: row.startedIssueCount,
      deliveredIssueCount: row.deliveredIssueCount,
      maxTurnFailureCount: row.maxTurnFailureCount
    })),
    diagnostics: [
      {
        label: "Max-turn failures",
        value: formatPercent(result.executive.maxTurnFailureRate),
        detail: `${formatCount(result.daily.reduce((sum, row) => sum + row.maxTurnFailureCount, 0))} max-turn failures across ${formatCount(result.diagnostics.startedRunCount)} runs in this window.`
      },
      {
        label: "Startup failures",
        value: formatPercent(result.diagnostics.startupFailureRate),
        detail: "Runs that failed before the agent could make meaningful progress."
      },
      {
        label: "Rate-limited runs",
        value: formatPercent(result.diagnostics.rateLimitedRunRate),
        detail: "Runs interrupted by provider rate limiting."
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
