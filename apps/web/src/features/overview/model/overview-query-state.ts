"use client";

import type { SymphonyForensicsIssueTimeRange, SymphonyForensicsSuccessMetricsQuery } from "@symphony/contracts";

export type OverviewTimeRange = Exclude<SymphonyForensicsIssueTimeRange, "custom">;

const validTimeRanges = new Set<OverviewTimeRange>(["all", "24h", "7d", "30d"]);

export const overviewTimeRangeOptions = [
  { value: "7d", label: "Week" },
  { value: "30d", label: "Month" },
  { value: "24h", label: "24h" },
  { value: "all", label: "All" }
] as const satisfies ReadonlyArray<{ value: OverviewTimeRange; label: string }>;

export function parseOverviewTimeRange(
  value: string | null | undefined
): OverviewTimeRange {
  if (value && validTimeRanges.has(value as OverviewTimeRange)) {
    return value as OverviewTimeRange;
  }

  return "7d";
}

export function buildOverviewSuccessMetricsQuery(input: {
  timeRange: OverviewTimeRange;
  now?: number;
}): SymphonyForensicsSuccessMetricsQuery {
  return {
    timeRange: input.timeRange,
    startedAfter: buildStartedAfterForTimeRange(input.timeRange, input.now),
    startedBefore: undefined
  };
}

export function buildOverviewSearchParams(
  searchParams: Pick<URLSearchParams, "toString">,
  timeRange: OverviewTimeRange
): URLSearchParams {
  const nextSearchParams = new URLSearchParams(searchParams.toString());

  if (timeRange === "7d") {
    nextSearchParams.delete("timeRange");
  } else {
    nextSearchParams.set("timeRange", timeRange);
  }

  return nextSearchParams;
}

function buildStartedAfterForTimeRange(
  timeRange: OverviewTimeRange,
  now: number = Date.now()
): string | undefined {
  const lookbackMs =
    timeRange === "24h"
      ? 24 * 60 * 60 * 1000
      : timeRange === "7d"
        ? 7 * 24 * 60 * 60 * 1000
        : timeRange === "30d"
          ? 30 * 24 * 60 * 60 * 1000
          : null;

  return lookbackMs === null
    ? undefined
    : new Date(now - lookbackMs).toISOString();
}
