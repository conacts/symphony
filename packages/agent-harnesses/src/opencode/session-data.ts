import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import { openCodeAnalyticsAdapter } from "./analytics-adapter.js";
import {
  HarnessSessionError,
  type HarnessSession
} from "../shared/session-types.js";

export function buildOpenCodePromptModel(
  session: HarnessSession
): {
  providerID: string;
  modelID: string;
} | undefined {
  if (!session.providerId) {
    return undefined;
  }

  return {
    providerID: session.providerId,
    modelID: session.model
  };
}

export async function fetchOpenCodeTodoSnapshot(input: {
  sdkClient: OpencodeClient;
  sessionId: string;
  signal: AbortSignal;
}) {
  const response = await input.sdkClient.session.todo(
    {
      sessionID: input.sessionId
    },
    {
      signal: input.signal,
      throwOnError: true,
      responseStyle: "data"
    }
  );

  return {
    rawPayload: response,
    todos: unwrapOpenCodeData(response, "OpenCode session.todo")
  };
}

export async function fetchOpenCodeSessionDiff(input: {
  sdkClient: OpencodeClient;
  sessionId: string;
  messageId: string;
  signal: AbortSignal;
}) {
  try {
    const diff = await input.sdkClient.session.diff(
      {
        sessionID: input.sessionId,
        messageID: input.messageId
      },
      {
        signal: input.signal,
        throwOnError: true,
        responseStyle: "data"
      }
    );
    const diffData = unwrapOpenCodeData(diff, "OpenCode session.diff");

    return {
      rawPayload: diff,
      projection: openCodeAnalyticsAdapter.projectSessionDiff({
        sessionId: input.sessionId,
        diffs: diffData
      })
    };
  } catch {
    return {
      rawPayload: null,
      projection: {
        events: [],
        losses: []
      }
    };
  }
}

export function formatOpenCodeMessageError(error: unknown): string {
  if (!error || typeof error !== "object" || Array.isArray(error)) {
    return "OpenCode assistant response failed.";
  }

  const record = error as Record<string, unknown>;
  const name =
    typeof record.name === "string" && record.name.trim() !== ""
      ? record.name
      : "OpenCodeError";
  const data =
    record.data && typeof record.data === "object" && !Array.isArray(record.data)
      ? (record.data as Record<string, unknown>)
      : null;
  const message =
    data && typeof data.message === "string" && data.message.trim() !== ""
      ? data.message
      : null;

  return message ? `${name}: ${message}` : `${name}: assistant response failed.`;
}

export function unwrapOpenCodeData<T>(
  value: T | {
    data: T;
  },
  label: string
): T {
  if (value && typeof value === "object" && "data" in value) {
    return value.data;
  }

  if (value === undefined) {
    throw new HarnessSessionError(
      "opencode_invalid_response",
      `${label} did not return data.`
    );
  }

  return value;
}
