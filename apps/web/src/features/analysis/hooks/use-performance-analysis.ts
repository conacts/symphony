"use client";

import { fetchCodexRunArtifacts } from "@/core/codex-analytics-client";
import {
  fetchIssueDetail,
  fetchIssueIndex,
  shouldRefreshIssueIndex
} from "@/core/forensics-client";
import { useRealtimeResource } from "@/core/realtime-resource";
import type { PerformanceAnalysisResource } from "@/features/analysis/model/performance-analysis-view-model";

const ISSUE_SAMPLE_LIMIT = 6;
const RUNS_PER_ISSUE = 2;
const MAX_SAMPLED_RUNS = 12;

export function usePerformanceAnalysis(input: {
  runtimeBaseUrl: string;
  websocketUrl: string;
}) {
  return useRealtimeResource<PerformanceAnalysisResource>({
    loadResource: async () => {
      const issueIndex = await fetchIssueIndex(input.runtimeBaseUrl, {
        timeRange: "all",
        sortBy: "lastActive",
        sortDirection: "desc",
        limit: ISSUE_SAMPLE_LIMIT
      });
      const issueDetails = await Promise.all(
        issueIndex.issues.slice(0, ISSUE_SAMPLE_LIMIT).map(async (issue) => {
          try {
            return await fetchIssueDetail(
              input.runtimeBaseUrl,
              issue.issueIdentifier,
              {
                limit: RUNS_PER_ISSUE
              }
            );
          } catch {
            return null;
          }
        })
      );
      const sampledRuns = issueDetails
        .flatMap((detail) =>
          detail
            ? detail.runs.map((run) => ({
                issueIdentifier: detail.issueIdentifier,
                run
              }))
            : []
        )
        .sort((left, right) => right.run.startedAt.localeCompare(left.run.startedAt))
        .slice(0, MAX_SAMPLED_RUNS);
      const artifactResults = await Promise.all(
        sampledRuns.map(async (sampledRun) => {
          try {
            const artifacts = await fetchCodexRunArtifacts(
              input.runtimeBaseUrl,
              sampledRun.run.runId
            );

            return {
              issueIdentifier: sampledRun.issueIdentifier,
              run: sampledRun.run,
              artifacts
            };
          } catch {
            return null;
          }
        })
      );

      return {
        issueIndex,
        sampledRuns: artifactResults.filter((entry) => entry !== null)
      };
    },
    websocketUrl: input.websocketUrl,
    channels: ["issues", "runs"],
    shouldRefresh: shouldRefreshIssueIndex,
    refreshKey: `${input.runtimeBaseUrl}:analysis:performance`
  });
}
