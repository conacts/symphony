import type {
  AgentMessageItem,
  CommandExecutionItem,
  FileChangeItem,
  ItemCompletedEvent,
  ItemStartedEvent,
  ItemUpdatedEvent,
  McpToolCallItem,
  ReasoningItem,
  ThreadEvent,
  ThreadItem,
  Usage
} from "./sdk-types.js";

export type CodexPayloadOverflowKind =
  | "agent_message"
  | "command_output"
  | "event_payload"
  | "reasoning"
  | "tool_result";

export type CodexEventEnvelope = {
  id: string;
  run_id: string;
  turn_id: string | null;
  thread_id: string | null;
  item_id: string | null;
  event_type: ThreadEvent["type"];
  sequence: number;
  recorded_at: string;
  payload: ThreadEvent;
  payload_overflow_id: string | null;
  payload_truncated: boolean;
  inserted_at: string;
};

export type CodexAnalyticsEventInput = {
  runId: string;
  turnId: string | null;
  threadId: string | null;
  recordedAt: string;
  payload: ThreadEvent;
};

export type CodexRunStatus =
  | "dispatching"
  | "running"
  | "completed"
  | "paused"
  | "failed"
  | "startup_failed"
  | "rate_limited"
  | "stalled"
  | "stopped";

export type CodexTurnStatus =
  | "running"
  | "completed"
  | "failed"
  | "stopped";

export type CodexAnalyticsRunStart = {
  runId: string;
  issueId: string;
  issueIdentifier: string;
  startedAt: string;
  status: CodexRunStatus;
  threadId: string | null;
};

export type CodexAnalyticsRunFinalize = {
  runId: string;
  endedAt: string;
  status: CodexRunStatus;
  threadId: string | null;
  failureKind: string | null;
  failureOrigin: string | null;
  failureMessagePreview: string | null;
};

export type CodexAnalyticsTurnFinalize = {
  runId: string;
  turnId: string;
  endedAt: string;
  status: CodexTurnStatus;
  threadId: string | null;
  failureKind: string | null;
  failureMessagePreview: string | null;
};

export interface CodexAnalyticsStore {
  startRun(input: CodexAnalyticsRunStart): Promise<void>;
  recordEvent(input: CodexAnalyticsEventInput): Promise<void>;
  finalizeTurn(input: CodexAnalyticsTurnFinalize): Promise<void>;
  finalizeRun(input: CodexAnalyticsRunFinalize): Promise<void>;
}

export function isThreadEvent(value: unknown): value is ThreadEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const type = (value as Record<string, unknown>).type;
  if (typeof type !== "string") {
    return false;
  }

  switch (type) {
    case "thread.started":
      return typeof (value as { thread_id?: unknown }).thread_id === "string";
    case "turn.started":
      return true;
    case "turn.completed":
      return isUsage((value as { usage?: unknown }).usage);
    case "turn.failed":
      return isThreadError((value as { error?: unknown }).error);
    case "item.started":
    case "item.updated":
    case "item.completed":
      return isThreadItem((value as { item?: unknown }).item);
    case "error":
      return typeof (value as { message?: unknown }).message === "string";
    default:
      return false;
  }
}

export function extractUsage(event: ThreadEvent): Usage | null {
  return event.type === "turn.completed" ? event.usage : null;
}

export function extractItemEvent(
  event: ThreadEvent
): ItemStartedEvent | ItemUpdatedEvent | ItemCompletedEvent | null {
  switch (event.type) {
    case "item.started":
    case "item.updated":
    case "item.completed":
      return event;
    default:
      return null;
  }
}

export function extractItemId(event: ThreadEvent): string | null {
  const itemEvent = extractItemEvent(event);
  return itemEvent?.item.id ?? null;
}

export function extractItemType(event: ThreadEvent): ThreadItem["type"] | null {
  const itemEvent = extractItemEvent(event);
  return itemEvent?.item.type ?? null;
}

export function extractItemStatus(event: ThreadEvent): string | null {
  const itemEvent = extractItemEvent(event);
  if (!itemEvent) {
    return null;
  }

  const { item } = itemEvent;
  switch (item.type) {
    case "command_execution":
    case "file_change":
    case "mcp_tool_call":
      return item.status;
    default:
      return null;
  }
}

export function extractThreadId(event: ThreadEvent): string | null {
  return event.type === "thread.started" ? event.thread_id : null;
}

export function previewText(text: string | null | undefined, maxLength = 280): string | null {
  if (typeof text !== "string") {
    return null;
  }

  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized === "") {
    return null;
  }

  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, maxLength - 1)}…`;
}

export function previewItem(item: ThreadItem, maxLength = 280): string | null {
  switch (item.type) {
    case "agent_message":
      return previewText(item.text, maxLength);
    case "reasoning":
      return previewText(item.text, maxLength);
    case "command_execution":
      return previewText(item.aggregated_output || item.command, maxLength);
    case "file_change":
      return previewText(item.changes.map((change) => change.path).join(", "), maxLength);
    case "mcp_tool_call":
      return previewText(`${item.server}.${item.tool}`, maxLength);
    case "web_search":
      return previewText(item.query, maxLength);
    case "todo_list":
      return previewText(
        item.items.map((todo) => `${todo.completed ? "[x]" : "[ ]"} ${todo.text}`).join("; "),
        maxLength
      );
    case "error":
      return previewText(item.message, maxLength);
  }
}

export function computeDurationMs(
  startedAt: string | null | undefined,
  endedAt: string | null | undefined
): number | null {
  if (!startedAt || !endedAt) {
    return null;
  }

  const started = Date.parse(startedAt);
  const ended = Date.parse(endedAt);

  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started) {
    return null;
  }

  return ended - started;
}

export function commandOutput(item: CommandExecutionItem): string | null {
  return item.aggregated_output.trim() === "" ? null : item.aggregated_output;
}

export function toolResultContent(item: McpToolCallItem): string | null {
  if (!item.result) {
    return null;
  }

  return JSON.stringify(item.result);
}

export function messageText(
  item: AgentMessageItem | ReasoningItem
): string | null {
  return item.text.trim() === "" ? null : item.text;
}

export function fileChangePaths(item: FileChangeItem): string[] {
  return item.changes.map((change) => change.path);
}

function isUsage(value: unknown): value is Usage {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).input_tokens === "number" &&
    typeof (value as Record<string, unknown>).cached_input_tokens === "number" &&
    typeof (value as Record<string, unknown>).output_tokens === "number"
  );
}

function isThreadError(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).message === "string"
  );
}

function isThreadItem(value: unknown): value is ThreadItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const type = (value as Record<string, unknown>).type;
  const id = (value as Record<string, unknown>).id;
  if (typeof type !== "string" || typeof id !== "string") {
    return false;
  }

  switch (type) {
    case "agent_message":
    case "reasoning":
      return typeof (value as { text?: unknown }).text === "string";
    case "command_execution":
      return (
        typeof (value as { command?: unknown }).command === "string" &&
        typeof (value as { aggregated_output?: unknown }).aggregated_output === "string" &&
        typeof (value as { status?: unknown }).status === "string"
      );
    case "file_change":
      return Array.isArray((value as { changes?: unknown }).changes);
    case "mcp_tool_call":
      return (
        typeof (value as { server?: unknown }).server === "string" &&
        typeof (value as { tool?: unknown }).tool === "string" &&
        typeof (value as { status?: unknown }).status === "string"
      );
    case "web_search":
      return typeof (value as { query?: unknown }).query === "string";
    case "todo_list":
      return Array.isArray((value as { items?: unknown }).items);
    case "error":
      return typeof (value as { message?: unknown }).message === "string";
    default:
      return false;
  }
}
