"use client";

import type { SymphonyForensicsSuccessMetricsQuery } from "@symphony/contracts";
import { useRealtimeResource } from "@/core/realtime-resource";
import {
  fetchSuccessMetrics,
  shouldRefreshIssueIndex
} from "@/core/forensics-client";

export function useSuccessMetrics(input: {
  runtimeBaseUrl: string;
  websocketUrl: string;
  query: SymphonyForensicsSuccessMetricsQuery;
}) {
  return useRealtimeResource({
    loadResource: () => fetchSuccessMetrics(input.runtimeBaseUrl, input.query),
    websocketUrl: input.websocketUrl,
    channels: ["issues", "runs"],
    shouldRefresh: shouldRefreshIssueIndex,
    refreshKey: `${input.runtimeBaseUrl}:success-metrics:${JSON.stringify(input.query)}`
  });
}
