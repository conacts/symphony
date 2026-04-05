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
        runtimeWorkspacePath: "/home/agent/workspace",
        containerId: "container-1",
        containerName: "symphony-workspace",
        shell: "/bin/bash"
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
    expect(result).toEqual({
      sessionId: "pi-session-1",
      threadId: "pi-session-1",
      turnId: "pi-turn-1"
    });
    expect(updates.map((update) => update.message)).toEqual(
      expect.arrayContaining([
        {
          type: "thread.started",
          thread_id: "pi-session-1"
        },
        {
          type: "turn.started"
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
        }),
        {
          type: "turn.completed",
          usage: {
            input_tokens: 15,
            cached_input_tokens: 2,
            output_tokens: 6
          }
        }
      ])
    );
  });
});
