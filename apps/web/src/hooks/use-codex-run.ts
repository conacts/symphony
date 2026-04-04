"use client";

import type {
  SymphonyCodexRunArtifactsResult,
  SymphonyForensicsRunDetailResult
} from "@symphony/contracts";
import { useRealtimeResource } from "@/core/realtime-resource";
import {
  fetchCodexRunArtifacts,
  shouldRefreshCodexRun
} from "@/core/codex-analytics-client";
import { fetchRunDetail } from "@/core/forensics-client";

export type CodexRunResource = {
  runDetail: SymphonyForensicsRunDetailResult;
  runArtifacts: SymphonyCodexRunArtifactsResult | null;
  codexError: string | null;
};

export function useCodexRun(input: {
  runtimeBaseUrl: string;
  websocketUrl: string;
  runId: string;
}) {
  return useRealtimeResource<CodexRunResource>({
    loadResource: async () => {
      const [runDetailResult, runArtifactsResult] = await Promise.allSettled([
        fetchRunDetail(input.runtimeBaseUrl, input.runId),
        fetchCodexRunArtifacts(input.runtimeBaseUrl, input.runId)
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
        codexError:
          runArtifactsResult.status === "fulfilled"
            ? null
            : runArtifactsResult.reason instanceof Error
              ? runArtifactsResult.reason.message
              : "Failed to load Codex run artifacts."
      };
    },
    websocketUrl: input.websocketUrl,
    channels: ["runs"],
    shouldRefresh: (message) => shouldRefreshCodexRun(message, input.runId),
    refreshKey: `${input.runtimeBaseUrl}:codex:runs:${input.runId}`
  });
}
