import { describe, expect, it } from "vitest";
import {
  projectPiMessageEndEvent,
  projectPiToolExecutionEndEvent,
  projectPiToolExecutionStartEvent,
  projectPiTurnEndEvent
} from "./analytics-adapter.js";

describe("pi analytics adapter", () => {
  it("projects assistant messages into reasoning and agent message items", () => {
    const projection = projectPiMessageEndEvent({
      event: {
        type: "message_end",
        message: {
          role: "assistant",
          responseId: "resp-1",
          content: [
            {
              type: "thinking",
              thinking: "Need to inspect the repo."
            },
            {
              type: "text",
              text: "Implemented the change."
            }
          ]
        }
      }
    });

    expect(projection.losses).toEqual([]);
    expect(projection.events).toEqual([
      {
        type: "item.completed",
        item: {
          id: "resp-1:reasoning:0",
          type: "reasoning",
          text: "Need to inspect the repo."
        }
      },
      {
        type: "item.completed",
        item: {
          id: "resp-1:text:1",
          type: "agent_message",
          text: "Implemented the change."
        }
      }
    ]);
  });

  it("projects bash tool execution into command events", () => {
    const started = projectPiToolExecutionStartEvent({
      event: {
        type: "tool_execution_start",
        toolCallId: "call-1",
        toolName: "bash",
        args: {
          command: "pnpm test"
        }
      }
    });

    const completed = projectPiToolExecutionEndEvent({
      event: {
        type: "tool_execution_end",
        toolCallId: "call-1",
        toolName: "bash",
        args: {
          command: "pnpm test"
        },
        result: {
          content: [
            {
              type: "text",
              text: "all tests passed"
            }
          ]
        },
        isError: false
      }
    });

    expect(started.events).toEqual([
      {
        type: "item.started",
        item: {
          id: "call-1",
          type: "command_execution",
          command: "pnpm test",
          aggregated_output: "",
          status: "in_progress"
        }
      }
    ]);
    expect(completed.events).toEqual([
      {
        type: "item.completed",
        item: {
          id: "call-1",
          type: "command_execution",
          command: "pnpm test",
          aggregated_output: "all tests passed",
          status: "completed"
        }
      }
    ]);
    expect(completed.losses).toEqual([
      {
        kind: "command_exit_code_unavailable",
        toolCallId: "call-1",
        command: "pnpm test"
      }
    ]);
  });

  it("projects turn end usage", () => {
    const projection = projectPiTurnEndEvent({
      event: {
        type: "turn_end",
        message: {
          usage: {
            input: 12,
            output: 8,
            cacheRead: 3
          }
        }
      }
    });

    expect(projection).toEqual({
      events: [
        {
          type: "turn.completed",
          usage: {
            input_tokens: 12,
            cached_input_tokens: 3,
            output_tokens: 8
          }
        }
      ],
      losses: []
    });
  });
});
