"use client";

export type TokenAnalysisTimeRange = "7d" | "30d" | "all";

type TokenAnalysisQuery = {
  repo?: string;
  model?: string;
  timeRange: TokenAnalysisTimeRange;
};

const validTimeRanges = new Set<TokenAnalysisTimeRange>(["7d", "30d", "all"]);

const tokenAnalysisTimeRangeOptions = [
  { value: "7d", label: "Week" },
  { value: "30d", label: "Month" },
  { value: "all", label: "All" }
] as const satisfies ReadonlyArray<{
  value: TokenAnalysisTimeRange;
  label: string;
}>;

export function parseTokenAnalysisQueryFromSearchParams(
  searchParams: Pick<URLSearchParams, "get">
): TokenAnalysisQuery {
  return {
    repo: parseOptionalValue(searchParams.get("repo")),
    model: parseOptionalValue(searchParams.get("model")),
    timeRange: parseTokenAnalysisTimeRange(searchParams.get("timeRange"))
  };
}

export function buildTokenAnalysisSearchParams(
  searchParams: Pick<URLSearchParams, "toString">,
  query: Pick<TokenAnalysisQuery, "model" | "timeRange">
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

export function buildTokenAnalysisWindowStart(
  timeRange: TokenAnalysisTimeRange,
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

function parseTokenAnalysisTimeRange(
  value: string | null | undefined
): TokenAnalysisTimeRange {
  if (value && validTimeRanges.has(value as TokenAnalysisTimeRange)) {
    return value as TokenAnalysisTimeRange;
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
