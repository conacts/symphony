"use client";

import { useMemo } from "react";
import { fetchIssueIndex, shouldRefreshIssueIndex } from "@/core/forensics-client";
import { useRealtimeResource } from "@/core/realtime-resource";
import { buildIssueHref } from "@/core/control-plane-routes";

export function useDashboardIssues(input: {
  runtimeBaseUrl: string;
  websocketUrl: string;
  selectedRepo?: string;
}) {
  const resourceState = useRealtimeResource({
    loadResource: () => fetchIssueIndex(input.runtimeBaseUrl, {}),
    websocketUrl: input.websocketUrl,
    channels: ["issues", "runs"],
    shouldRefresh: shouldRefreshIssueIndex,
    refreshKey: `${input.runtimeBaseUrl}:dashboard-issues`
  });

  const repositories = useMemo(() => {
    const values = resourceState.resource?.facets.repositories ?? [];
    return values.length === 0 ? [] : values;
  }, [resourceState.resource]);

  const issues = useMemo(() => {
    const rows = resourceState.resource?.issues ?? [];
    const scopedRows = input.selectedRepo
      ? rows.filter((issue) => issue.repositoryKey === input.selectedRepo)
      : rows;

    return scopedRows.map((issue) => ({
      repositoryKey: issue.repositoryKey,
      trackerIssueKey: issue.trackerIssueKey,
      title: issue.trackerIssueKey,
      state:
        issue.latestRunStatus ??
        issue.latestRunOutcome ??
        issue.latestProblemOutcome ??
        "Recorded",
      href: buildIssueHref(issue.trackerIssueKey, {
        repo: issue.repositoryKey
      })
    }));
  }, [input.selectedRepo, resourceState.resource]);

  return {
    issues,
    repositories,
    loading: resourceState.loading,
    error: resourceState.error
  };
}
