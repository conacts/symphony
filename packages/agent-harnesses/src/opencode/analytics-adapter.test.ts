import { describe, expect, it } from "vitest";
import {
  projectOpenCodeCommandExecutedEvent,
  projectOpenCodePromptResponse,
  projectOpenCodeSessionDiff,
  projectOpenCodeTodoListEvent,
  projectOpenCodeTodoUpdatedEvent
} from "./analytics-adapter.js";

describe("opencode analytics adapter", () => {
  it("projects assistant parts into codex-like thread events with explicit losses", () => {
    const projection = projectOpenCodePromptResponse({
      response: {
        info: {
          id: "msg-1",
          sessionID: "session-1",
          role: "assistant",
          time: {
            created: 1_000,
            completed: 2_000
          },
          parentID: "parent-1",
          modelID: "xiaomi/mimo-v2-pro",
          providerID: "openrouter",
          mode: "chat",
          agent: "build",
          path: {
            cwd: "/workspace",
            root: "/workspace"
          },
          cost: 0,
          tokens: {
            input: 120,
            output: 30,
            reasoning: 10,
            cache: {
              read: 15,
              write: 0
            }
          }
        },
        parts: [
          {
            id: "text-1",
            sessionID: "session-1",
            messageID: "msg-1",
            type: "text",
            text: "Finished the change."
          },
          {
            id: "reasoning-1",
            sessionID: "session-1",
            messageID: "msg-1",
            type: "reasoning",
            text: "Need to update the schema.",
            time: {
              start: 1_100,
              end: 1_200
            }
          },
          {
            id: "tool-1",
            sessionID: "session-1",
            messageID: "msg-1",
            type: "tool",
            callID: "call-1",
            tool: "bash",
            state: {
              status: "completed",
              input: {
                command: "pnpm test"
              },
              output: "ok",
              title: "pnpm test",
              metadata: {
                exitCode: 0
              },
              time: {
                start: 1_300,
                end: 1_600
              }
            }
          },
          {
            id: "patch-1",
            sessionID: "session-1",
            messageID: "msg-1",
            type: "patch",
            hash: "hash-1",
            files: ["apps/api/src/main.ts"]
          }
        ]
      }
    });

    expect(projection.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "item.completed",
          item: expect.objectContaining({
            id: "text-1",
            type: "agent_message"
          })
        }),
        expect.objectContaining({
          type: "item.completed",
          item: expect.objectContaining({
            id: "reasoning-1",
            type: "reasoning"
          })
        }),
        expect.objectContaining({
          type: "item.completed",
          item: expect.objectContaining({
            id: "tool-1",
            type: "mcp_tool_call",
            server: "opencode",
            tool: "bash",
            status: "completed"
          })
        }),
        expect.objectContaining({
          type: "item.completed",
          item: expect.objectContaining({
            id: "patch-1",
            type: "file_change",
            status: "completed"
          })
        }),
        {
          type: "turn.completed",
          usage: {
            input_tokens: 120,
            cached_input_tokens: 15,
            output_tokens: 40
          }
        }
      ])
    );
    expect(projection.losses).toEqual(
      expect.arrayContaining([
        {
          kind: "patch_change_kind_unknown",
          files: ["apps/api/src/main.ts"]
        },
        {
          kind: "reasoning_tokens_folded_into_output",
          messageId: "msg-1",
          reasoningTokens: 10
        }
      ])
    );
  });

  it("projects todo updates as codex-like todo list updates", () => {
    const projection = projectOpenCodeTodoUpdatedEvent({
      event: {
        type: "todo.updated",
        properties: {
          sessionID: "session-1",
          todos: [
            {
              content: "Ship the change",
              status: "in_progress",
              priority: "medium"
            }
          ]
        }
      }
    });

    expect(projection.events).toEqual([
      {
        type: "item.updated",
        item: {
          id: "opencode-todo:session-1",
          type: "todo_list",
          items: [
            {
              text: "Ship the change",
              completed: false
            }
          ]
        }
      }
    ]);
    expect(projection.losses).toEqual([]);
  });

  it("projects command executions while flagging missing output parity", () => {
    const projection = projectOpenCodeCommandExecutedEvent({
      event: {
        type: "command.executed",
        properties: {
          name: "rg",
          arguments: "--files",
          messageID: "msg-1",
          sessionID: "session-1"
        }
      }
    });

    expect(projection.events).toEqual([
      {
        type: "item.completed",
        item: {
          id: "opencode-command:msg-1:rg",
          type: "command_execution",
          command: "rg --files",
          aggregated_output: "",
          status: "completed"
        }
      }
    ]);
    expect(projection.losses).toEqual([
      {
        kind: "command_output_unavailable",
        command: "rg --files"
      }
    ]);
  });

  it("projects todo snapshots into codex-like todo list updates", () => {
    expect(
      projectOpenCodeTodoListEvent({
        sessionId: "session-1",
        todos: [
          {
            content: "Ship the change",
            status: "completed",
            priority: "medium"
          }
        ]
      })
    ).toEqual({
      type: "item.updated",
      item: {
        id: "opencode-todo:session-1",
        type: "todo_list",
        items: [
          {
            text: "Ship the change",
            completed: true
          }
        ]
      }
    });
  });

  it("projects session diffs into codex-like file changes", () => {
    const projection = projectOpenCodeSessionDiff({
      sessionId: "session-1",
      diffs: [
        {
          file: "apps/api/src/main.ts",
          before: "",
          after: "",
          additions: 10,
          deletions: 2,
          status: "modified"
        },
        {
          file: "README.md",
          before: "",
          after: "",
          additions: 1,
          deletions: 0
        }
      ]
    });

    expect(projection.events).toEqual([
      {
        type: "item.completed",
        item: {
          id: "opencode-diff:session-1",
          type: "file_change",
          changes: [
            {
              path: "apps/api/src/main.ts",
              kind: "update"
            },
            {
              path: "README.md",
              kind: "update"
            }
          ],
          status: "completed"
        }
      }
    ]);
    expect(projection.losses).toEqual([
      {
        kind: "missing_diff_status",
        files: ["README.md"]
      }
    ]);
  });

  it("records unsupported response parts instead of dropping them silently", () => {
    const projection = projectOpenCodePromptResponse({
      response: {
        info: {
          id: "msg-2",
          sessionID: "session-1",
          role: "assistant",
          time: {
            created: 1_000,
            completed: 2_000
          },
          parentID: "parent-2",
          modelID: "xiaomi/mimo-v2-pro",
          providerID: "openrouter",
          mode: "chat",
          agent: "build",
          path: {
            cwd: "/workspace",
            root: "/workspace"
          },
          cost: 0,
          tokens: {
            input: 10,
            output: 4,
            reasoning: 0,
            cache: {
              read: 0,
              write: 0
            }
          }
        },
        parts: [
          {
            id: "step-1",
            sessionID: "session-1",
            messageID: "msg-2",
            type: "step-start",
            snapshot: "snap-1"
          }
        ]
      }
    });

    expect(projection.events).toEqual([
      {
        type: "turn.completed",
        usage: {
          input_tokens: 10,
          cached_input_tokens: 0,
          output_tokens: 4
        }
      }
    ]);
    expect(projection.losses).toEqual(
      expect.arrayContaining([
        {
          kind: "unsupported_part",
          partId: "step-1",
          partType: "step-start"
        }
      ])
    );
  });
});
