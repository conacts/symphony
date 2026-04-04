"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchRuntimeIssue } from "@/core/runtime-operator-client";
import type { SymphonyRuntimeStateResult } from "@symphony/contracts";

type ActiveIssueDescriptor = {
  issueIdentifier: string;
  fallbackState: string;
};

type ActiveIssueMetadata = {
  title: string;
  state: string;
};

export function useDashboardActiveIssues(input: {
  runtimeBaseUrl: string;
  runtimeSummary: SymphonyRuntimeStateResult | null;
}) {
  const [metadataByIssue, setMetadataByIssue] = useState<
    Record<string, ActiveIssueMetadata>
  >({});
  const [loading, setLoading] = useState(false);
  const activeIssueDescriptors = useMemo(
    () => collectActiveIssueDescriptors(input.runtimeSummary),
    [input.runtimeSummary]
  );
  const activeIssueIdentifiers = useMemo(
    () => activeIssueDescriptors.map((issue) => issue.issueIdentifier),
    [activeIssueDescriptors]
  );
  const activeIssueIdentifiersKey = activeIssueIdentifiers.join("|");
  const activeIssues = useMemo(
    () =>
      activeIssueDescriptors.map((issue) => {
        const metadata = metadataByIssue[issue.issueIdentifier];

        return {
          issueIdentifier: issue.issueIdentifier,
          title: metadata?.title ?? issue.issueIdentifier,
          state: metadata?.state ?? issue.fallbackState,
          href: `/issues/${issue.issueIdentifier}`
        };
      }),
    [activeIssueDescriptors, metadataByIssue]
  );

  useEffect(() => {
    let cancelled = false;
    const missingIdentifiers = activeIssueIdentifiers.filter(
      (issueIdentifier) => !metadataByIssue[issueIdentifier]
    );

    if (missingIdentifiers.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);

    void (async () => {
      const resolvedIssues = await Promise.all(
        missingIdentifiers.map(async (issueIdentifier) => {
          try {
            const runtimeIssue = await fetchRuntimeIssue(
              input.runtimeBaseUrl,
              issueIdentifier
            );

            if (!runtimeIssue) {
              return null;
            }

            return {
              issueIdentifier,
              metadata: {
                title: runtimeIssue.tracked.title,
                state: runtimeIssue.tracked.state
              }
            };
          } catch {
            return null;
          }
        })
      );

      if (!cancelled) {
        setMetadataByIssue((currentMetadata) => {
          const nextMetadata = { ...currentMetadata };

          for (const issue of resolvedIssues) {
            if (!issue) {
              continue;
            }

            nextMetadata[issue.issueIdentifier] = issue.metadata;
          }

          return nextMetadata;
        });
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeIssueIdentifiersKey, input.runtimeBaseUrl, metadataByIssue]);

  return {
    activeIssues,
    loading
  };
}

export function collectActiveIssueDescriptors(
  runtimeSummary: SymphonyRuntimeStateResult | null
): ActiveIssueDescriptor[] {
  if (!runtimeSummary) {
    return [];
  }

  const seen = new Set<string>();
  const ordered: ActiveIssueDescriptor[] = [];

  for (const entry of runtimeSummary.running) {
    if (!seen.has(entry.issueIdentifier)) {
      seen.add(entry.issueIdentifier);
      ordered.push({
        issueIdentifier: entry.issueIdentifier,
        fallbackState: entry.state
      });
    }
  }

  for (const entry of runtimeSummary.retrying) {
    if (!seen.has(entry.issueIdentifier)) {
      seen.add(entry.issueIdentifier);
      ordered.push({
        issueIdentifier: entry.issueIdentifier,
        fallbackState: "Retrying"
      });
    }
  }

  return ordered;
}
