"use client";

import { useRealtimeResource } from "@/core/realtime-resource";
import {
  fetchRuntimeLogs,
  shouldRefreshRuntimeLogs
} from "@/core/runtime-observability-client";

export function useRuntimeLogs(input: {
  runtimeBaseUrl: string;
  websocketUrl: string;
  issueIdentifier?: string;
  limit?: number;
}) {
  return useRealtimeResource({
    loadResource: () =>
      fetchRuntimeLogs(input.runtimeBaseUrl, {
        limit: input.limit,
        issueIdentifier: input.issueIdentifier
      }),
    websocketUrl: input.websocketUrl,
    channels: ["runtime", "issues", "runs"],
    shouldRefresh: shouldRefreshRuntimeLogs,
    refreshKey: `${input.runtimeBaseUrl}:logs:${input.issueIdentifier ?? "all"}:${input.limit ?? "default"}`
  });
}
