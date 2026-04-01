import {
  symphonyForensicsIssueDetailResponseSchema,
  symphonyForensicsIssueForensicsBundleResponseSchema,
  symphonyForensicsIssueListResponseSchema,
  symphonyForensicsRunDetailResponseSchema,
  type SymphonyForensicsIssueDetailResult,
  type SymphonyForensicsIssueForensicsBundleQuery,
  type SymphonyForensicsIssueForensicsBundleResult,
  type SymphonyForensicsIssuesQuery,
  type SymphonyForensicsIssueListResult,
  type SymphonyForensicsRunDetailResult,
  type SymphonyRealtimeServerMessage
} from "@symphony/contracts";
import { messageInvalidatesPath } from "@/core/runtime-summary-client";
import { createRuntimeUrl } from "@/core/runtime-url";

export async function fetchIssueIndex(
  runtimeBaseUrl: string,
  input: Partial<SymphonyForensicsIssuesQuery> = {},
  fetchImpl: typeof fetch = fetch
): Promise<SymphonyForensicsIssueListResult> {
  const endpoint = createRuntimeUrl("/api/v1/issues", runtimeBaseUrl, {
    limit: input.limit ? String(input.limit) : undefined,
    timeRange: input.timeRange,
    startedAfter: input.startedAfter,
    startedBefore: input.startedBefore,
    outcome: input.outcome,
    errorClass: input.errorClass,
    hasFlag: input.hasFlag,
    sortBy: input.sortBy,
    sortDirection: input.sortDirection
  });
  const response = await fetchImpl(endpoint, {
    headers: {
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Issue index request failed with ${response.status}.`);
  }

  const parsed = symphonyForensicsIssueListResponseSchema.parse(await response.json());

  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }

  return parsed.data;
}

export async function fetchIssueForensicsBundle(
  runtimeBaseUrl: string,
  issueIdentifier: string,
  input: Partial<SymphonyForensicsIssueForensicsBundleQuery> = {},
  fetchImpl: typeof fetch = fetch
): Promise<SymphonyForensicsIssueForensicsBundleResult> {
  const endpoint = createRuntimeUrl(
    `/api/v1/issues/${issueIdentifier}/forensics-bundle`,
    runtimeBaseUrl,
    {
      limit: input.limit ? String(input.limit) : undefined,
      timeRange: input.timeRange,
      startedAfter: input.startedAfter,
      startedBefore: input.startedBefore,
      outcome: input.outcome,
      errorClass: input.errorClass,
      hasFlag: input.hasFlag,
      sortBy: input.sortBy,
      sortDirection: input.sortDirection,
      recentRunLimit: input.recentRunLimit ? String(input.recentRunLimit) : undefined,
      timelineLimit: input.timelineLimit ? String(input.timelineLimit) : undefined,
      runtimeLogLimit: input.runtimeLogLimit ? String(input.runtimeLogLimit) : undefined
    }
  );
  const response = await fetchImpl(endpoint, {
    headers: {
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Issue forensic bundle request failed with ${response.status}.`);
  }

  const parsed = symphonyForensicsIssueForensicsBundleResponseSchema.parse(
    await response.json()
  );

  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }

  return parsed.data;
}

export async function fetchIssueDetail(
  runtimeBaseUrl: string,
  issueIdentifier: string,
  input: {
    limit?: number;
  } = {},
  fetchImpl: typeof fetch = fetch
): Promise<SymphonyForensicsIssueDetailResult> {
  const endpoint = createRuntimeUrl(
    `/api/v1/issues/${issueIdentifier}`,
    runtimeBaseUrl,
    {
      limit: String(input.limit ?? 200)
    }
  );
  const response = await fetchImpl(endpoint, {
    headers: {
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Issue detail request failed with ${response.status}.`);
  }

  const parsed = symphonyForensicsIssueDetailResponseSchema.parse(await response.json());

  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }

  return parsed.data;
}

export async function fetchRunDetail(
  runtimeBaseUrl: string,
  runId: string,
  fetchImpl: typeof fetch = fetch
): Promise<SymphonyForensicsRunDetailResult> {
  const endpoint = createRuntimeUrl(`/api/v1/runs/${runId}`, runtimeBaseUrl);
  const response = await fetchImpl(endpoint, {
    headers: {
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Run detail request failed with ${response.status}.`);
  }

  const parsed = symphonyForensicsRunDetailResponseSchema.parse(await response.json());

  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }

  return parsed.data;
}

export function shouldRefreshIssueIndex(
  message: SymphonyRealtimeServerMessage
): boolean {
  return (
    message.type === "issue.updated" || message.type === "problem-runs.updated"
  );
}

export function shouldRefreshIssueDetail(
  message: SymphonyRealtimeServerMessage,
  issueIdentifier: string
): boolean {
  if (
    message.type === "issue.updated" &&
    message.issueIdentifier === issueIdentifier
  ) {
    return true;
  }

  return messageInvalidatesPath(message, `/api/v1/issues/${issueIdentifier}`);
}

export function shouldRefreshRunDetail(
  message: SymphonyRealtimeServerMessage,
  runId: string
): boolean {
  return messageInvalidatesPath(message, `/api/v1/runs/${runId}`);
}
