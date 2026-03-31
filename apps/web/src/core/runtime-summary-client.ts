import {
  symphonyRealtimeClientMessageSchema,
  symphonyRealtimeServerMessageSchema,
  symphonyRuntimeStateResponseSchema,
  type SymphonyRealtimeClientMessage,
  type SymphonyRealtimeServerMessage,
  type SymphonyRuntimeStateResult
} from "@symphony/contracts";

export async function fetchRuntimeSummary(
  stateUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<SymphonyRuntimeStateResult> {
  const response = await fetchImpl(stateUrl, {
    headers: {
      accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Runtime summary request failed with ${response.status}.`);
  }

  const parsed = symphonyRuntimeStateResponseSchema.parse(await response.json());

  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }

  return parsed.data;
}

export function serializeRealtimeClientMessage(
  message: SymphonyRealtimeClientMessage
): string {
  return JSON.stringify(symphonyRealtimeClientMessageSchema.parse(message));
}

export function parseRealtimeServerMessage(
  rawMessage: string
): SymphonyRealtimeServerMessage | null {
  try {
    return symphonyRealtimeServerMessageSchema.parse(JSON.parse(rawMessage));
  } catch {
    return null;
  }
}

export function shouldRefreshRuntimeSummary(
  message: SymphonyRealtimeServerMessage
): boolean {
  return message.type === "runtime.snapshot.updated";
}

export function messageInvalidatesPath(
  message: SymphonyRealtimeServerMessage,
  path: string
): boolean {
  if (!("invalidate" in message)) {
    return false;
  }

  const targetPath = new URL(path, "http://localhost").pathname;

  return message.invalidate.some((candidate) => {
    const candidatePath = new URL(candidate, "http://localhost").pathname;
    return candidatePath === targetPath;
  });
}
