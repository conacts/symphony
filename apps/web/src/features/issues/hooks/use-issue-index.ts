"use client";

import { useRealtimeResource } from "@/core/realtime-resource";
import {
  fetchIssueIndex,
  shouldRefreshIssueIndex
} from "@/core/forensics-client";
import type { SymphonyForensicsIssuesQuery } from "@symphony/contracts";

export function useIssueIndex(input: {
  runtimeBaseUrl: string;
  websocketUrl: string;
  query: SymphonyForensicsIssuesQuery;
}) {
  return useRealtimeResource({
    loadResource: () => fetchIssueIndex(input.runtimeBaseUrl, input.query),
    websocketUrl: input.websocketUrl,
    channels: ["issues", "runs"],
    shouldRefresh: shouldRefreshIssueIndex,
    refreshKey: `${input.runtimeBaseUrl}:issues:${JSON.stringify(input.query)}`
  });
}
