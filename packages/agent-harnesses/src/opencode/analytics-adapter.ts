import type {
  CommandExecutionItem,
  FileChangeItem,
  McpToolCallItem,
  ThreadEvent,
  TodoListItem,
  Usage
} from "@symphony/codex-analytics";
import type {
  AssistantMessage,
  FileDiff,
  EventCommandExecuted,
  EventTodoUpdated,
  Part
} from "@opencode-ai/sdk/v2";
import type { SymphonyAgentHarnessAnalyticsProjection } from "../shared/types.js";

export type OpenCodeAnalyticsLoss =
  | {
      kind: "command_output_unavailable";
      command: string;
    }
  | {
      kind: "patch_change_kind_unknown";
      files: string[];
    }
  | {
      kind: "reasoning_tokens_folded_into_output";
      messageId: string;
      reasoningTokens: number;
    }
  | {
      kind: "unsupported_part";
      partId: string;
      partType: string;
    }
  | {
      kind: "missing_diff_status";
      files: string[];
    };

export type OpenCodeAnalyticsProjection = SymphonyAgentHarnessAnalyticsProjection<
  ThreadEvent,
  OpenCodeAnalyticsLoss
>;

export function projectOpenCodePromptResponse(input: {
  response: {
    info: AssistantMessage;
    parts: Part[];
  };
}): OpenCodeAnalyticsProjection {
  const { info, parts } = input.response;
  const events: ThreadEvent[] = [];
  const losses: OpenCodeAnalyticsLoss[] = [];

  for (const part of parts) {
    switch (part.type) {
      case "text":
        events.push({
          type: "item.completed",
          item: {
            id: part.id,
            type: "agent_message",
            text: part.text
          }
        });
        break;
      case "reasoning":
        events.push({
          type: "item.completed",
          item: {
            id: part.id,
            type: "reasoning",
            text: part.text
          }
        });
        break;
      case "tool":
        events.push({
          type: "item.completed",
          item: projectToolPart(part)
        });
        break;
      case "patch":
        events.push({
          type: "item.completed",
          item: {
            id: part.id,
            type: "file_change",
            changes: part.files.map((file) => ({
              path: file,
              kind: "update" as const
            })),
            status: "completed"
          }
        });
        losses.push({
          kind: "patch_change_kind_unknown",
          files: [...part.files]
        });
        break;
      case "step-finish":
      case "step-start":
      case "snapshot":
      case "agent":
      case "retry":
      case "compaction":
      case "subtask":
      case "file":
        losses.push({
          kind: "unsupported_part",
          partId: part.id,
          partType: part.type
        });
        break;
    }
  }

  const usage = projectUsage(info);
  if (info.tokens.reasoning > 0) {
    losses.push({
      kind: "reasoning_tokens_folded_into_output",
      messageId: info.id,
      reasoningTokens: info.tokens.reasoning
    });
  }

  events.push({
    type: "turn.completed",
    usage
  });

  return {
    events,
    losses
  };
}

export function projectOpenCodeTodoUpdatedEvent(input: {
  event: EventTodoUpdated;
}): OpenCodeAnalyticsProjection {
  return {
    events: [projectOpenCodeTodoListEvent({
      sessionId: input.event.properties.sessionID,
      todos: input.event.properties.todos
    })],
    losses: []
  };
}

export function projectOpenCodeTodoListEvent(input: {
  sessionId: string;
  todos: EventTodoUpdated["properties"]["todos"];
}): ThreadEvent {
  const item: TodoListItem = {
    id: `opencode-todo:${input.sessionId}`,
    type: "todo_list",
    items: input.todos.map((todo) => ({
      text: todo.content,
      completed: todo.status === "completed"
    }))
  };

  return {
    type: "item.updated",
    item
  };
}

export function projectOpenCodeCommandExecutedEvent(input: {
  event: EventCommandExecuted;
}): OpenCodeAnalyticsProjection {
  const command = `${input.event.properties.name} ${input.event.properties.arguments}`.trim();
  const item: CommandExecutionItem = {
    id: `opencode-command:${input.event.properties.messageID}:${input.event.properties.name}`,
    type: "command_execution",
    command,
    aggregated_output: "",
    status: "completed"
  };

  return {
    events: [
      {
        type: "item.completed",
        item
      }
    ],
    losses: [
      {
        kind: "command_output_unavailable",
        command
      }
    ]
  };
}

export function projectOpenCodeSessionDiff(input: {
  sessionId: string;
  diffs: FileDiff[];
}): OpenCodeAnalyticsProjection {
  const missingStatusFiles = input.diffs
    .filter((diff) => !diff.status)
    .map((diff) => diff.file);
  const item: FileChangeItem = {
    id: `opencode-diff:${input.sessionId}`,
    type: "file_change",
    changes: input.diffs.map((diff) => ({
      path: diff.file,
      kind:
        diff.status === "added"
          ? "add"
          : diff.status === "deleted"
            ? "delete"
            : "update"
    })),
    status: "completed"
  };

  return {
    events: [
      {
        type: "item.completed",
        item
      }
    ],
    losses:
      missingStatusFiles.length === 0
        ? []
        : [
            {
              kind: "missing_diff_status",
              files: missingStatusFiles
            }
          ]
  };
}

function projectToolPart(
  part: Extract<Part, { type: "tool" }>
): McpToolCallItem {
  const status =
    part.state.status === "completed"
      ? "completed"
      : part.state.status === "error"
        ? "failed"
        : "in_progress";

  return {
    id: part.id,
    type: "mcp_tool_call",
    server: "opencode",
    tool: part.tool,
    arguments: part.state.input,
    result:
      part.state.status === "completed"
        ? {
            content: [
              {
                type: "text",
                text: part.state.output
              }
            ],
            structured_content: part.state.metadata
          }
        : undefined,
    error:
      part.state.status === "error"
        ? {
            message: part.state.error
          }
        : undefined,
    status
  };
}

function projectUsage(info: AssistantMessage): Usage {
  return {
    input_tokens: info.tokens.input,
    cached_input_tokens: info.tokens.cache.read,
    output_tokens: info.tokens.output + info.tokens.reasoning
  };
}
