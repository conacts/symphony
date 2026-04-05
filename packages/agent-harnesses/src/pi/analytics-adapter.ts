import type {
  AgentMessageItem,
  CommandExecutionItem,
  FileChangeItem,
  McpToolCallItem,
  ReasoningItem,
  ThreadEvent,
  TodoListItem,
  Usage
} from "@symphony/agent-analytics";
import type { SymphonyAgentHarnessAnalyticsProjection } from "../shared/types.js";

type PiJsonRecord = Record<string, unknown>;

export type PiAnalyticsLoss =
  | {
      kind: "unsupported_message_part";
      partType: string;
    }
  | {
      kind: "command_exit_code_unavailable";
      toolCallId: string;
      command: string;
    }
  | {
      kind: "non_text_tool_result";
      toolCallId: string;
      toolName: string;
    }
  | {
      kind: "file_change_kind_ambiguous";
      toolCallId: string;
      toolName: string;
      path: string;
    };

export type PiAnalyticsProjection = SymphonyAgentHarnessAnalyticsProjection<
  ThreadEvent,
  PiAnalyticsLoss
>;

export type PiAnalyticsAdapter = {
  projectRuntimeEvent: typeof projectPiRuntimeEvent;
  projectSessionHeaderEvent: typeof projectPiSessionHeaderEvent;
  projectTurnStartEvent: typeof projectPiTurnStartEvent;
  projectMessageEndEvent: typeof projectPiMessageEndEvent;
  projectToolExecutionStartEvent: typeof projectPiToolExecutionStartEvent;
  projectToolExecutionUpdateEvent: typeof projectPiToolExecutionUpdateEvent;
  projectToolExecutionEndEvent: typeof projectPiToolExecutionEndEvent;
  projectQueueUpdateEvent: typeof projectPiQueueUpdateEvent;
  projectTurnEndEvent: typeof projectPiTurnEndEvent;
  extractTurnUsage: typeof extractPiTurnUsage;
};

export function projectPiRuntimeEvent(input: {
  event: PiJsonRecord;
}): PiAnalyticsProjection | null {
  const type = getString(input.event, "type");

  switch (type) {
    case "turn_start":
      return null;
    case "message_end":
      return projectPiMessageEndEvent(input);
    case "tool_execution_start":
      return projectPiToolExecutionStartEvent(input);
    case "tool_execution_update":
      return projectPiToolExecutionUpdateEvent(input);
    case "tool_execution_end":
      return projectPiToolExecutionEndEvent(input);
    case "queue_update":
      return projectPiQueueUpdateEvent(input);
    case "turn_end":
      return null;
    default:
      return null;
  }
}

export function projectPiSessionHeaderEvent(input: {
  event: PiJsonRecord;
}): PiAnalyticsProjection {
  const sessionId = getString(input.event, "id");
  return sessionId
    ? {
        events: [
          {
            type: "thread.started",
            thread_id: sessionId
          }
        ],
        losses: []
      }
    : {
        events: [],
        losses: []
      };
}

export function projectPiTurnStartEvent(): PiAnalyticsProjection {
  return {
    events: [],
    losses: []
  };
}

export function projectPiMessageEndEvent(input: {
  event: PiJsonRecord;
}): PiAnalyticsProjection {
  const message = asRecord(input.event.message);
  if (!message || getString(message, "role") !== "assistant") {
    return {
      events: [],
      losses: []
    };
  }

  const events: ThreadEvent[] = [];
  const losses: PiAnalyticsLoss[] = [];

  for (const partValue of getArray(message, "content")) {
    const part = asRecord(partValue);
    const partType = getString(part, "type");

    if (!partType || partType === "toolCall") {
      continue;
    }

    if (partType === "thinking") {
      const text = getString(part, "thinking");
      if (text) {
        const item: ReasoningItem = {
          id: `${getString(message, "responseId") ?? "pi"}:reasoning:${events.length}`,
          type: "reasoning",
          text
        };
        events.push({
          type: "item.completed",
          item
        });
      }
      continue;
    }

    if (partType === "text") {
      const text = getString(part, "text");
      if (text) {
        const item: AgentMessageItem = {
          id: `${getString(message, "responseId") ?? "pi"}:text:${events.length}`,
          type: "agent_message",
          text
        };
        events.push({
          type: "item.completed",
          item
        });
      }
      continue;
    }

    losses.push({
      kind: "unsupported_message_part",
      partType
    });
  }

  return {
    events,
    losses
  };
}

export function projectPiToolExecutionStartEvent(input: {
  event: PiJsonRecord;
}): PiAnalyticsProjection {
  const toolCallId = getString(input.event, "toolCallId");
  const toolName = getString(input.event, "toolName");
  if (!toolCallId || !toolName) {
    return {
      events: [],
      losses: []
    };
  }

  return {
    events: [
      {
        type: "item.started",
        item: projectToolItem(toolCallId, toolName, input.event.args, null, false)
      }
    ],
    losses: []
  };
}

export function projectPiToolExecutionUpdateEvent(input: {
  event: PiJsonRecord;
}): PiAnalyticsProjection {
  const toolCallId = getString(input.event, "toolCallId");
  const toolName = getString(input.event, "toolName");
  if (!toolCallId || !toolName || toolName !== "bash") {
    return {
      events: [],
      losses: []
    };
  }

  const output = extractToolContentText(input.event.partialResult);
  if (output === null) {
    return {
      events: [],
      losses: []
    };
  }

  const item: CommandExecutionItem = {
    id: toolCallId,
    type: "command_execution",
    command: extractBashCommand(input.event.args),
    aggregated_output: output,
    status: "in_progress"
  };

  return {
    events: [
      {
        type: "item.updated",
        item
      }
    ],
    losses: []
  };
}

export function projectPiToolExecutionEndEvent(input: {
  event: PiJsonRecord;
}): PiAnalyticsProjection {
  const toolCallId = getString(input.event, "toolCallId");
  const toolName = getString(input.event, "toolName");
  if (!toolCallId || !toolName) {
    return {
      events: [],
      losses: []
    };
  }

  const isError = Boolean(input.event.isError);
  const output = extractToolContentText(input.event.result);
  const losses: PiAnalyticsLoss[] =
    output === null
      ? [
          {
            kind: "non_text_tool_result",
            toolCallId,
            toolName
          }
        ]
      : [];

  const resolvedArgs = input.event.args ?? extractToolResultPath(input.event.result);
  const item = projectToolItem(
    toolCallId,
    toolName,
    resolvedArgs,
    output,
    isError
  );
  const events: ThreadEvent[] = [
    {
      type: "item.completed",
      item
    }
  ];
  const fileChangeProjection = projectPiFileChangeItem({
    toolCallId,
    toolName,
    argsValue: resolvedArgs,
    isError
  });

  if (fileChangeProjection) {
    events.push({
      type: "item.completed",
      item: fileChangeProjection.item
    });
    if (fileChangeProjection.loss) {
      losses.push(fileChangeProjection.loss);
    }
  }

  if (item.type === "command_execution") {
    losses.push({
      kind: "command_exit_code_unavailable",
      toolCallId,
      command: item.command
    });
  }

  return {
    events,
    losses
  };
}

export function projectPiQueueUpdateEvent(input: {
  event: PiJsonRecord;
}): PiAnalyticsProjection {
  const item: TodoListItem = {
    id: "pi-todo-queue",
    type: "todo_list",
    items: [
      ...getStringArray(input.event.steering).map((text) => ({
        text: `[Steering] ${text}`,
        completed: false
      })),
      ...getStringArray(input.event.followUp).map((text) => ({
        text: `[Follow-up] ${text}`,
        completed: false
      }))
    ]
  };

  return {
    events: [
      {
        type: "item.updated",
        item
      }
    ],
    losses: []
  };
}

export function projectPiTurnEndEvent(): PiAnalyticsProjection {
  return {
    events: [],
    losses: []
  };
}

export function extractPiTurnUsage(input: {
  event: PiJsonRecord;
}): Usage | null {
  const usage = projectUsage(asRecord(input.event.message));
  return usage.input_tokens > 0 ||
    usage.cached_input_tokens > 0 ||
    usage.output_tokens > 0
    ? usage
    : null;
}

function projectToolItem(
  toolCallId: string,
  toolName: string,
  argsValue: unknown,
  output: string | null,
  isError: boolean
): CommandExecutionItem | McpToolCallItem {
  if (toolName === "bash") {
    const item: CommandExecutionItem = {
      id: toolCallId,
      type: "command_execution",
      command: extractBashCommand(argsValue),
      aggregated_output: output ?? "",
      status: isError ? "failed" : output === null ? "in_progress" : "completed"
    };
    return item;
  }

  const item: McpToolCallItem = {
    id: toolCallId,
    type: "mcp_tool_call",
    server: "pi",
    tool: toolName,
    arguments: asRecord(argsValue) ?? {},
    status: isError ? "failed" : output === null ? "in_progress" : "completed",
    ...(output === null
      ? {}
      : {
          result: {
            content: [
              {
                type: "text",
                text: output
              }
            ],
            structured_content: null
          }
        }),
    ...(isError
      ? {
          error: {
            message: output ?? `${toolName} failed`
          }
        }
      : {})
  };
  return item;
}

function projectPiFileChangeItem(input: {
  toolCallId: string;
  toolName: string;
  argsValue: unknown;
  isError: boolean;
}): {
  item: FileChangeItem;
  loss: PiAnalyticsLoss | null;
} | null {
  if (input.isError) {
    return null;
  }

  const path = extractFilePath(input.argsValue);
  if (!path) {
    return null;
  }

  if (input.toolName === "edit") {
    return {
      item: {
        id: `pi-file-change:${input.toolCallId}`,
        type: "file_change",
        changes: [
          {
            path,
            kind: "update"
          }
        ],
        status: "completed"
      },
      loss: null
    };
  }

  if (input.toolName === "write") {
    return {
      item: {
        id: `pi-file-change:${input.toolCallId}`,
        type: "file_change",
        changes: [
          {
            path,
            kind: "update"
          }
        ],
        status: "completed"
      },
      loss: {
        kind: "file_change_kind_ambiguous",
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        path
      }
    };
  }

  return null;
}

function extractToolResultPath(value: unknown): PiJsonRecord | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const content = getArray(record, "content");
  const text = content
    .map((entry) => {
      const part = asRecord(entry);
      return getString(part, "text");
    })
    .find((text): text is string => typeof text === "string" && text.length > 0);

  if (!text) {
    return null;
  }

  const match = text.match(/(?:\bin\b|\bto\b)\s+(.+)$/);
  if (!match) {
    return null;
  }

  let candidate = match[1].trim();
  if (candidate.endsWith(".")) {
    candidate = candidate.slice(0, -1).trim();
  }

  if (!candidate || candidate.includes(" ") || !/[\\/.]/.test(candidate)) {
    return null;
  }

  return { path: candidate };
}

function projectUsage(message: PiJsonRecord | null): Usage {
  const usage = asRecord(message?.usage);
  return {
    input_tokens: getNumber(usage, "input") ?? 0,
    cached_input_tokens: getNumber(usage, "cacheRead") ?? 0,
    output_tokens: getNumber(usage, "output") ?? 0
  };
}

function extractBashCommand(argsValue: unknown): string {
  const args = asRecord(argsValue);
  return getString(args, "command") ?? "bash";
}

function extractFilePath(argsValue: unknown): string | null {
  const args = asRecord(argsValue);
  return getString(args, "path") ?? getString(args, "file_path");
}

function extractToolContentText(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const content = getArray(record, "content");
  const parts = content
    .map((entry) => {
      const part = asRecord(entry);
      return getString(part, "text");
    })
    .filter((text): text is string => typeof text === "string");

  if (parts.length > 0) {
    return parts.join("");
  }

  return null;
}

function asRecord(value: unknown): PiJsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as PiJsonRecord)
    : null;
}

function getArray(value: PiJsonRecord | null | undefined, key: string): unknown[] {
  const nested = value?.[key];
  return Array.isArray(nested) ? nested : [];
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
    : [];
}

function getString(
  value: PiJsonRecord | null | undefined,
  key: string
): string | null {
  const nested = value?.[key];
  return typeof nested === "string" && nested.trim() !== "" ? nested : null;
}

function getNumber(
  value: PiJsonRecord | null | undefined,
  key: string
): number | null {
  const nested = value?.[key];
  return typeof nested === "number" && Number.isFinite(nested) ? nested : null;
}

export const piAnalyticsAdapter: PiAnalyticsAdapter = {
  projectRuntimeEvent: projectPiRuntimeEvent,
  projectSessionHeaderEvent: projectPiSessionHeaderEvent,
  projectTurnStartEvent: projectPiTurnStartEvent,
  projectMessageEndEvent: projectPiMessageEndEvent,
  projectToolExecutionStartEvent: projectPiToolExecutionStartEvent,
  projectToolExecutionUpdateEvent: projectPiToolExecutionUpdateEvent,
  projectToolExecutionEndEvent: projectPiToolExecutionEndEvent,
  projectQueueUpdateEvent: projectPiQueueUpdateEvent,
  projectTurnEndEvent: projectPiTurnEndEvent,
  extractTurnUsage: extractPiTurnUsage
};
