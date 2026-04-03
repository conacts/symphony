import {
  symphonyRuntimeHealthResponseSchema,
  symphonyRuntimeLogsResponseSchema,
  type SymphonyRealtimeServerMessage,
  type SymphonyRuntimeHealthResult,
  type SymphonyRuntimeLogsResult
} from "@symphony/contracts";
import { messageInvalidatesPath } from "@/core/runtime-summary-client";
import { createRuntimeUrl } from "@/core/runtime-url";

export async function fetchRuntimeHealth(
  runtimeBaseUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<SymphonyRuntimeHealthResult> {
  const endpoint = createRuntimeUrl("/api/v1/health", runtimeBaseUrl);
  const response = await fetchImpl(endpoint, {
    headers: {
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Runtime health request failed with ${response.status}.`);
  }

  const parsed = symphonyRuntimeHealthResponseSchema.parse(await response.json());

  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }

  return parsed.data;
}

export async function fetchRuntimeLogs(
  runtimeBaseUrl: string,
  input: {
    limit?: number;
    issueIdentifier?: string;
  } = {},
  fetchImpl: typeof fetch = fetch
): Promise<SymphonyRuntimeLogsResult> {
  const endpoint = createRuntimeUrl("/api/v1/runtime/logs", runtimeBaseUrl, {
    limit: input.limit ? String(input.limit) : undefined,
    issueIdentifier: input.issueIdentifier
  });
  const response = await fetchImpl(endpoint, {
    headers: {
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Runtime logs request failed with ${response.status}.`);
  }

  const parsed = symphonyRuntimeLogsResponseSchema.parse(await response.json());

  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }

  return parsed.data;
}

export function shouldRefreshRuntimeHealth(
  message: SymphonyRealtimeServerMessage
): boolean {
  return message.type === "runtime.snapshot.updated";
}

export function shouldRefreshRuntimeLogs(
  message: SymphonyRealtimeServerMessage
): boolean {
  return (
    message.type === "runtime.snapshot.updated" ||
    message.type === "issue.updated" ||
    message.type === "run.updated" ||
    messageInvalidatesPath(message, "/api/v1/runtime/logs")
  );
}
