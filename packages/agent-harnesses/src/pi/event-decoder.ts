import {
  asRecord,
  getArray,
  getNumber,
  getString
} from "../shared/protocol.js";

export type PiJsonRecord = Record<string, unknown>;

export type PiUsageSnapshot = {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  totalTokens: number;
};

export type PiMessageContentPart =
  | {
      type: "text";
      text: string;
      raw: PiJsonRecord;
    }
  | {
      type: "thinking";
      thinking: string;
      raw: PiJsonRecord;
    }
  | {
      type: "toolCall";
      raw: PiJsonRecord;
    }
  | {
      type: string;
      raw: PiJsonRecord;
    };

export type PiMessageEnvelope = {
  role: string | null;
  responseId: string | null;
  content: PiMessageContentPart[];
  usage: PiUsageSnapshot | null;
  raw: PiJsonRecord;
};

export type PiSessionStartedEvent = {
  type: "session_started";
  id: string | null;
  raw: PiJsonRecord;
};

export type PiTurnStartEvent = {
  type: "turn_start";
  raw: PiJsonRecord;
};

export type PiMessageEndEvent = {
  type: "message_end";
  message: PiMessageEnvelope | null;
  usage: PiUsageSnapshot | null;
  api: string | null;
  provider: string | null;
  model: string | null;
  stopReason: string | null;
  timestamp: string | null;
  raw: PiJsonRecord;
};

export type PiToolExecutionStartEvent = {
  type: "tool_execution_start";
  toolCallId: string | null;
  toolName: string | null;
  args: PiJsonRecord | null;
  raw: PiJsonRecord;
};

export type PiToolExecutionUpdateEvent = {
  type: "tool_execution_update";
  toolCallId: string | null;
  toolName: string | null;
  args: PiJsonRecord | null;
  partialResult: PiJsonRecord | null;
  raw: PiJsonRecord;
};

export type PiToolExecutionEndEvent = {
  type: "tool_execution_end";
  toolCallId: string | null;
  toolName: string | null;
  args: PiJsonRecord | null;
  result: PiJsonRecord | null;
  isError: boolean;
  raw: PiJsonRecord;
};

export type PiQueueUpdateEvent = {
  type: "queue_update";
  steering: string[];
  followUp: string[];
  inProgress: string[];
  completed: string[];
  cancelled: string[];
  tasks: PiJsonRecord[];
  raw: PiJsonRecord;
};

export type PiTurnEndEvent = {
  type: "turn_end";
  message: PiMessageEnvelope | null;
  usage: PiUsageSnapshot | null;
  raw: PiJsonRecord;
};

export type PiProcessExitEvent = {
  type: "process_exit";
  reason: string | null;
  raw: PiJsonRecord;
};

export type PiExtensionUiRequestEvent = {
  type: "extension_ui_request";
  raw: PiJsonRecord;
};

export type PiAgentEndEvent = {
  type: "agent_end";
  raw: PiJsonRecord;
};

export type PiUnknownEvent = {
  type: "unknown";
  rawType: string;
  raw: PiJsonRecord;
};

export type PiRuntimeEvent =
  | PiSessionStartedEvent
  | PiTurnStartEvent
  | PiMessageEndEvent
  | PiToolExecutionStartEvent
  | PiToolExecutionUpdateEvent
  | PiToolExecutionEndEvent
  | PiQueueUpdateEvent
  | PiTurnEndEvent
  | PiProcessExitEvent
  | PiExtensionUiRequestEvent
  | PiAgentEndEvent
  | PiUnknownEvent;

export function decodePiRuntimeEvent(value: unknown): PiRuntimeEvent | null {
  const raw = asRecord(value);
  if (!raw) {
    return null;
  }

  const type = getString(raw, "type");
  if (!type) {
    return null;
  }

  switch (type) {
    case "session_started":
      return {
        type,
        id: getString(raw, "id"),
        raw
      };
    case "turn_start":
      return { type, raw };
    case "message_end":
      return {
        type,
        message: decodePiMessageEnvelope(raw.message),
        usage: decodePiUsage(raw.usage) ?? decodePiUsage(asRecord(raw.message)?.usage),
        api: getString(raw, "api") ?? getString(asRecord(raw.message), "api"),
        provider: getString(raw, "provider") ?? getString(asRecord(raw.message), "provider"),
        model: getString(raw, "model") ?? getString(asRecord(raw.message), "model"),
        stopReason:
          getString(raw, "stopReason") ?? getString(asRecord(raw.message), "stopReason"),
        timestamp: normalizePiTimestamp(raw.timestamp ?? asRecord(raw.message)?.timestamp),
        raw
      };
    case "tool_execution_start":
      return {
        type,
        toolCallId: getString(raw, "toolCallId"),
        toolName: getString(raw, "toolName"),
        args: asRecord(raw.args),
        raw
      };
    case "tool_execution_update":
      return {
        type,
        toolCallId: getString(raw, "toolCallId"),
        toolName: getString(raw, "toolName"),
        args: asRecord(raw.args),
        partialResult: asRecord(raw.partialResult),
        raw
      };
    case "tool_execution_end":
      return {
        type,
        toolCallId: getString(raw, "toolCallId"),
        toolName: getString(raw, "toolName"),
        args: asRecord(raw.args),
        result: asRecord(raw.result),
        isError: raw.isError === true,
        raw
      };
    case "queue_update":
      return {
        type,
        steering: getStringArray(raw.steering),
        followUp: getStringArray(raw.followUp),
        inProgress: getStringArray(raw.inProgress),
        completed: getStringArray(raw.completed),
        cancelled: getStringArray(raw.cancelled),
        tasks: getArray(raw, "tasks")
          .map((entry) => asRecord(entry))
          .filter((entry): entry is PiJsonRecord => entry !== null),
        raw
      };
    case "turn_end":
      return {
        type,
        message: decodePiMessageEnvelope(raw.message),
        usage: decodePiUsage(raw.usage) ?? decodePiUsage(asRecord(raw.message)?.usage),
        raw
      };
    case "process_exit":
      return {
        type,
        reason: getString(raw, "reason"),
        raw
      };
    case "extension_ui_request":
      return { type, raw };
    case "agent_end":
      return { type, raw };
    default:
      return {
        type: "unknown",
        rawType: type,
        raw
      };
  }
}

export function decodePiUsage(value: unknown): PiUsageSnapshot | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const input = getNumber(record, "input") ?? getNumber(record, "input_tokens") ?? 0;
  const cacheRead =
    getNumber(record, "cacheRead") ?? getNumber(record, "cached_input_tokens") ?? 0;
  const cacheWrite =
    getNumber(record, "cacheWrite") ?? getNumber(record, "cache_write_tokens") ?? 0;
  const output = getNumber(record, "output") ?? getNumber(record, "output_tokens") ?? 0;
  const totalTokens =
    getNumber(record, "totalTokens") ??
    getNumber(record, "total_tokens") ??
    input + cacheRead + cacheWrite + output;

  return input > 0 || cacheRead > 0 || cacheWrite > 0 || output > 0 || totalTokens > 0
    ? {
        input,
        cacheRead,
        cacheWrite,
        output,
        totalTokens
      }
    : null;
}

export function extractPiRuntimeUsage(
  event: PiMessageEndEvent | PiTurnEndEvent
): PiUsageSnapshot | null {
  return event.usage ?? event.message?.usage ?? null;
}

function decodePiMessageEnvelope(value: unknown): PiMessageEnvelope | null {
  const raw = asRecord(value);
  if (!raw) {
    return null;
  }

  return {
    role: getString(raw, "role"),
    responseId: getString(raw, "responseId"),
    content: getArray(raw, "content")
      .map((entry) => decodePiMessageContentPart(entry))
      .filter((entry): entry is PiMessageContentPart => entry !== null),
    usage: decodePiUsage(raw.usage),
    raw
  };
}

function decodePiMessageContentPart(value: unknown): PiMessageContentPart | null {
  const raw = asRecord(value);
  if (!raw) {
    return null;
  }

  const type = getString(raw, "type");
  if (!type) {
    return null;
  }

  if (type === "text") {
    const text = getString(raw, "text");
    return text
      ? {
          type,
          text,
          raw
        }
      : null;
  }

  if (type === "thinking") {
    const thinking = getString(raw, "thinking");
    return thinking
      ? {
          type,
          thinking,
          raw
        }
      : null;
  }

  if (type === "toolCall") {
    return { type, raw };
  }

  return { type, raw };
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
    : [];
}

function normalizePiTimestamp(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && /^\d+$/.test(value.trim())) {
      return new Date(numeric).toISOString();
    }

    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }

  return null;
}
