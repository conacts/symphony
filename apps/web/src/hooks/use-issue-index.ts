"use client";

import { useRealtimeResource } from "@/core/realtime-resource";
import {
  fetchIssueIndex,
  shouldRefreshIssueIndex
} from "@/core/forensics-client";

export function useIssueIndex(input: {
  runtimeBaseUrl: string;
  websocketUrl: string;
}) {
  return useRealtimeResource({
    loadResource: () => fetchIssueIndex(input.runtimeBaseUrl),
    websocketUrl: input.websocketUrl,
    channels: ["issues", "problem-runs"],
    shouldRefresh: shouldRefreshIssueIndex,
    refreshKey: `${input.runtimeBaseUrl}:issues`
  });
}
