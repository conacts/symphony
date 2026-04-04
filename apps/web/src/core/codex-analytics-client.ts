"use client";

import {
  symphonyCodexOverflowResponseSchema,
  symphonyCodexRunArtifactsResponseSchema,
  type SymphonyCodexOverflowResult,
  type SymphonyCodexRunArtifactsResult,
  type SymphonyRealtimeServerMessage
} from "@symphony/contracts";
import { createRuntimeUrl } from "@/core/runtime-url";
import { messageInvalidatesPath } from "@/core/runtime-summary-client";

export async function fetchCodexRunArtifacts(
  runtimeBaseUrl: string,
  runId: string,
  fetchImpl: typeof fetch = fetch
): Promise<SymphonyCodexRunArtifactsResult> {
  const endpoint = createRuntimeUrl(`/api/v1/codex/runs/${runId}/artifacts`, runtimeBaseUrl);
  const response = await fetchImpl(endpoint, {
    headers: {
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Codex run artifacts request failed with ${response.status}.`);
  }

  const parsed = symphonyCodexRunArtifactsResponseSchema.parse(await response.json());

  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }

  return parsed.data;
}

export async function fetchCodexOverflow(
  runtimeBaseUrl: string,
  runId: string,
  overflowId: string,
  fetchImpl: typeof fetch = fetch
): Promise<SymphonyCodexOverflowResult> {
  const endpoint = createRuntimeUrl(
    `/api/v1/codex/runs/${runId}/overflow/${overflowId}`,
    runtimeBaseUrl
  );
  const response = await fetchImpl(endpoint, {
    headers: {
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Codex overflow request failed with ${response.status}.`);
  }

  const parsed = symphonyCodexOverflowResponseSchema.parse(await response.json());

  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }

  return parsed.data;
}

export function shouldRefreshCodexRun(
  message: SymphonyRealtimeServerMessage,
  runId: string
): boolean {
  if (message.type === "run.updated" && message.runId === runId) {
    return true;
  }

  return (
    messageInvalidatesPath(message, `/api/v1/runs/${runId}`) ||
    messageInvalidatesPath(message, `/api/v1/codex/runs/${runId}/artifacts`)
  );
}
