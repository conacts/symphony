"use client";

import { useRealtimeResource } from "@/core/realtime-resource";
import {
  fetchIssueDetail,
  shouldRefreshIssueDetail
} from "@/core/forensics-client";

export function useIssueDetail(input: {
  runtimeBaseUrl: string;
  websocketUrl: string;
  issueIdentifier: string;
}) {
  return useRealtimeResource({
    loadResource: () =>
      fetchIssueDetail(input.runtimeBaseUrl, input.issueIdentifier),
    websocketUrl: input.websocketUrl,
    channels: ["issues", "runs"],
    shouldRefresh: (message) =>
      shouldRefreshIssueDetail(message, input.issueIdentifier),
    refreshKey: `${input.runtimeBaseUrl}:issues:${input.issueIdentifier}`
  });
}
