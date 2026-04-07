"use client";

import { shouldRefreshIssueIndex } from "@/core/forensics-client";
import { useRealtimeResource } from "@/core/realtime-resource";
import type { PerformanceAnalysisResource } from "@/features/analysis/model/performance-analysis-view-model";
import { loadAgentAnalysisSample } from "@/features/analysis/hooks/load-agent-analysis-sample";

export function usePerformanceAnalysis(input: {
  runtimeBaseUrl: string;
  websocketUrl: string;
  repo?: string;
}) {
  return useRealtimeResource<PerformanceAnalysisResource>({
    loadResource: () => loadAgentAnalysisSample(input.runtimeBaseUrl, {
      repo: input.repo
    }),
    websocketUrl: input.websocketUrl,
    channels: ["issues", "runs"],
    shouldRefresh: shouldRefreshIssueIndex,
    refreshKey: `${input.runtimeBaseUrl}:analysis:performance:${input.repo ?? "all"}`
  });
}
