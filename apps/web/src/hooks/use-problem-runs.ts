"use client";

import { useRealtimeResource } from "@/core/realtime-resource";
import {
  fetchProblemRuns,
  shouldRefreshProblemRuns
} from "@/core/forensics-client";

export function useProblemRuns(input: {
  runtimeBaseUrl: string;
  websocketUrl: string;
}) {
  return useRealtimeResource({
    loadResource: () => fetchProblemRuns(input.runtimeBaseUrl),
    websocketUrl: input.websocketUrl,
    channels: ["problem-runs", "issues"],
    shouldRefresh: shouldRefreshProblemRuns,
    refreshKey: `${input.runtimeBaseUrl}:problem-runs`
  });
}
