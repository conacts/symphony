import {
  symphonyRuntimeIssueResponseSchema,
  symphonyRuntimeRefreshResponseSchema,
  type SymphonyRealtimeServerMessage,
  type SymphonyRuntimeIssueResult,
  type SymphonyRuntimeRefreshResult
} from "@symphony/contracts";
import { messageInvalidatesPath } from "@/core/runtime-summary-client";

export async function fetchRuntimeIssue(
  runtimeBaseUrl: string,
  issueIdentifier: string,
  fetchImpl: typeof fetch = fetch
): Promise<SymphonyRuntimeIssueResult> {
  const endpoint = createRuntimeUrl(runtimeBaseUrl, `/api/v1/${issueIdentifier}`);
  const response = await fetchImpl(endpoint, {
    headers: {
      accept: "application/json"
    },
    cache: "no-store"
  });

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
  issueIdentifier: string
): boolean {
  if (
    message.type === "issue.updated" &&
    message.issueIdentifier === issueIdentifier
  ) {
    return true;
  }

  return messageInvalidatesPath(message, `/api/v1/${issueIdentifier}`);
}

function createRuntimeUrl(runtimeBaseUrl: string, path: string): string {
  return new URL(path, runtimeBaseUrl).toString();
}
