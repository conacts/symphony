"use client";

import {
  fetchRuntimeSummary,
  shouldRefreshRuntimeSummary
} from "@/core/runtime-summary-client";
import { useRealtimeResource } from "@/core/realtime-resource";

export function useRuntimeSummary(input: {
  stateUrl: string;
  websocketUrl: string;
}) {
  const runtimeSummaryState = useRealtimeResource({
    loadResource: () => fetchRuntimeSummary(input.stateUrl),
    websocketUrl: input.websocketUrl,
    channels: ["runtime"],
    shouldRefresh: shouldRefreshRuntimeSummary,
    refreshKey: `${input.stateUrl}:${input.websocketUrl}`
  });

  return {
    runtimeSummary: runtimeSummaryState.resource,
    loading: runtimeSummaryState.loading,
    status: runtimeSummaryState.status,
    error: runtimeSummaryState.error,
    refreshRuntimeSummary: runtimeSummaryState.refresh
  };
}
