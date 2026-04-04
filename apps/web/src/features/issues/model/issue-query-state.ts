"use client";

import type {
  SymphonyForensicsIssueSortBy,
  SymphonyForensicsIssueSortDirection,
  SymphonyForensicsIssueTimeRange,
  SymphonyForensicsIssuesQuery
} from "@symphony/contracts";

const validTimeRanges = new Set<SymphonyForensicsIssueTimeRange>([
  "all",
  "24h",
  "7d",
  "30d",
  "custom"
]);

const validSortBy = new Set<SymphonyForensicsIssueSortBy>([
  "lastActive",
  "problemRate",
  "totalTokens",
  "retries",
  "runCount",
  "avgDuration"
]);

const validSortDirection = new Set<SymphonyForensicsIssueSortDirection>([
  "asc",
  "desc"
]);

export function buildIssueQueryFromSearchParams(
  searchParams: Pick<URLSearchParams, "get">
): SymphonyForensicsIssuesQuery {
  const timeRange = parseTimeRange(searchParams.get("timeRange"));
  const sortBy = parseSortBy(searchParams.get("sortBy"));
  const sortDirection = parseSortDirection(searchParams.get("sortDirection"));

  return {
    timeRange,
    startedAfter: buildStartedAfter(timeRange),
    startedBefore: undefined,
    outcome: parseOptionalFilter(searchParams.get("outcome")),
    errorClass: parseOptionalFilter(searchParams.get("errorClass")),
    sortBy,
    sortDirection
  };
}

export function buildIssueSearchParams(
  query: SymphonyForensicsIssuesQuery
): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (query.timeRange && query.timeRange !== "all") {
    searchParams.set("timeRange", query.timeRange);
  }

  if (query.outcome) {
    searchParams.set("outcome", query.outcome);
  }

  if (query.errorClass) {
    searchParams.set("errorClass", query.errorClass);
  }

  if (query.sortBy && query.sortBy !== "lastActive") {
    searchParams.set("sortBy", query.sortBy);
  }

  if (query.sortDirection && query.sortDirection !== "desc") {
    searchParams.set("sortDirection", query.sortDirection);
  }

  return searchParams;
}

function parseTimeRange(value: string | null): SymphonyForensicsIssueTimeRange {
  if (value && validTimeRanges.has(value as SymphonyForensicsIssueTimeRange)) {
    return value as SymphonyForensicsIssueTimeRange;
  }

  return "all";
}

function parseSortBy(value: string | null): SymphonyForensicsIssueSortBy {
  if (value && validSortBy.has(value as SymphonyForensicsIssueSortBy)) {
    return value as SymphonyForensicsIssueSortBy;
  }

  return "lastActive";
}

function parseSortDirection(
  value: string | null
): SymphonyForensicsIssueSortDirection {
  if (
    value &&
    validSortDirection.has(value as SymphonyForensicsIssueSortDirection)
  ) {
    return value as SymphonyForensicsIssueSortDirection;
  }

  return "desc";
}

function parseOptionalFilter(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildStartedAfter(
  timeRange: SymphonyForensicsIssueTimeRange
): string | undefined {
  const now = Date.now();
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
