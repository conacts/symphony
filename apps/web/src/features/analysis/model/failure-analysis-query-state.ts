"use client";

export type FailureAnalysisTimeRange = "7d" | "30d" | "all";

export type FailureAnalysisQuery = {
  model?: string;
  timeRange: FailureAnalysisTimeRange;
};

const validTimeRanges = new Set<FailureAnalysisTimeRange>(["7d", "30d", "all"]);

export const failureAnalysisTimeRangeOptions = [
  { value: "7d", label: "Week" },
  { value: "30d", label: "Month" },
  { value: "all", label: "All" }
] as const satisfies ReadonlyArray<{
  value: FailureAnalysisTimeRange;
  label: string;
}>;

export function parseFailureAnalysisQueryFromSearchParams(
  searchParams: Pick<URLSearchParams, "get">
): FailureAnalysisQuery {
  return {
    model: parseOptionalValue(searchParams.get("model")),
    timeRange: parseFailureAnalysisTimeRange(searchParams.get("timeRange"))
  };
}

export function buildFailureAnalysisSearchParams(
  searchParams: Pick<URLSearchParams, "toString">,
  query: Pick<FailureAnalysisQuery, "model" | "timeRange">
): URLSearchParams {
  const nextSearchParams = new URLSearchParams(searchParams.toString());

  if (query.model) {
    nextSearchParams.set("model", query.model);
  } else {
    nextSearchParams.delete("model");
  }

  if (query.timeRange === "7d") {
    nextSearchParams.delete("timeRange");
  } else {
    nextSearchParams.set("timeRange", query.timeRange);
  }

  return nextSearchParams;
}

export function buildFailureAnalysisWindowStart(
  timeRange: FailureAnalysisTimeRange,
  now: number = Date.now()
): number | null {
  const lookbackMs =
    timeRange === "7d"
      ? 7 * 24 * 60 * 60 * 1000
      : timeRange === "30d"
        ? 30 * 24 * 60 * 60 * 1000
        : null;

  if (lookbackMs === null) {
    return null;
  }

  const anchor = new Date(now);
  anchor.setUTCHours(0, 0, 0, 0);

  return anchor.getTime() - lookbackMs;
}

export function parseFailureAnalysisTimeRange(
  value: string | null | undefined
): FailureAnalysisTimeRange {
  if (value && validTimeRanges.has(value as FailureAnalysisTimeRange)) {
    return value as FailureAnalysisTimeRange;
  }

  return "7d";
}

function parseOptionalValue(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
