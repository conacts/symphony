"use client";

import { useRealtimeResource } from "@/core/realtime-resource";
import {
  fetchIssueDetail,
  shouldRefreshIssueDetail
} from "@/core/forensics-client";

export function useIssueDetail(input: {
  runtimeBaseUrl: string;
  websocketUrl: string;
  trackerIssueKey: string;
  repo?: string;
}) {
  return useRealtimeResource({
    loadResource: () =>
      fetchIssueDetail(input.runtimeBaseUrl, input.trackerIssueKey, {
        repo: input.repo
      }),
    websocketUrl: input.websocketUrl,
    channels: ["issues", "runs"],
    shouldRefresh: (message) =>
      shouldRefreshIssueDetail(message, input.trackerIssueKey),
    refreshKey: `${input.runtimeBaseUrl}:issues:${input.trackerIssueKey}:${input.repo ?? "all"}`
  });
}
