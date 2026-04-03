"use client";

import { useRealtimeResource } from "@/core/realtime-resource";
import {
  fetchRuntimeLogs,
  shouldRefreshRuntimeLogs
} from "@/core/runtime-observability-client";

export function useRuntimeLogs(input: {
  runtimeBaseUrl: string;
  websocketUrl: string;
}) {
  return useRealtimeResource({
    loadResource: () => fetchRuntimeLogs(input.runtimeBaseUrl),
    websocketUrl: input.websocketUrl,
    channels: ["runtime", "issues", "runs"],
    shouldRefresh: shouldRefreshRuntimeLogs,
    refreshKey: `${input.runtimeBaseUrl}:runtime-logs`
  });
}
