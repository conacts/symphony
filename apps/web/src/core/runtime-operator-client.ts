import {
  symphonyRuntimeClarificationAnswerResponseSchema,
  symphonyRuntimeIssueResponseSchema,
  symphonyRuntimeWorkflowObservabilityResponseSchema,
  symphonyRuntimeRefreshResponseSchema,
  type SymphonyRealtimeServerMessage,
  type SymphonyRuntimeClarificationAnswerResult,
  type SymphonyRuntimeIssueResult,
  type SymphonyRuntimeWorkflowObservabilityResult,
  type SymphonyRuntimeRefreshResult
} from "@symphony/contracts";
import { messageInvalidatesPath } from "@/core/runtime-summary-client";
import { createRuntimeUrl } from "@/core/runtime-url";

export async function fetchRuntimeIssue(
  runtimeBaseUrl: string,
  issueIdentifier: string,
  fetchImpl: typeof fetch = fetch
): Promise<SymphonyRuntimeIssueResult | null> {
  const endpoint = createRuntimeUrl(`/api/v1/${issueIdentifier}`, runtimeBaseUrl);
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

export async function fetchRuntimeWorkflowObservability(
  runtimeBaseUrl: string,
  issueIdentifier: string,
  input: {
    historyLimit?: number;
    decisionLimit?: number;
  } = {},
  fetchImpl: typeof fetch = fetch
): Promise<SymphonyRuntimeWorkflowObservabilityResult | null> {
  const endpoint = createRuntimeUrl(
    `/api/v1/${issueIdentifier}/workflow-observability`,
    runtimeBaseUrl,
    {
      historyLimit:
        typeof input.historyLimit === "number"
          ? String(input.historyLimit)
          : undefined,
      decisionLimit:
        typeof input.decisionLimit === "number"
          ? String(input.decisionLimit)
          : undefined
    }
  );
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
    throw new Error(
      `Runtime workflow observability request failed with ${response.status}.`
    );
  }

  const parsed = symphonyRuntimeWorkflowObservabilityResponseSchema.parse(
    await response.json()
  );

  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }

  return parsed.data;
}

export async function submitRuntimeClarificationAnswer(
  runtimeBaseUrl: string,
  answerPath: string,
  input: {
    requestId: string;
    answers: Record<string, string>;
  },
  fetchImpl: typeof fetch = fetch
): Promise<SymphonyRuntimeClarificationAnswerResult> {
  const endpoint = createRuntimeUrl(answerPath, runtimeBaseUrl);
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    body: JSON.stringify(input),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Clarification answer request failed with ${response.status}.`);
  }

  const parsed = symphonyRuntimeClarificationAnswerResponseSchema.parse(
    await response.json()
  );

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

export function shouldRefreshRuntimeWorkflowObservability(
  message: SymphonyRealtimeServerMessage,
  issueIdentifier: string
): boolean {
  if (
    message.type === "issue.updated" &&
    message.issueIdentifier === issueIdentifier
  ) {
    return true;
  }

  return messageInvalidatesPath(
    message,
    `/api/v1/${issueIdentifier}/workflow-observability`
  );
}
