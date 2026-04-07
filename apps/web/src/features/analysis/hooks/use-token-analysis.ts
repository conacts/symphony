"use client";

import { shouldRefreshIssueIndex } from "@/core/forensics-client";
import { useRealtimeResource } from "@/core/realtime-resource";
import {
  loadAgentAnalysisSample,
  type AgentAnalysisSampleResource
} from "@/features/analysis/hooks/load-agent-analysis-sample";

export function useTokenAnalysis(input: {
  runtimeBaseUrl: string;
  websocketUrl: string;
  repo?: string;
}) {
  return useRealtimeResource<AgentAnalysisSampleResource>({
    loadResource: () => loadAgentAnalysisSample(input.runtimeBaseUrl, {
      repo: input.repo
    }),
    websocketUrl: input.websocketUrl,
    channels: ["issues", "runs"],
    shouldRefresh: shouldRefreshIssueIndex,
    refreshKey: `${input.runtimeBaseUrl}:analysis:tokens:${input.repo ?? "all"}`
  });
}
