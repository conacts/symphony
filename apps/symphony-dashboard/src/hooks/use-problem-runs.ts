"use client";

import type { SymphonyForensicsProblemRunsQuery } from "@symphony/contracts";
import { useRealtimeResource } from "@/core/realtime-resource";
import {
  fetchProblemRuns,
  shouldRefreshProblemRuns
} from "@/core/forensics-client";

export function useProblemRuns(input: {
  runtimeBaseUrl: string;
  websocketUrl: string;
  query: SymphonyForensicsProblemRunsQuery;
}) {
  const refreshKey = JSON.stringify({
    runtimeBaseUrl: input.runtimeBaseUrl,
    query: input.query
  });

  return useRealtimeResource({
    loadResource: () => fetchProblemRuns(input.runtimeBaseUrl, input.query),
    websocketUrl: input.websocketUrl,
    channels: ["problem-runs"],
    shouldRefresh: shouldRefreshProblemRuns,
    refreshKey
  });
}
