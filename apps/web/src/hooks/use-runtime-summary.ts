"use client";

import { useEffect, useState } from "react";
import {
  fetchRuntimeSummary,
  shouldRefreshRuntimeSummary
} from "@/core/runtime-summary-client";
import { useRealtimeResource } from "@/core/realtime-resource";

export function useRuntimeSummary(input: {
  stateUrl: string;
  websocketUrl: string;
}) {
  const [now, setNow] = useState(() => new Date());
  const runtimeSummaryState = useRealtimeResource({
    loadResource: () => fetchRuntimeSummary(input.stateUrl),
    websocketUrl: input.websocketUrl,
    channels: ["runtime"],
    shouldRefresh: shouldRefreshRuntimeSummary,
    refreshKey: `${input.stateUrl}:${input.websocketUrl}`
  });

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 1_000);

    return () => window.clearInterval(intervalId);
  }, []);

  return {
    runtimeSummary: runtimeSummaryState.resource,
    loading: runtimeSummaryState.loading,
    status: runtimeSummaryState.status,
    error: runtimeSummaryState.error,
    now,
    refreshRuntimeSummary: runtimeSummaryState.refresh
  };
}
