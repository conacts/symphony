"use client";

import { useRealtimeResource } from "@/core/realtime-resource";
import {
  fetchRuntimeIssue,
  shouldRefreshRuntimeIssue
} from "@/core/runtime-operator-client";

export function useRuntimeIssue(input: {
  runtimeBaseUrl: string;
  websocketUrl: string;
  issueIdentifier: string;
}) {
  return useRealtimeResource({
    loadResource: async () =>
      fetchRuntimeIssue(input.runtimeBaseUrl, input.issueIdentifier),
    websocketUrl: input.websocketUrl,
    channels: ["issues"],
    shouldRefresh: (message) =>
      shouldRefreshRuntimeIssue(message, input.issueIdentifier),
    refreshKey: `${input.runtimeBaseUrl}:runtime-issue:${input.issueIdentifier}`
  });
}
