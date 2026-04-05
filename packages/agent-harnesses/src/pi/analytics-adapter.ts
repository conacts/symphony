import type {
  AgentMessageItem,
  CommandExecutionItem,
  McpToolCallItem,
  ReasoningItem,
  ThreadEvent,
  Usage
} from "@symphony/codex-analytics";
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
    };

export type PiAnalyticsProjection = SymphonyAgentHarnessAnalyticsProjection<
  ThreadEvent,
  PiAnalyticsLoss
>;

export type PiAnalyticsAdapter = {
  projectSessionHeaderEvent: typeof projectPiSessionHeaderEvent;
  projectTurnStartEvent: typeof projectPiTurnStartEvent;
  projectMessageEndEvent: typeof projectPiMessageEndEvent;
  projectToolExecutionStartEvent: typeof projectPiToolExecutionStartEvent;
  projectToolExecutionUpdateEvent: typeof projectPiToolExecutionUpdateEvent;
  projectToolExecutionEndEvent: typeof projectPiToolExecutionEndEvent;
  projectTurnEndEvent: typeof projectPiTurnEndEvent;
};

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
    events: [
      {
        type: "turn.started"
      }
    ],
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

  const item = projectToolItem(
    toolCallId,
    toolName,
    input.event.args,
    output,
    isError
  );

  if (item.type === "command_execution") {
    losses.push({
      kind: "command_exit_code_unavailable",
      toolCallId,
      command: item.command
    });
  }

  return {
    events: [
      {
        type: "item.completed",
        item
      }
    ],
    losses
  };
}

export function projectPiTurnEndEvent(input: {
  event: PiJsonRecord;
}): PiAnalyticsProjection {
  return {
    events: [
      {
        type: "turn.completed",
        usage: projectUsage(asRecord(input.event.message))
      }
    ],
    losses: []
  };
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
  projectSessionHeaderEvent: projectPiSessionHeaderEvent,
  projectTurnStartEvent: projectPiTurnStartEvent,
  projectMessageEndEvent: projectPiMessageEndEvent,
  projectToolExecutionStartEvent: projectPiToolExecutionStartEvent,
  projectToolExecutionUpdateEvent: projectPiToolExecutionUpdateEvent,
  projectToolExecutionEndEvent: projectPiToolExecutionEndEvent,
  projectTurnEndEvent: projectPiTurnEndEvent
};
