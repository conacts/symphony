"use client";

import { shouldRefreshIssueIndex } from "@/core/forensics-client";
import { useRealtimeResource } from "@/core/realtime-resource";
import {
  loadCodexAnalysisSample,
  type CodexAnalysisSampleResource
} from "@/features/analysis/hooks/load-codex-analysis-sample";

export function useTokenAnalysis(input: {
  runtimeBaseUrl: string;
  websocketUrl: string;
}) {
  return useRealtimeResource<CodexAnalysisSampleResource>({
    loadResource: () => loadCodexAnalysisSample(input.runtimeBaseUrl),
    websocketUrl: input.websocketUrl,
    channels: ["issues", "runs"],
    shouldRefresh: shouldRefreshIssueIndex,
    refreshKey: `${input.runtimeBaseUrl}:analysis:tokens`
  });
}
