import type {
  SymphonyForensicsIssueFilters,
  SymphonyForensicsIssuesQuery,
  SymphonyForensicsRunStore,
  SymphonyForensicsReadModelDependencies
} from "./symphony-forensics-read-model.js";

export function normalizeDependencies(
  input: SymphonyForensicsRunStore | SymphonyForensicsReadModelDependencies
): SymphonyForensicsReadModelDependencies {
  if ("journal" in input) {
    return {
      listIssueTimeline: async () => [],
      listRuntimeLogs: async () => [],
      ...input
    };
  }

  return {
    journal: input,
    listIssueTimeline: async () => [],
    listRuntimeLogs: async () => []
  };
}

export function normalizeFilters(
  input: SymphonyForensicsIssuesQuery
): SymphonyForensicsIssueFilters {
  return {
    limit: input.limit ?? null,
    timeRange: input.timeRange ?? "all",
    startedAfter: input.startedAfter ?? null,
    startedBefore: input.startedBefore ?? null,
    outcome: input.outcome ?? null,
    errorClass: input.errorClass ?? null,
    hasFlags: input.hasFlags ?? [],
    sortBy: input.sortBy ?? "lastActive",
    sortDirection: input.sortDirection ?? "desc"
  };
}

export function filterRecordedEntries<T extends { recordedAt: string }>(
  entries: T[],
  filters: SymphonyForensicsIssueFilters
): T[] {
  return entries.filter((entry) => {
    const recordedAtMs = Date.parse(entry.recordedAt);

    if (filters.startedAfter) {
      const startedAfterMs = Date.parse(filters.startedAfter);

      if (
        !Number.isNaN(recordedAtMs) &&
        !Number.isNaN(startedAfterMs) &&
        recordedAtMs < startedAfterMs
      ) {
        return false;
      }
    }

    if (filters.startedBefore) {
      const startedBeforeMs = Date.parse(filters.startedBefore);

      if (
        !Number.isNaN(recordedAtMs) &&
        !Number.isNaN(startedBeforeMs) &&
        recordedAtMs > startedBeforeMs
      ) {
        return false;
      }
    }

    return true;
  });
}
