import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PiRpcClient } from "@symphony/agent-harnesses";
import {
  buildSymphonyRuntimePolicy,
  buildSymphonyTrackerIssue
} from "@symphony/test-support";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn()
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
  spawn: spawnMock
}));

describe("PiRpcClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts a Pi RPC session and projects prompt events into canonical analytics", async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdin = new PassThrough();
    let buffer = "";

    stdin.on("data", (chunk: Buffer | string) => {
      buffer += chunk.toString();

      while (true) {
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex === -1) {
          break;
        }

        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        const message = JSON.parse(line) as Record<string, unknown>;

        if (message.type === "get_state") {
          stdout.write(
            `${JSON.stringify({
              id: message.id,
              type: "response",
              command: "get_state",
              success: true,
              data: {
                sessionId: "pi-session-1",
                model: {
                  id: "xiaomi/mimo-v2-pro",
                  provider: "openrouter"
                }
              }
            })}\n`
          );
          continue;
        }

        if (message.type === "prompt") {
          stdout.write(
            `${JSON.stringify({
              id: message.id,
              type: "response",
              command: "prompt",
              success: true
            })}\n`
          );
          stdout.write('{"type":"agent_start"}\n');
          stdout.write('{"type":"turn_start"}\n');
          stdout.write(
            `${JSON.stringify({
              type: "message_end",
              message: {
                role: "assistant",
                responseId: "resp-1",
                content: [
                  {
                    type: "thinking",
                    thinking: "Need to inspect the directory."
                  },
                  {
                    type: "toolCall",
                    id: "call-1",
                    name: "bash",
                    arguments: {
                      command: "ls"
                    }
                  }
                ]
              }
            })}\n`
          );
          stdout.write(
            `${JSON.stringify({
              type: "queue_update",
              steering: ["Keep the patch scoped"],
              followUp: ["Summarize the changes"]
            })}\n`
          );
          stdout.write(
            `${JSON.stringify({
              type: "tool_execution_start",
              toolCallId: "call-1",
              toolName: "bash",
              args: {
                command: "ls"
              }
            })}\n`
          );
          stdout.write(
            `${JSON.stringify({
              type: "tool_execution_end",
              toolCallId: "call-1",
              toolName: "bash",
              args: {
                command: "ls"
              },
              result: {
                content: [
                  {
                    type: "text",
                    text: "a\nb\n"
                  }
                ]
              },
              isError: false
            })}\n`
          );
          stdout.write(
            `${JSON.stringify({
              type: "tool_execution_end",
              toolCallId: "call-2",
              toolName: "edit",
              args: {
                path: "apps/api/src/main.ts",
                edits: [
                  {
                    oldText: "before",
                    newText: "after"
                  }
                ]
              },
              result: {
                content: [
                  {
                    type: "text",
                    text: "Successfully replaced 1 block(s) in apps/api/src/main.ts."
                  }
                ],
                details: {
                  diff: "@@"
                }
              },
              isError: false
            })}\n`
          );
          stdout.write(
            `${JSON.stringify({
              type: "turn_end",
              message: {
                usage: {
                  input: 10,
                  output: 4,
                  cacheRead: 2
                }
              }
            })}\n`
          );
          stdout.write('{"type":"turn_start"}\n');
          stdout.write(
            `${JSON.stringify({
              type: "message_end",
              message: {
                role: "assistant",
                responseId: "resp-2",
                content: [
                  {
                    type: "thinking",
                    thinking: "There are two files."
                  },
                  {
                    type: "text",
                    text: "2"
                  }
                ],
                usage: {
                  input: 15,
                  output: 6,
                  cacheRead: 2
                }
              }
            })}\n`
          );
          stdout.write(
            `${JSON.stringify({
              type: "turn_end",
              message: {
                usage: {
                  input: 15,
                  output: 6,
                  cacheRead: 2
                }
              }
            })}\n`
          );
          stdout.write('{"type":"agent_end"}\n');
        }
      }
    });

    const child = Object.assign(new EventEmitter(), {
      stdout,
      stderr,
      stdin,
      pid: 9876,
      kill: vi.fn(),
      exitCode: null
    });
    spawnMock.mockReturnValue(child);

    const runtimePolicy = buildSymphonyRuntimePolicy({
      agent: {
        ...buildSymphonyRuntimePolicy().agent,
        harness: "pi"
      },
      workspace: {
        ...buildSymphonyRuntimePolicy().workspace,
        root: "/tmp/symphony-pi-test"
      },
      pi: {
        ...buildSymphonyRuntimePolicy().pi,
        defaultModel: "xiaomi/mimo-v2-pro",
        defaultReasoningEffort: "medium",
        provider: {
          id: "openrouter",
          name: "OpenRouter",
          baseUrl: "https://openrouter.ai/api/v1",
          envKey: "OPENROUTER_API_KEY",
          supportsWebsockets: false,
          wireApi: "responses"
        }
      }
    });
    const issue = buildSymphonyTrackerIssue();

    const session = await PiRpcClient.startSession({
      launchTarget: {
        kind: "container",
        hostLaunchPath: "/tmp/symphony-pi-test/workspace",
        hostWorkspacePath: "/tmp/symphony-pi-test/workspace",
        runtimeWorkspacePath: "/workspace",
        containerId: "container-1",
        containerName: "symphony-workspace",
        shell: "/bin/bash",
        user: "1000:1000"
      },
      env: {
        OPENROUTER_API_KEY: "test-key"
      },
      hostCommandEnvSource: {
        PATH: process.env.PATH
      },
      runtimePolicy,
      issue,
      logger: {
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      }
    });

    const updates: Array<{
      message: Record<string, unknown>;
      rawPayload?: unknown;
      projectionLosses?: unknown[] | null;
    }> = [];
    const result = await session.client.runTurn(session, {
      prompt: "Count files",
      title: "Count files",
      sandboxPolicy: null,
      toolExecutor: vi.fn(),
      onMessage(
        update: {
          message: Record<string, unknown>;
          rawPayload?: unknown;
          projectionLosses?: unknown[] | null;
        }
      ) {
        updates.push(update);
      },
      turnTimeoutMs: 1_000
    });

    expect(session.threadId).toBe("pi-session-1");
    expect(session.providerId).toBe("openrouter");
    expect(spawnMock).toHaveBeenCalledWith(
      "docker",
      expect.arrayContaining([
        "exec",
        "-i",
        "--env",
        "OPENROUTER_API_KEY=test-key",
        "--env",
        "PI_CODING_AGENT_DIR=/tmp/symphony-pi-agent",
        "--workdir",
        "/workspace",
        "symphony-workspace",
        "/bin/bash",
        "-lc"
      ]),
      expect.any(Object)
    );
    const spawnArgs = spawnMock.mock.calls[0]?.[1] as string[];
    expect(spawnArgs.at(-1)).toContain("mkdir -p '/tmp/symphony-pi-agent'");
    expect(spawnArgs.at(-1)).toContain(
      "cp '/home/agent/.pi/agent/auth.json' '/tmp/symphony-pi-agent/auth.json'"
    );
    expect(spawnArgs.at(-1)).toContain("exec pi --mode rpc");
    expect(result).toEqual({
      threadId: "pi-session-1",
      turnId: "pi-turn-1",
      usage: {
        input_tokens: 25,
        cached_input_tokens: 4,
        output_tokens: 10
      }
    });
    expect(updates.map((update) => update.message)).toEqual(
      expect.arrayContaining([
        {
          type: "thread.started",
          thread_id: "pi-session-1"
        },
        expect.objectContaining({
          type: "item.started",
          item: expect.objectContaining({
            id: "call-1",
            type: "command_execution",
            command: "ls"
          })
        }),
        expect.objectContaining({
          type: "item.completed",
          item: expect.objectContaining({
            id: "call-1",
            type: "command_execution",
            aggregated_output: "a\nb\n"
          })
        }),
        expect.objectContaining({
          type: "item.updated",
          item: {
            id: "pi-todo-queue",
            type: "todo_list",
            items: [
              {
                text: "[Steering] Keep the patch scoped",
                completed: false
              },
              {
                text: "[Follow-up] Summarize the changes",
                completed: false
              }
            ]
          }
        }),
        expect.objectContaining({
          type: "item.completed",
          item: {
            id: "pi-file-change:call-2",
            type: "file_change",
            changes: [
              {
                path: "apps/api/src/main.ts",
                kind: "update"
              }
            ],
            status: "completed"
          }
        }),
        expect.objectContaining({
          type: "item.completed",
          item: expect.objectContaining({
            type: "reasoning",
            text: "There are two files."
          })
        }),
        expect.objectContaining({
          type: "item.completed",
          item: expect.objectContaining({
            type: "agent_message",
            text: "2"
          })
        })
      ])
    );
    expect(
      updates.some((update) => update.message.type === "turn.started")
    ).toBe(false);
    expect(
      updates.some((update) => update.message.type === "turn.completed")
    ).toBe(false);
  });

  it("finishes a turn after turn_end when Pi goes idle without emitting agent_end", async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdin = new PassThrough();
    let buffer = "";
    let getStateCount = 0;

    stdin.on("data", (chunk: Buffer | string) => {
      buffer += chunk.toString();

      while (true) {
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex === -1) {
          break;
        }

        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        const message = JSON.parse(line) as Record<string, unknown>;

        if (message.type === "get_state") {
          getStateCount += 1;
          stdout.write(
            `${JSON.stringify({
              id: message.id,
              type: "response",
              command: "get_state",
              success: true,
              data:
                getStateCount === 1
                  ? {
                      sessionId: "pi-session-1",
                      model: {
                        id: "xiaomi/mimo-v2-pro",
                        provider: "openrouter"
                      }
                    }
                  : {
                      sessionId: "pi-session-1",
                      isStreaming: false,
                      pendingMessageCount: 0,
                      messageCount: 1
                    }
            })}\n`
          );
          continue;
        }

        if (message.type === "prompt") {
          stdout.write(
            `${JSON.stringify({
              id: message.id,
              type: "response",
              command: "prompt",
              success: true
            })}\n`
          );
          stdout.write('{"type":"agent_start"}\n');
          stdout.write('{"type":"turn_start"}\n');
          stdout.write(
            `${JSON.stringify({
              type: "message_end",
              message: {
                role: "assistant",
                responseId: "resp-idle",
                content: [
                  {
                    type: "text",
                    text: "Implemented the requested change."
                  }
                ]
              }
            })}\n`
          );
          stdout.write(
            `${JSON.stringify({
              type: "turn_end",
              message: {
                usage: {
                  input: 8,
                  output: 3,
                  cacheRead: 1
                }
              }
            })}\n`
          );
        }
      }
    });

    const child = Object.assign(new EventEmitter(), {
      stdout,
      stderr,
      stdin,
      pid: 9878,
      kill: vi.fn(),
      exitCode: null
    });
    spawnMock.mockReturnValue(child);

    const runtimePolicy = buildSymphonyRuntimePolicy({
      agent: {
        ...buildSymphonyRuntimePolicy().agent,
        harness: "pi"
      },
      workspace: {
        ...buildSymphonyRuntimePolicy().workspace,
        root: "/tmp/symphony-pi-test"
      },
      pi: {
        ...buildSymphonyRuntimePolicy().pi,
        defaultModel: "xiaomi/mimo-v2-pro",
        defaultReasoningEffort: "medium",
        provider: {
          id: "openrouter",
          name: "OpenRouter",
          baseUrl: "https://openrouter.ai/api/v1",
          envKey: "OPENROUTER_API_KEY",
          supportsWebsockets: false,
          wireApi: "responses"
        }
      }
    });
    const session = await PiRpcClient.startSession({
      launchTarget: {
        kind: "container",
        hostLaunchPath: "/tmp/symphony-pi-test/workspace",
        hostWorkspacePath: "/tmp/symphony-pi-test/workspace",
        runtimeWorkspacePath: "/workspace",
        containerId: "container-1",
        containerName: "symphony-workspace",
        shell: "/bin/bash",
        user: "1000:1000"
      },
      env: {
        OPENROUTER_API_KEY: "test-key"
      },
      hostCommandEnvSource: {
        PATH: process.env.PATH
      },
      runtimePolicy,
      issue: buildSymphonyTrackerIssue(),
      logger: {
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      }
    });

    const result = await session.client.runTurn(session, {
      prompt: "Implement the change",
      title: "Implement the change",
      sandboxPolicy: null,
      toolExecutor: vi.fn(),
      onMessage: vi.fn(),
      turnTimeoutMs: 1_000
    });

    expect(result).toEqual({
      threadId: "pi-session-1",
      turnId: "pi-turn-1",
      usage: {
        input_tokens: 8,
        cached_input_tokens: 1,
        output_tokens: 3
      }
    });
    expect(getStateCount).toBe(2);
  });

  it("preserves shell command executions in runtime turn events", async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdin = new PassThrough();
    const shellCommand = "pnpm exec tsc --noEmit";
    let buffer = "";

    stdin.on("data", (chunk: Buffer | string) => {
      buffer += chunk.toString();

      while (true) {
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex === -1) {
          break;
        }

        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        const message = JSON.parse(line) as Record<string, unknown>;

        if (message.type === "get_state") {
          stdout.write(
            `${JSON.stringify({
              id: message.id,
              type: "response",
              command: "get_state",
              success: true,
              data: {
                sessionId: "pi-session-1",
                model: {
                  id: "xiaomi/mimo-v2-pro",
                  provider: "openrouter"
                }
              }
            })}\n`
          );
          continue;
        }

        if (message.type === "prompt") {
          stdout.write(
            `${JSON.stringify({
              id: message.id,
              type: "response",
              command: "prompt",
              success: true
            })}\n`
          );
          stdout.write('{"type":"agent_start"}\n');
          stdout.write('{"type":"turn_start"}\n');
          stdout.write(
            `${JSON.stringify({
              type: "tool_execution_start",
              toolCallId: "call-shell",
              toolName: "bash",
              args: {
                command: shellCommand
              }
            })}\n`
          );
          stdout.write(
            `${JSON.stringify({
              type: "tool_execution_end",
              toolCallId: "call-shell",
              toolName: "bash",
              args: {
                command: shellCommand
              },
              result: {
                content: [
                  {
                    type: "text",
                    text: '{"recorded":true}\n'
                  }
                ]
              },
              isError: false
            })}\n`
          );
          stdout.write(
            `${JSON.stringify({
              type: "turn_end",
              message: {
                usage: {
                  input: 5,
                  output: 2,
                  cacheRead: 0
                }
              }
            })}\n`
          );
          stdout.write('{"type":"agent_end"}\n');
        }
      }
    });

    const child = Object.assign(new EventEmitter(), {
      stdout,
      stderr,
      stdin,
      pid: 9877,
      kill: vi.fn(),
      exitCode: null
    });
    spawnMock.mockReturnValue(child);

    const runtimePolicy = buildSymphonyRuntimePolicy({
      agent: {
        ...buildSymphonyRuntimePolicy().agent,
        harness: "pi"
      },
      workspace: {
        ...buildSymphonyRuntimePolicy().workspace,
        root: "/tmp/symphony-pi-test"
      },
      pi: {
        ...buildSymphonyRuntimePolicy().pi,
        defaultModel: "xiaomi/mimo-v2-pro",
        defaultReasoningEffort: "medium",
        provider: {
          id: "openrouter",
          name: "OpenRouter",
          baseUrl: "https://openrouter.ai/api/v1",
          envKey: "OPENROUTER_API_KEY",
          supportsWebsockets: false,
          wireApi: "responses"
        }
      }
    });
    const issue = buildSymphonyTrackerIssue();

    const session = await PiRpcClient.startSession({
      launchTarget: {
        kind: "container",
        hostLaunchPath: "/tmp/symphony-pi-test/workspace",
        hostWorkspacePath: "/tmp/symphony-pi-test/workspace",
        runtimeWorkspacePath: "/workspace",
        containerId: "container-1",
        containerName: "symphony-workspace",
        shell: "/bin/bash",
        user: "1000:1000"
      },
      env: {
        OPENROUTER_API_KEY: "test-key"
      },
      hostCommandEnvSource: {
        PATH: process.env.PATH
      },
      runtimePolicy,
      issue,
      logger: {
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      }
    });

    const updates: Array<{ message: Record<string, unknown> }> = [];
    await session.client.runTurn(session, {
      prompt: "Record delivery",
      title: "Record delivery",
      sandboxPolicy: null,
      toolExecutor: vi.fn(),
      onMessage(update: { message: Record<string, unknown> }) {
        updates.push(update);
      },
      turnTimeoutMs: 1_000
    });

    expect(updates.map((update) => update.message)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "item.started",
          item: expect.objectContaining({
            type: "command_execution",
            command: shellCommand
          })
        }),
        expect.objectContaining({
          type: "item.completed",
          item: expect.objectContaining({
            type: "command_execution",
            command: shellCommand,
            status: "completed"
          })
        })
      ])
    );
  });

  it("uses follow_up for continuation turns in the same Pi session", async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdin = new PassThrough();
    let buffer = "";
    const commandTypes: string[] = [];

    stdin.on("data", (chunk: Buffer | string) => {
      buffer += chunk.toString();

      while (true) {
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex === -1) {
          break;
        }

        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        const message = JSON.parse(line) as Record<string, unknown>;
        const commandType =
          typeof message.type === "string" ? message.type : "unknown";
        commandTypes.push(commandType);

        if (commandType === "get_state") {
          const getStateCount =
            commandTypes.filter((value) => value === "get_state").length;
          stdout.write(
            `${JSON.stringify({
              id: message.id,
              type: "response",
              command: "get_state",
              success: true,
              data: {
                sessionId: "pi-session-2",
                model: {
                  id: "xiaomi/mimo-v2-pro",
                  provider: "openrouter"
                },
                isStreaming: getStateCount > 1,
                pendingMessageCount: 0
              }
            })}\n`
          );
          continue;
        }

        if (commandType === "prompt" || commandType === "follow_up") {
          stdout.write(
            `${JSON.stringify({
              id: message.id,
              type: "response",
              command: commandType,
              success: true
            })}\n`
          );
          stdout.write(
            `${JSON.stringify({
              type: "message_end",
              message: {
                responseId: `${commandType}-resp`,
                role: "assistant",
                content: [
                  {
                    type: "text",
                    text: commandType === "prompt" ? "first" : "second"
                  }
                ],
                usage: {
                  input: 1,
                  output: 1,
                  cacheRead: 0
                }
              }
            })}\n`
          );
          stdout.write('{"type":"agent_end"}\n');
        }
      }
    });

    const child = Object.assign(new EventEmitter(), {
      stdout,
      stderr,
      stdin,
      pid: 4321,
      kill: vi.fn(),
      exitCode: null
    });
    spawnMock.mockReturnValue(child);

    const runtimePolicy = buildSymphonyRuntimePolicy({
      agent: {
        ...buildSymphonyRuntimePolicy().agent,
        harness: "pi"
      },
      workspace: {
        ...buildSymphonyRuntimePolicy().workspace,
        root: "/tmp/symphony-pi-test"
      },
      pi: {
        ...buildSymphonyRuntimePolicy().pi,
        defaultModel: "xiaomi/mimo-v2-pro",
        defaultReasoningEffort: "medium",
        provider: {
          id: "openrouter",
          name: "OpenRouter",
          baseUrl: "https://openrouter.ai/api/v1",
          envKey: "OPENROUTER_API_KEY",
          supportsWebsockets: false,
          wireApi: "responses"
        }
      }
    });
    const issue = buildSymphonyTrackerIssue();
    const session = await PiRpcClient.startSession({
      launchTarget: {
        kind: "container",
        hostLaunchPath: "/tmp/symphony-pi-test/workspace",
        hostWorkspacePath: "/tmp/symphony-pi-test/workspace",
        runtimeWorkspacePath: "/workspace",
        containerId: "container-2",
        containerName: "symphony-workspace",
        shell: "/bin/bash",
        user: "1000:1000"
      },
      env: {
        OPENROUTER_API_KEY: "test-key"
      },
      hostCommandEnvSource: {
        PATH: process.env.PATH
      },
      runtimePolicy,
      issue,
      logger: {
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      }
    });

    await session.client.runTurn(session, {
      prompt: "first turn",
      title: "first",
      sandboxPolicy: null,
      toolExecutor: vi.fn(),
      onMessage: vi.fn(),
      turnTimeoutMs: 1_000
    });

    await session.client.runTurn(session, {
      prompt: "second turn",
      title: "second",
      sandboxPolicy: null,
      toolExecutor: vi.fn(),
      onMessage: vi.fn(),
      turnTimeoutMs: 1_000
    });

    expect(commandTypes.filter((value) => value === "prompt")).toHaveLength(1);
    expect(commandTypes.filter((value) => value === "follow_up")).toHaveLength(1);
  });

  it("uses prompt again for continuation turns when Pi is idle", async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdin = new PassThrough();
    let buffer = "";
    const commandTypes: string[] = [];

    stdin.on("data", (chunk: Buffer | string) => {
      buffer += chunk.toString();

      while (true) {
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex === -1) {
          break;
        }

        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        const message = JSON.parse(line) as Record<string, unknown>;
        const commandType =
          typeof message.type === "string" ? message.type : "unknown";
        commandTypes.push(commandType);

        if (commandType === "get_state") {
          stdout.write(
            `${JSON.stringify({
              id: message.id,
              type: "response",
              command: "get_state",
              success: true,
              data: {
                sessionId: "pi-session-3",
                model: {
                  id: "xiaomi/mimo-v2-pro",
                  provider: "openrouter"
                },
                isStreaming: false,
                pendingMessageCount: 0
              }
            })}\n`
          );
          continue;
        }

        if (commandType === "prompt") {
          stdout.write(
            `${JSON.stringify({
              id: message.id,
              type: "response",
              command: "prompt",
              success: true
            })}\n`
          );
          stdout.write(
            `${JSON.stringify({
              type: "message_end",
              message: {
                responseId: `${commandType}-resp`,
                role: "assistant",
                content: [
                  {
                    type: "text",
                    text: "ok"
                  }
                ],
                usage: {
                  input: 1,
                  output: 1,
                  cacheRead: 0
                }
              }
            })}\n`
          );
          stdout.write('{"type":"agent_end"}\n');
        }
      }
    });

    const child = Object.assign(new EventEmitter(), {
      stdout,
      stderr,
      stdin,
      pid: 5432,
      kill: vi.fn(),
      exitCode: null
    });
    spawnMock.mockReturnValue(child);

    const runtimePolicy = buildSymphonyRuntimePolicy({
      agent: {
        ...buildSymphonyRuntimePolicy().agent,
        harness: "pi"
      },
      workspace: {
        ...buildSymphonyRuntimePolicy().workspace,
        root: "/tmp/symphony-pi-test"
      },
      pi: {
        ...buildSymphonyRuntimePolicy().pi,
        defaultModel: "xiaomi/mimo-v2-pro",
        defaultReasoningEffort: "medium",
        provider: {
          id: "openrouter",
          name: "OpenRouter",
          baseUrl: "https://openrouter.ai/api/v1",
          envKey: "OPENROUTER_API_KEY",
          supportsWebsockets: false,
          wireApi: "responses"
        }
      }
    });
    const issue = buildSymphonyTrackerIssue();
    const session = await PiRpcClient.startSession({
      launchTarget: {
        kind: "container",
        hostLaunchPath: "/tmp/symphony-pi-test/workspace",
        hostWorkspacePath: "/tmp/symphony-pi-test/workspace",
        runtimeWorkspacePath: "/workspace",
        containerId: "container-3",
        containerName: "symphony-workspace",
        shell: "/bin/bash",
        user: "1000:1000"
      },
      env: {
        OPENROUTER_API_KEY: "test-key"
      },
      hostCommandEnvSource: {
        PATH: process.env.PATH
      },
      runtimePolicy,
      issue,
      logger: {
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      }
    });

    await session.client.runTurn(session, {
      prompt: "first turn",
      title: "first",
      sandboxPolicy: null,
      toolExecutor: vi.fn(),
      onMessage: vi.fn(),
      turnTimeoutMs: 1_000
    });

    await session.client.runTurn(session, {
      prompt: "second turn",
      title: "second",
      sandboxPolicy: null,
      toolExecutor: vi.fn(),
      onMessage: vi.fn(),
      turnTimeoutMs: 1_000
    });

    expect(commandTypes.filter((value) => value === "follow_up")).toHaveLength(0);
    expect(commandTypes.filter((value) => value === "prompt")).toHaveLength(2);
  });

  it("fails a turn that ends with only queue updates and no measurable work", async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdin = new PassThrough();
    let buffer = "";

    stdin.on("data", (chunk: Buffer | string) => {
      buffer += chunk.toString();

      while (true) {
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex === -1) {
          break;
        }

        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        const message = JSON.parse(line) as Record<string, unknown>;
        const commandType =
          typeof message.type === "string" ? message.type : "unknown";

        if (commandType === "get_state") {
          stdout.write(
            `${JSON.stringify({
              id: message.id,
              type: "response",
              command: "get_state",
              success: true,
              data: {
                sessionId: "pi-session-4",
                model: {
                  id: "xiaomi/mimo-v2-pro",
                  provider: "openrouter"
                },
                isStreaming: false,
                pendingMessageCount: 0
              }
            })}\n`
          );
          continue;
        }

        if (commandType === "prompt") {
          stdout.write(
            `${JSON.stringify({
              id: message.id,
              type: "response",
              command: "prompt",
              success: true
            })}\n`
          );
          stdout.write(
            `${JSON.stringify({
              type: "queue_update",
              steering: [],
              followUp: ["continue"]
            })}\n`
          );
          stdout.write('{"type":"agent_end"}\n');
        }
      }
    });

    const child = Object.assign(new EventEmitter(), {
      stdout,
      stderr,
      stdin,
      pid: 6543,
      kill: vi.fn(),
      exitCode: null
    });
    spawnMock.mockReturnValue(child);

    const runtimePolicy = buildSymphonyRuntimePolicy({
      agent: {
        ...buildSymphonyRuntimePolicy().agent,
        harness: "pi"
      },
      workspace: {
        ...buildSymphonyRuntimePolicy().workspace,
        root: "/tmp/symphony-pi-test"
      },
      pi: {
        ...buildSymphonyRuntimePolicy().pi,
        defaultModel: "xiaomi/mimo-v2-pro",
        defaultReasoningEffort: "medium",
        provider: {
          id: "openrouter",
          name: "OpenRouter",
          baseUrl: "https://openrouter.ai/api/v1",
          envKey: "OPENROUTER_API_KEY",
          supportsWebsockets: false,
          wireApi: "responses"
        }
      }
    });
    const issue = buildSymphonyTrackerIssue();
    const logger = {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    const session = await PiRpcClient.startSession({
      launchTarget: {
        kind: "container",
        hostLaunchPath: "/tmp/symphony-pi-test/workspace",
        hostWorkspacePath: "/tmp/symphony-pi-test/workspace",
        runtimeWorkspacePath: "/workspace",
        containerId: "container-4",
        containerName: "symphony-workspace",
        shell: "/bin/bash",
        user: "1000:1000"
      },
      env: {
        OPENROUTER_API_KEY: "test-key"
      },
      hostCommandEnvSource: {
        PATH: process.env.PATH
      },
      runtimePolicy,
      issue,
      logger
    });

    await expect(
      session.client.runTurn(session, {
        prompt: "continue",
        title: "continue",
        sandboxPolicy: null,
        toolExecutor: vi.fn(),
        onMessage: vi.fn(),
        turnTimeoutMs: 1_000
      })
    ).rejects.toMatchObject({
      code: "pi_queue_only_turn",
      detail: expect.objectContaining({
        command: expect.objectContaining({
          type: "prompt",
          message: "continue",
          messageLength: 8
        }),
        failureEvent: expect.objectContaining({
          type: "agent_end"
        }),
        eventTrace: expect.arrayContaining([
          expect.objectContaining({
            type: "queue_update",
            queueCounts: expect.objectContaining({
              followUp: 1
            })
          })
        ])
      })
    });
    expect(logger.debug).toHaveBeenCalledWith(
      "Received Pi raw event",
      expect.objectContaining({
        event: expect.objectContaining({
          type: "queue_update"
        })
      })
    );
  });

  it("fails a turn that ends with no usage and no projected work", async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdin = new PassThrough();
    let buffer = "";

    stdin.on("data", (chunk: Buffer | string) => {
      buffer += chunk.toString();

      while (true) {
        const newlineIndex = buffer.indexOf("\n");
        if (newlineIndex === -1) {
          break;
        }

        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        const message = JSON.parse(line) as Record<string, unknown>;
        const commandType =
          typeof message.type === "string" ? message.type : "unknown";

        if (commandType === "get_state") {
          stdout.write(
            `${JSON.stringify({
              id: message.id,
              type: "response",
              command: "get_state",
              success: true,
              data: {
                sessionId: "pi-session-5",
                model: {
                  id: "xiaomi/mimo-v2-pro",
                  provider: "openrouter"
                },
                isStreaming: false,
                pendingMessageCount: 0
              }
            })}\n`
          );
          continue;
        }

        if (commandType === "prompt") {
          stdout.write(
            `${JSON.stringify({
              id: message.id,
              type: "response",
              command: "prompt",
              success: true
            })}\n`
          );
          stderr.write("Error: 402 Provider returned error\n");
          stderr.write('{"error":{"code":"402","message":"Insufficient account balance","type":"insufficient_balance"}}\n');
          stderr.write("Retrying (1/3) in 2s...\n");
          stdout.write('{"type":"agent_end"}\n');
        }
      }
    });

    const child = Object.assign(new EventEmitter(), {
      stdout,
      stderr,
      stdin,
      pid: 7654,
      kill: vi.fn(),
      exitCode: null
    });
    spawnMock.mockReturnValue(child);

    const runtimePolicy = buildSymphonyRuntimePolicy({
      agent: {
        ...buildSymphonyRuntimePolicy().agent,
        harness: "pi"
      },
      workspace: {
        ...buildSymphonyRuntimePolicy().workspace,
        root: "/tmp/symphony-pi-test"
      },
      pi: {
        ...buildSymphonyRuntimePolicy().pi,
        defaultModel: "xiaomi/mimo-v2-pro",
        defaultReasoningEffort: "medium",
        provider: {
          id: "openrouter",
          name: "OpenRouter",
          baseUrl: "https://openrouter.ai/api/v1",
          envKey: "OPENROUTER_API_KEY",
          supportsWebsockets: false,
          wireApi: "responses"
        }
      }
    });
    const issue = buildSymphonyTrackerIssue();

    const logger = {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    const session = await PiRpcClient.startSession({
      launchTarget: {
        kind: "container",
        hostLaunchPath: "/tmp/symphony-pi-test/workspace",
        hostWorkspacePath: "/tmp/symphony-pi-test/workspace",
        runtimeWorkspacePath: "/workspace",
        containerId: "container-5",
        containerName: "symphony-workspace",
        shell: "/bin/bash",
        user: "1000:1000"
      },
      env: {
        OPENROUTER_API_KEY: "test-key"
      },
      hostCommandEnvSource: {
        PATH: process.env.PATH
      },
      runtimePolicy,
      issue,
      logger
    });

    await expect(
      session.client.runTurn(session, {
        prompt: "continue",
        title: "continue",
        sandboxPolicy: null,
        toolExecutor: vi.fn(),
        onMessage: vi.fn(),
        turnTimeoutMs: 1_000
      })
    ).rejects.toMatchObject({
      code: "pi_no_progress_turn",
      detail: expect.objectContaining({
        command: expect.objectContaining({
          type: "prompt",
          message: "continue"
        }),
        failureEvent: expect.objectContaining({
          type: "agent_end"
        }),
        processDiagnostics: expect.objectContaining({
          recentStderrLines: expect.arrayContaining([
            expect.stringContaining("Provider returned error"),
            expect.stringContaining("Insufficient account balance")
          ])
        }),
        eventTrace: expect.arrayContaining([
          expect.objectContaining({
            type: "agent_end"
          })
        ])
      })
    });
    expect(logger.debug).toHaveBeenCalledWith(
      "Dispatching Pi turn",
      expect.objectContaining({
        command: expect.objectContaining({
          type: "prompt",
          message: "continue"
        })
      })
    );
  });
});
