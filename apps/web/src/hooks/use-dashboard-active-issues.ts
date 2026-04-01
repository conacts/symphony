"use client";

import { useEffect, useState } from "react";
import type {
  SymphonyDashboardActiveIssue
} from "@/core/dashboard-foundation";
import { fetchIssueIndex } from "@/core/forensics-client";
import { fetchRuntimeIssue } from "@/core/runtime-operator-client";
import type { SymphonyRuntimeStateResult } from "@symphony/contracts";

export function useDashboardActiveIssues(input: {
  runtimeBaseUrl: string;
  runtimeSummary: SymphonyRuntimeStateResult | null;
}) {
  const [activeIssues, setActiveIssues] = useState<SymphonyDashboardActiveIssue[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void (async () => {
      const issueIndex = await fetchIssueIndex(input.runtimeBaseUrl, {
        limit: 200,
        sortBy: "lastActive",
        sortDirection: "desc"
      }).catch(() => null);

      const runtimeIdentifiers = input.runtimeSummary
        ? collectActiveIssueIdentifiers(input.runtimeSummary)
        : [];
      const indexIdentifiers =
        issueIndex?.issues.map((issue) => issue.issueIdentifier) ?? [];
      const candidateIdentifiers = dedupeIssueIdentifiers([
        ...runtimeIdentifiers,
        ...indexIdentifiers
      ]);

      if (candidateIdentifiers.length === 0) {
        if (!cancelled) {
          setActiveIssues([]);
          setLoading(false);
        }
        return;
      }

      const resolvedIssues = await Promise.all(
        candidateIdentifiers.map(async (issueIdentifier) => {
          try {
            const runtimeIssue = await fetchRuntimeIssue(
              input.runtimeBaseUrl,
              issueIdentifier
            );

            if (!runtimeIssue) {
              return null;
            }

            if (!isActiveTicketState(runtimeIssue.tracked.state)) {
              return null;
            }

            return {
              issueIdentifier,
              title: runtimeIssue.tracked.title,
              state: runtimeIssue.tracked.state,
              href: `/issues/${issueIdentifier}`
            };
          } catch {
            return null;
          }
        })
      );

      if (!cancelled) {
        setActiveIssues(
          resolvedIssues.filter(
            (issue): issue is SymphonyDashboardActiveIssue => issue !== null
          )
        );
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

function isActiveTicketState(state: string): boolean {
  const normalized = state.trim().toLowerCase().replace(/[\s_-]+/gu, " ");

  return (
    normalized === "todo" ||
    normalized === "in progress" ||
    normalized === "rework" ||
    normalized === "in review" ||
    normalized === "approved" ||
    normalized === "blocked"
  );
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

function dedupeIssueIdentifiers(values: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      ordered.push(value);
    }
  }

  return ordered;
}
