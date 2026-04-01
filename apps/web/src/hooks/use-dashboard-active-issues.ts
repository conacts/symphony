"use client";

import { useEffect, useState } from "react";
import type {
  SymphonyDashboardActiveIssue
} from "@/core/dashboard-foundation";
import { fetchRuntimeIssue } from "@/core/runtime-operator-client";
import type { SymphonyRuntimeStateResult } from "@symphony/contracts";

export function useDashboardActiveIssues(input: {
  runtimeBaseUrl: string;
  runtimeSummary: SymphonyRuntimeStateResult | null;
}) {
  const [activeIssues, setActiveIssues] = useState<SymphonyDashboardActiveIssue[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!input.runtimeSummary) {
      setActiveIssues([]);
      setLoading(false);
      return;
    }

    const issueIdentifiers = collectActiveIssueIdentifiers(input.runtimeSummary);
    if (issueIdentifiers.length === 0) {
      setActiveIssues([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

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
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [input.runtimeBaseUrl, input.runtimeSummary]);

  return {
    activeIssues,
    loading
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
