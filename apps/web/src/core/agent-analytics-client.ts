"use client";

import {
  symphonyAgentOverflowResponseSchema,
  symphonyAgentRunArtifactsResponseSchema,
  type SymphonyAgentOverflowResult,
  type SymphonyAgentRunArtifactsResult,
  type SymphonyRealtimeServerMessage
} from "@symphony/contracts";
import { createRuntimeUrl } from "@/core/runtime-url";
import { messageInvalidatesPath } from "@/core/runtime-summary-client";

export async function fetchAgentRunArtifacts(
  runtimeBaseUrl: string,
  runId: string,
  fetchImpl: typeof fetch = fetch
): Promise<SymphonyAgentRunArtifactsResult> {
  const endpoint = createRuntimeUrl(`/api/v1/agent/runs/${runId}/artifacts`, runtimeBaseUrl);
  const response = await fetchImpl(endpoint, {
    headers: {
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Agent run artifacts request failed with ${response.status}.`);
  }

  const parsed = symphonyAgentRunArtifactsResponseSchema.parse(await response.json());

  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }

  return parsed.data;
}

export async function fetchAgentOverflow(
  runtimeBaseUrl: string,
  runId: string,
  overflowId: string,
  fetchImpl: typeof fetch = fetch
): Promise<SymphonyAgentOverflowResult> {
  const endpoint = createRuntimeUrl(
    `/api/v1/agent/runs/${runId}/overflow/${overflowId}`,
    runtimeBaseUrl
  );
  const response = await fetchImpl(endpoint, {
    headers: {
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Agent overflow request failed with ${response.status}.`);
  }

  const parsed = symphonyAgentOverflowResponseSchema.parse(await response.json());

  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }

  return parsed.data;
}

export function shouldRefreshAgentRun(
  message: SymphonyRealtimeServerMessage,
  runId: string
): boolean {
  if (message.type === "run.updated" && message.runId === runId) {
    return true;
  }

  return (
    messageInvalidatesPath(message, `/api/v1/runs/${runId}`) ||
    messageInvalidatesPath(message, `/api/v1/agent/runs/${runId}/artifacts`)
  );
}
