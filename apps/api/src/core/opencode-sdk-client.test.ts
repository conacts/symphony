import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenCodeSdkClient } from "@symphony/agent-harnesses";
import {
  buildSymphonyRuntimePolicy,
  buildSymphonyTrackerIssue
} from "@symphony/test-support";

const {
  execFileMock,
  spawnMock,
  createOpencodeClientMock
} = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  spawnMock: vi.fn(),
  createOpencodeClientMock: vi.fn()
}));

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
  spawn: spawnMock
}));

vi.mock("@opencode-ai/sdk/v2", () => ({
  createOpencodeClient: createOpencodeClientMock
}));

describe("OpenCodeSdkClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true
      })
    );
  });

  it("starts an opencode session and projects prompt results into codex-like events", async () => {
    execFileMock.mockImplementation(
      (
        _file: string,
        _args: string[],
        callback: (error: Error | null, stdout: string, stderr: string) => void
      ) => {
        callback(null, "172.17.0.2\n", "");
      }
    );

    const stdout = new PassThrough();
    const stderr = new PassThrough();
    spawnMock.mockReturnValue({
      stdout,
      stderr,
      pid: 4321,
      kill: vi.fn(),
      exitCode: null
    });

    const sdkClient = {
      session: {
        create: vi.fn().mockResolvedValue({
          id: "session-1"
        }),
        prompt: vi.fn().mockResolvedValue({
          info: {
            id: "assistant-1",
            sessionID: "session-1",
            role: "assistant",
            time: {
              created: 1_000,
              completed: 2_000
            },
            parentID: "user-1",
            modelID: "xiaomi/mimo-v2-pro",
            providerID: "openrouter",
            mode: "build",
            agent: "build",
            path: {
              cwd: "/home/agent/workspace",
              root: "/home/agent/workspace"
            },
            cost: 0,
            tokens: {
              input: 12,
              output: 8,
              reasoning: 2,
              cache: {
                read: 1,
                write: 0
              }
            }
          },
          parts: [
            {
              id: "text-1",
              sessionID: "session-1",
              messageID: "assistant-1",
              type: "text",
              text: "Implemented the change."
            }
          ]
        }),
        todo: vi.fn().mockResolvedValue([
          {
            content: "Ship the change",
            status: "in_progress",
            priority: "medium"
          }
        ]),
        diff: vi.fn().mockResolvedValue([
          {
            file: "apps/api/src/main.ts",
            before: "",
            after: "",
            additions: 3,
            deletions: 1,
            status: "modified"
          }
        ]),
        abort: vi.fn().mockResolvedValue(true)
      }
    };
    createOpencodeClientMock.mockReturnValue(sdkClient);

    const runtimePolicy = buildSymphonyRuntimePolicy({
      codex: {
        ...buildSymphonyRuntimePolicy().codex,
        defaultModel: "xiaomi/mimo-v2-pro",
        defaultReasoningEffort: "high",
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
    const session = await OpenCodeSdkClient.startSession({
      launchTarget: {
        kind: "container",
        hostLaunchPath: "/tmp/launch",
        hostWorkspacePath: "/tmp/workspace",
        runtimeWorkspacePath: "/home/agent/workspace",
        containerId: "container-1",
        containerName: "symphony-workspace",
        shell: "/bin/bash"
      },
      env: {
        OPENROUTER_API_KEY: "test-key"
      },
      runtimePolicy,
      issue,
      logger: {
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      }
    });

    const events: Array<{
      message: Record<string, unknown>;
      rawPayload?: unknown;
      projectionLosses?: unknown[] | null;
    }> = [];
    const turn = await session.client.runTurn(session, {
      prompt: "Implement the fix",
      title: "Fix",
      sandboxPolicy: null,
      toolExecutor: vi.fn(),
      onMessage(update) {
        events.push(update);
      },
      turnTimeoutMs: 1_000
    });

    expect(session.threadId).toBe("session-1");
    expect(turn).toEqual({
      sessionId: "session-1",
      threadId: "session-1",
      turnId: "opencode-turn-1"
    });
    expect(events.map((event) => event.message)).toEqual(
      expect.arrayContaining([
        {
          type: "thread.started",
          thread_id: "session-1"
        },
        expect.objectContaining({
          type: "item.completed",
          item: expect.objectContaining({
            id: "text-1",
            type: "agent_message"
          })
        }),
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
        },
        expect.objectContaining({
          type: "item.completed",
          item: expect.objectContaining({
            id: "opencode-diff:session-1",
            type: "file_change"
          })
        }),
        {
          type: "turn.completed",
          usage: {
            input_tokens: 12,
            cached_input_tokens: 1,
            output_tokens: 10
          }
        }
      ])
    );
    expect(events.find((event) => event.message.type === "turn.completed")).toMatchObject({
      rawPayload: {
        info: expect.objectContaining({
          id: "assistant-1"
        })
      },
      projectionLosses: [
        {
          kind: "reasoning_tokens_folded_into_output",
          messageId: "assistant-1",
          reasoningTokens: 2
        }
      ]
    });
    expect(
      events.find(
        (event) =>
          event.message.type === "item.completed" &&
          (event.message.item as { id?: string }).id === "opencode-diff:session-1"
      )
    ).toMatchObject({
      rawPayload: [
        expect.objectContaining({
          file: "apps/api/src/main.ts"
        })
      ]
    });
  });
});
