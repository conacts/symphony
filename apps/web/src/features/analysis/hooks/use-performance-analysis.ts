"use client";

import { shouldRefreshIssueIndex } from "@/core/forensics-client";
import { useRealtimeResource } from "@/core/realtime-resource";
import type { PerformanceAnalysisResource } from "@/features/analysis/model/performance-analysis-view-model";
import { loadCodexAnalysisSample } from "@/features/analysis/hooks/load-codex-analysis-sample";

export function usePerformanceAnalysis(input: {
  runtimeBaseUrl: string;
  websocketUrl: string;
}) {
  return useRealtimeResource<PerformanceAnalysisResource>({
    loadResource: () => loadCodexAnalysisSample(input.runtimeBaseUrl),
    websocketUrl: input.websocketUrl,
    channels: ["issues", "runs"],
    shouldRefresh: shouldRefreshIssueIndex,
    refreshKey: `${input.runtimeBaseUrl}:analysis:performance`
  });
}
