"use client";

import { useEffect, useState } from "react";
import type {
  SymphonyDashboardActiveIssue
} from "@/core/dashboard-foundation";
import { useRealtimeResource } from "@/core/realtime-resource";
import { fetchRuntimeIssue } from "@/core/runtime-operator-client";
import {
  fetchRuntimeSummary,
  shouldRefreshRuntimeSummary
} from "@/core/runtime-summary-client";
import type { SymphonyRuntimeStateResult } from "@symphony/contracts";

export function useDashboardActiveIssues(input: {
  runtimeBaseUrl: string;
  stateUrl: string;
  websocketUrl: string;
}) {
  const runtimeSummaryState = useRealtimeResource({
    loadResource: () => fetchRuntimeSummary(input.stateUrl),
    websocketUrl: input.websocketUrl,
    channels: ["runtime"],
    shouldRefresh: shouldRefreshRuntimeSummary,
    refreshKey: `${input.stateUrl}:${input.websocketUrl}:sidebar-active-issues`
  });
  const [activeIssues, setActiveIssues] = useState<SymphonyDashboardActiveIssue[]>([]);

  useEffect(() => {
    const runtimeSummary = runtimeSummaryState.resource;
    if (!runtimeSummary) {
      setActiveIssues([]);
      return;
    }

    const issueIdentifiers = collectActiveIssueIdentifiers(runtimeSummary);
    if (issueIdentifiers.length === 0) {
      setActiveIssues([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      const resolvedIssues = await Promise.all(
        issueIdentifiers.map(async (issueIdentifier) => {
          try {
            const runtimeIssue = await fetchRuntimeIssue(
              input.runtimeBaseUrl,
              issueIdentifier
            );

            return {
              issueIdentifier,
              title: runtimeIssue.tracked.title,
              state: runtimeIssue.tracked.state,
              href: `/issues/${issueIdentifier}`
            };
          } catch {
            return {
              issueIdentifier,
              title: issueIdentifier,
              state: "Unknown",
              href: `/issues/${issueIdentifier}`
            };
          }
        })
      );

      if (!cancelled) {
        setActiveIssues(resolvedIssues);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [input.runtimeBaseUrl, runtimeSummaryState.resource]);

  return {
    activeIssues,
    loading: runtimeSummaryState.loading,
    error: runtimeSummaryState.error
  };
}

function collectActiveIssueIdentifiers(
  runtimeSummary: SymphonyRuntimeStateResult
): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const entry of runtimeSummary.running) {
    if (!seen.has(entry.issueIdentifier)) {
      seen.add(entry.issueIdentifier);
      ordered.push(entry.issueIdentifier);
    }
  }

  for (const entry of runtimeSummary.retrying) {
    if (!seen.has(entry.issueIdentifier)) {
      seen.add(entry.issueIdentifier);
      ordered.push(entry.issueIdentifier);
    }
  }

  return ordered;
}
