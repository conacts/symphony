"use client";

import { useRealtimeResource } from "@/core/realtime-resource";
import {
  fetchRuntimeWorkflowObservability,
  shouldRefreshRuntimeWorkflowObservability
} from "@/core/runtime-operator-client";

export function useIssueWorkflowObservability(input: {
  runtimeBaseUrl: string;
  websocketUrl: string;
  issueIdentifier: string;
}) {
  return useRealtimeResource({
    loadResource: () =>
      fetchRuntimeWorkflowObservability(input.runtimeBaseUrl, input.issueIdentifier, {
        historyLimit: 120,
        decisionLimit: 40
      }),
    websocketUrl: input.websocketUrl,
    channels: ["issues"],
    shouldRefresh: (message) =>
      shouldRefreshRuntimeWorkflowObservability(message, input.issueIdentifier),
    refreshKey: `${input.runtimeBaseUrl}:workflow-observability:${input.issueIdentifier}`
  });
}
