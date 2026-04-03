"use client";

import { useRealtimeResource } from "@/core/realtime-resource";
import {
  fetchIssueForensicsBundle,
  shouldRefreshIssueForensicsBundle
} from "@/core/forensics-client";

export function useIssueForensicsBundle(input: {
  runtimeBaseUrl: string;
  websocketUrl: string;
  issueIdentifier: string;
}) {
  return useRealtimeResource({
    loadResource: () =>
      fetchIssueForensicsBundle(input.runtimeBaseUrl, input.issueIdentifier),
    websocketUrl: input.websocketUrl,
    channels: ["issues", "runs"],
    shouldRefresh: (message) =>
      shouldRefreshIssueForensicsBundle(message, input.issueIdentifier),
    refreshKey: `${input.runtimeBaseUrl}:issues:${input.issueIdentifier}:bundle`
  });
}
