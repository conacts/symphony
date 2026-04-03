"use client";

import { useRealtimeResource } from "@/core/realtime-resource";
import {
  fetchRuntimeHealth,
  shouldRefreshRuntimeHealth
} from "@/core/runtime-observability-client";

export function useRuntimeHealth(input: {
  runtimeBaseUrl: string;
  websocketUrl: string;
}) {
  return useRealtimeResource({
    loadResource: () => fetchRuntimeHealth(input.runtimeBaseUrl),
    websocketUrl: input.websocketUrl,
    channels: ["runtime"],
    shouldRefresh: shouldRefreshRuntimeHealth,
    refreshKey: `${input.runtimeBaseUrl}:health`
  });
}
