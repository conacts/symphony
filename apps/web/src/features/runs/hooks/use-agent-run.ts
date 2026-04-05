"use client";

import type {
  SymphonyAgentRunArtifactsResult,
  SymphonyForensicsRunDetailResult
} from "@symphony/contracts";
import { useRealtimeResource } from "@/core/realtime-resource";
import {
  fetchAgentRunArtifacts,
  shouldRefreshAgentRun
} from "@/core/agent-analytics-client";
import { fetchRunDetail } from "@/core/forensics-client";

export type AgentRunResource = {
  runDetail: SymphonyForensicsRunDetailResult;
  runArtifacts: SymphonyAgentRunArtifactsResult | null;
  agentError: string | null;
};

export function useAgentRun(input: {
  runtimeBaseUrl: string;
  websocketUrl: string;
  runId: string;
}) {
  return useRealtimeResource<AgentRunResource>({
    loadResource: async () => {
      const [runDetailResult, runArtifactsResult] = await Promise.allSettled([
        fetchRunDetail(input.runtimeBaseUrl, input.runId),
        fetchAgentRunArtifacts(input.runtimeBaseUrl, input.runId)
      ]);

      if (runDetailResult.status === "rejected") {
        throw runDetailResult.reason;
      }

      return {
        runDetail: runDetailResult.value,
        runArtifacts:
          runArtifactsResult.status === "fulfilled"
            ? runArtifactsResult.value
            : null,
        agentError:
          runArtifactsResult.status === "fulfilled"
            ? null
            : runArtifactsResult.reason instanceof Error
              ? runArtifactsResult.reason.message
              : "Failed to load agent run artifacts."
      };
    },
    websocketUrl: input.websocketUrl,
    channels: ["runs"],
    shouldRefresh: (message) => shouldRefreshAgentRun(message, input.runId),
    refreshKey: `${input.runtimeBaseUrl}:agent:runs:${input.runId}`
  });
}
