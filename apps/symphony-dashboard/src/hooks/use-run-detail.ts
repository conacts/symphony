"use client";

import { useRealtimeResource } from "@/core/realtime-resource";
import {
  fetchRunDetail,
  shouldRefreshRunDetail
} from "@/core/forensics-client";

export function useRunDetail(input: {
  runtimeBaseUrl: string;
  websocketUrl: string;
  runId: string;
}) {
  return useRealtimeResource({
    loadResource: () => fetchRunDetail(input.runtimeBaseUrl, input.runId),
    websocketUrl: input.websocketUrl,
    channels: ["runs"],
    shouldRefresh: (message) => shouldRefreshRunDetail(message, input.runId),
    refreshKey: `${input.runtimeBaseUrl}:runs:${input.runId}`
  });
}
