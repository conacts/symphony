import {
  symphonyForensicsIssueDetailResponseSchema,
  symphonyForensicsIssueForensicsBundleResponseSchema,
  symphonyForensicsIssueListResponseSchema,
  symphonyForensicsProblemRunsResponseSchema,
  symphonyForensicsRunDetailResponseSchema,
  symphonyForensicsSuccessMetricsResponseSchema,
  type SymphonyForensicsIssueDetailResult,
  type SymphonyForensicsIssueForensicsBundleQuery,
  type SymphonyForensicsIssueForensicsBundleResult,
  type SymphonyForensicsIssuesQuery,
  type SymphonyForensicsIssueListResult,
  type SymphonyForensicsProblemRunsResult,
  type SymphonyForensicsRunDetailResult,
  type SymphonyForensicsSuccessMetricsQuery,
  type SymphonyForensicsSuccessMetricsResult,
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
    repo: input.repo,
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
      repo: input.repo,
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
    repo?: string;
  } = {},
  fetchImpl: typeof fetch = fetch
): Promise<SymphonyForensicsIssueDetailResult> {
  const endpoint = createRuntimeUrl(
    `/api/v1/issues/${issueIdentifier}`,
    runtimeBaseUrl,
    {
      limit: String(input.limit ?? 200),
      repo: input.repo
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

export async function fetchProblemRuns(
  runtimeBaseUrl: string,
  input: {
    limit?: number;
    repo?: string;
    outcome?: string;
    issueIdentifier?: string;
  } = {},
  fetchImpl: typeof fetch = fetch
): Promise<SymphonyForensicsProblemRunsResult> {
  const endpoint = createRuntimeUrl("/api/v1/problem-runs", runtimeBaseUrl, {
    limit: input.limit ? String(input.limit) : undefined,
    repo: input.repo,
    outcome: input.outcome,
    issueIdentifier: input.issueIdentifier
  });
  const response = await fetchImpl(endpoint, {
    headers: {
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Problem runs request failed with ${response.status}.`);
  }

  const parsed = symphonyForensicsProblemRunsResponseSchema.parse(
    await response.json()
  );

  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }

  return parsed.data;
}

export async function fetchSuccessMetrics(
  runtimeBaseUrl: string,
  input: Partial<SymphonyForensicsSuccessMetricsQuery> = {},
  fetchImpl: typeof fetch = fetch
): Promise<SymphonyForensicsSuccessMetricsResult> {
  const endpoint = createRuntimeUrl("/api/v1/success-metrics", runtimeBaseUrl, {
    repo: input.repo,
    timeRange: input.timeRange,
    startedAfter: input.startedAfter,
    startedBefore: input.startedBefore
  });
  const response = await fetchImpl(endpoint, {
    headers: {
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Success metrics request failed with ${response.status}.`);
  }

  const parsed = symphonyForensicsSuccessMetricsResponseSchema.parse(
    await response.json()
  );

  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }

  return parsed.data;
}

export function shouldRefreshIssueIndex(
  message: SymphonyRealtimeServerMessage
): boolean {
  return message.type === "issue.updated" || message.type === "run.updated";
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

export function shouldRefreshProblemRuns(
  message: SymphonyRealtimeServerMessage
): boolean {
  return (
    message.type === "problem-runs.updated" || message.type === "issue.updated"
  );
}

export function shouldRefreshIssueForensicsBundle(
  message: SymphonyRealtimeServerMessage,
  issueIdentifier: string
): boolean {
  if (
    message.type === "issue.updated" &&
    message.issueIdentifier === issueIdentifier
  ) {
    return true;
  }

  if (
    message.type === "run.updated" &&
    message.issueIdentifier === issueIdentifier
  ) {
    return true;
  }

  return messageInvalidatesPath(message, `/api/v1/issues/${issueIdentifier}`);
}
