import {
  symphonyRuntimeIssueResponseSchema,
  symphonyRuntimeRefreshResponseSchema,
  type SymphonyRealtimeServerMessage,
  type SymphonyRuntimeIssueResult,
  type SymphonyRuntimeRefreshResult
} from "@symphony/contracts";
import { messageInvalidatesPath } from "@/core/runtime-summary-client";
import { createRuntimeUrl } from "@/core/runtime-url";

export async function fetchRuntimeIssue(
  runtimeBaseUrl: string,
  trackerIssueKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<SymphonyRuntimeIssueResult | null> {
  const endpoint = createRuntimeUrl(`/api/v1/${trackerIssueKey}`, runtimeBaseUrl);
  const response = await fetchImpl(endpoint, {
    headers: {
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Runtime issue request failed with ${response.status}.`);
  }

  const parsed = symphonyRuntimeIssueResponseSchema.parse(await response.json());

  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }

  return parsed.data;
}

export async function requestRuntimeRefresh(
  refreshUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<SymphonyRuntimeRefreshResult> {
  const response = await fetchImpl(refreshUrl, {
    method: "POST",
    headers: {
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Runtime refresh request failed with ${response.status}.`);
  }

  const parsed = symphonyRuntimeRefreshResponseSchema.parse(await response.json());

  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }

  return parsed.data;
}

export function shouldRefreshRuntimeIssue(
  message: SymphonyRealtimeServerMessage,
  trackerIssueKey: string
): boolean {
  if (
    message.type === "issue.updated" &&
    message.trackerIssueKey === trackerIssueKey
  ) {
    return true;
  }

  return messageInvalidatesPath(message, `/api/v1/${trackerIssueKey}`);
}
