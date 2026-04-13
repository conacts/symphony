"use client";

import { useRealtimeResource } from "@/core/realtime-resource";
import {
  fetchIssueForensicsBundle,
  shouldRefreshIssueForensicsBundle
} from "@/core/forensics-client";

export function useIssueForensicsBundle(input: {
  runtimeBaseUrl: string;
  websocketUrl: string;
  trackerIssueKey: string;
  repo?: string;
}) {
  return useRealtimeResource({
    loadResource: () =>
      fetchIssueForensicsBundle(input.runtimeBaseUrl, input.trackerIssueKey, {
        repo: input.repo
      }),
    websocketUrl: input.websocketUrl,
    channels: ["issues", "runs"],
    shouldRefresh: (message) =>
      shouldRefreshIssueForensicsBundle(message, input.trackerIssueKey),
    refreshKey: `${input.runtimeBaseUrl}:issues:${input.trackerIssueKey}:${input.repo ?? "all"}:bundle`
  });
}
