import process from "node:process";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import {
  executePiRunnerTurn,
  type PiRunnerRuntime
} from "./runner-entrypoint.js";

type TestSession = PiRunnerRuntime["session"];
type TestSessionListener = Parameters<TestSession["subscribe"]>[0];

function createAssistantMessage(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [
      {
        type: "text",
        text
      }
    ],
    api: "responses",
    provider: "openrouter",
    model: "xiaomi/mimo-v2-pro",
    responseId: "assistant-1",
    usage: {
      input: 12,
      output: 8,
      cacheRead: 2,
      cacheWrite: 0,
      totalTokens: 22,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0
      }
    },
    stopReason: "stop",
    timestamp: Date.parse("2026-04-14T18:10:00.000Z")
  };
}

function createSession(input: {
  onPrompt(listener: TestSessionListener | undefined): Promise<void> | void;
  messages?: AssistantMessage[];
  abort?: TestSession["abort"];
}): TestSession {
  let listener: TestSessionListener | undefined;

  return {
    subscribe(callback) {
      listener = callback;
      return () => {
        listener = undefined;
      };
    },
    async prompt() {
      await input.onPrompt(listener);
    },
    abort: input.abort ?? (async () => {}),
    dispose() {},
    state: {
      messages: input.messages ?? []
    }
  };
}

describe("pi runner entrypoint", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("emits prompt and terminal events for a successful turn", async () => {
    const finalMessage = createAssistantMessage("Implemented the requested change.");
    const session = createSession({
      async onPrompt(listener) {
        listener?.({
          type: "message_start",
          message: finalMessage
        });
        listener?.({
          type: "message_update",
          message: finalMessage,
          assistantMessageEvent: {
            type: "text_delta",
            contentIndex: 0,
            delta: "Implemented the requested change.",
            partial: finalMessage
          }
        });
        listener?.({
          type: "message_end",
          message: finalMessage
        });
      },
      messages: [finalMessage]
    });
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    });

    await executePiRunnerTurn(
      {
        bootstrap: {
          schemaVersion: "1",
          runId: "bootstrap-run",
          issue: {
            id: "issue-1",
            identifier: "SYM-42",
            title: "Implement the thing"
          },
          workspace: {
            cwd: "/workspace",
            sessionFile: "/workspace/.symphony/runtime/pi-sdk-session.jsonl",
            agentDir: null
          },
          prompt: {
            title: "Bootstrap",
            text: "Bootstrap"
          },
          model: {
            id: "xiaomi/mimo-v2-pro",
            reasoningEffort: "xhigh",
            profile: null,
            providerId: "openrouter",
            providerName: "OpenRouter"
          },
          timeouts: {
            runTimeoutMs: 300000,
            modelIdleTimeoutMs: 60000,
            toolTimeoutMs: null
          },
          executionPolicy: {
            approvalMode: "auto",
            emitReasoning: true
          }
        },
        resolvedAgentDir: "/tmp/pi-agent",
        model: {
          provider: "openrouter",
          id: "xiaomi/mimo-v2-pro"
        } as PiRunnerRuntime["model"],
        session,
        sessionId: "session-1",
        threadId: "session-1"
      },
      {
        schemaVersion: "1",
        commandType: "run_turn",
        runId: "run-turn-1",
        turnId: "turn-1",
        prompt: {
          title: "Implement spec",
          text: "Apply the requested change."
        },
        timeouts: {
          runTimeoutMs: 300000,
          modelIdleTimeoutMs: null,
          toolTimeoutMs: null
        },
        executionPolicy: {
          emitReasoning: true
        }
      }
    );

    const events = writes
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line));

    expect(events.map((event) => event.eventType)).toEqual([
      "prompt_started",
      "assistant_message_started",
      "assistant_text_delta",
      "terminal_result"
    ]);
    expect(events.at(-1)).toMatchObject({
      eventType: "terminal_result",
      result: {
        kind: "completed",
        stopReason: "end_turn",
        finalAssistantMessage: "Implemented the requested change."
      }
    });
  });

  it("emits command and file-change observability events for tool executions", async () => {
    const finalMessage = createAssistantMessage("Implemented the requested change.");
    const session = createSession({
      async onPrompt(listener) {
        listener?.({
          type: "tool_execution_start",
          toolCallId: "tool-bash-1",
          toolName: "bash",
          args: {
            command: "pnpm test"
          }
        });
        listener?.({
          type: "tool_execution_end",
          toolCallId: "tool-bash-1",
          toolName: "bash",
          isError: false,
          result: {
            content: [
              {
                type: "text",
                text: "Tests passed."
              }
            ]
          }
        });
        listener?.({
          type: "tool_execution_start",
          toolCallId: "tool-edit-1",
          toolName: "edit",
          args: {
            path: "src/example.ts"
          }
        });
        listener?.({
          type: "tool_execution_end",
          toolCallId: "tool-edit-1",
          toolName: "edit",
          isError: false,
          result: {
            content: [
              {
                type: "text",
                text: "Edited src/example.ts."
              }
            ],
            details: {
              diff: "@@ -1 +1 @@\n-old\n+new"
            }
          }
        });
        listener?.({
          type: "message_start",
          message: finalMessage
        });
        listener?.({
          type: "message_update",
          message: finalMessage,
          assistantMessageEvent: {
            type: "text_delta",
            contentIndex: 0,
            delta: "Implemented the requested change.",
            partial: finalMessage
          }
        });
        listener?.({
          type: "message_end",
          message: finalMessage
        });
      },
      messages: [finalMessage]
    });
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    });

    await executePiRunnerTurn(
      {
        bootstrap: {
          schemaVersion: "1",
          runId: "bootstrap-run",
          issue: {
            id: "issue-1",
            identifier: "SYM-42",
            title: "Implement the thing"
          },
          workspace: {
            cwd: "/workspace",
            sessionFile: "/workspace/.symphony/runtime/pi-sdk-session.jsonl",
            agentDir: null
          },
          prompt: {
            title: "Bootstrap",
            text: "Bootstrap"
          },
          model: {
            id: "xiaomi/mimo-v2-pro",
            reasoningEffort: "xhigh",
            profile: null,
            providerId: "openrouter",
            providerName: "OpenRouter"
          },
          timeouts: {
            runTimeoutMs: 300000,
            modelIdleTimeoutMs: 60000,
            toolTimeoutMs: null
          },
          executionPolicy: {
            approvalMode: "auto",
            emitReasoning: true
          }
        },
        resolvedAgentDir: "/tmp/pi-agent",
        model: {
          provider: "openrouter",
          id: "xiaomi/mimo-v2-pro"
        } as PiRunnerRuntime["model"],
        session,
        sessionId: "session-1",
        threadId: "session-1"
      },
      {
        schemaVersion: "1",
        commandType: "run_turn",
        runId: "run-turn-1",
        turnId: "turn-1",
        prompt: {
          title: "Implement spec",
          text: "Apply the requested change."
        },
        timeouts: {
          runTimeoutMs: 300000,
          modelIdleTimeoutMs: null,
          toolTimeoutMs: null
        },
        executionPolicy: {
          emitReasoning: true
        }
      }
    );

    const events = writes
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line));

    expect(events.map((event) => event.eventType)).toEqual([
      "prompt_started",
      "tool_call_started",
      "command_started",
      "tool_call_completed",
      "command_completed",
      "tool_call_started",
      "tool_call_completed",
      "file_change_observed",
      "assistant_message_started",
      "assistant_text_delta",
      "terminal_result"
    ]);
    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: "command_started",
        commandId: "tool-bash-1",
        commandText: "pnpm test",
        workingDirectory: "/workspace"
      })
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: "command_completed",
        commandId: "tool-bash-1",
        exitCode: 0,
        stdout: "Tests passed."
      })
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        eventType: "file_change_observed",
        path: "src/example.ts",
        changeType: "modified",
        diffText: "@@ -1 +1 @@\n-old\n+new"
      })
    );
  });

  it("classifies idle timeouts explicitly", async () => {
    vi.useFakeTimers();
    let resolvePrompt: (() => void) | null = null;
    const abort = vi.fn(async () => {
      resolvePrompt?.();
    });
    const session = createSession({
      onPrompt() {
        return new Promise<void>((resolve) => {
          resolvePrompt = resolve;
        });
      },
      abort,
      messages: []
    });
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    });

    const execution = executePiRunnerTurn(
      {
        bootstrap: {
          schemaVersion: "1",
          runId: "bootstrap-run",
          issue: {
            id: "issue-1",
            identifier: "SYM-42",
            title: "Implement the thing"
          },
          workspace: {
            cwd: "/workspace",
            sessionFile: "/workspace/.symphony/runtime/pi-sdk-session.jsonl",
            agentDir: null
          },
          prompt: {
            title: "Bootstrap",
            text: "Bootstrap"
          },
          model: {
            id: "xiaomi/mimo-v2-pro",
            reasoningEffort: "xhigh",
            profile: null,
            providerId: "openrouter",
            providerName: "OpenRouter"
          },
          timeouts: {
            runTimeoutMs: 300000,
            modelIdleTimeoutMs: 60000,
            toolTimeoutMs: null
          },
          executionPolicy: {
            approvalMode: "auto",
            emitReasoning: true
          }
        },
        resolvedAgentDir: "/tmp/pi-agent",
        model: {
          provider: "openrouter",
          id: "xiaomi/mimo-v2-pro"
        } as PiRunnerRuntime["model"],
        session,
        sessionId: "session-1",
        threadId: "session-1"
      },
      {
        schemaVersion: "1",
        commandType: "run_turn",
        runId: "run-turn-1",
        turnId: "turn-1",
        prompt: {
          title: "Implement spec",
          text: "Apply the requested change."
        },
        timeouts: {
          runTimeoutMs: 300000,
          modelIdleTimeoutMs: 50,
          toolTimeoutMs: null
        },
        executionPolicy: {
          emitReasoning: true
        }
      }
    );

    await vi.advanceTimersByTimeAsync(55);
    await execution;

    const events = writes
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line));

    expect(abort).toHaveBeenCalledTimes(1);
    expect(events.map((event) => event.eventType)).toContain("idle_timeout_triggered");
    expect(events.at(-1)).toMatchObject({
      eventType: "terminal_result",
      result: {
        kind: "failed",
        failureClass: "model_idle_timeout"
      }
    });
  });

  it("classifies full run timeouts explicitly", async () => {
    vi.useFakeTimers();
    let resolvePrompt: (() => void) | null = null;
    const abort = vi.fn(async () => {
      resolvePrompt?.();
    });
    const session = createSession({
      onPrompt() {
        return new Promise<void>((resolve) => {
          resolvePrompt = resolve;
        });
      },
      abort,
      messages: []
    });
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    });

    const execution = executePiRunnerTurn(
      {
        bootstrap: {
          schemaVersion: "1",
          runId: "bootstrap-run",
          issue: {
            id: "issue-1",
            identifier: "SYM-42",
            title: "Implement the thing"
          },
          workspace: {
            cwd: "/workspace",
            sessionFile: "/workspace/.symphony/runtime/pi-sdk-session.jsonl",
            agentDir: null
          },
          prompt: {
            title: "Bootstrap",
            text: "Bootstrap"
          },
          model: {
            id: "xiaomi/mimo-v2-pro",
            reasoningEffort: "xhigh",
            profile: null,
            providerId: "openrouter",
            providerName: "OpenRouter"
          },
          timeouts: {
            runTimeoutMs: 300000,
            modelIdleTimeoutMs: 60000,
            toolTimeoutMs: null
          },
          executionPolicy: {
            approvalMode: "auto",
            emitReasoning: true
          }
        },
        resolvedAgentDir: "/tmp/pi-agent",
        model: {
          provider: "openrouter",
          id: "xiaomi/mimo-v2-pro"
        } as PiRunnerRuntime["model"],
        session,
        sessionId: "session-1",
        threadId: "session-1"
      },
      {
        schemaVersion: "1",
        commandType: "run_turn",
        runId: "run-turn-1",
        turnId: "turn-1",
        prompt: {
          title: "Implement spec",
          text: "Apply the requested change."
        },
        timeouts: {
          runTimeoutMs: 50,
          modelIdleTimeoutMs: null,
          toolTimeoutMs: null
        },
        executionPolicy: {
          emitReasoning: true
        }
      }
    );

    await vi.advanceTimersByTimeAsync(55);
    await execution;

    const events = writes
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line));

    expect(abort).toHaveBeenCalledTimes(1);
    expect(events.map((event) => event.eventType)).toContain("run_timeout_triggered");
    expect(events.at(-1)).toMatchObject({
      eventType: "terminal_result",
      result: {
        kind: "failed",
        failureClass: "run_timeout"
      }
    });
  });

  it("emits heartbeats for active tools and classifies tool timeouts explicitly", async () => {
    vi.useFakeTimers();
    let resolvePrompt: (() => void) | null = null;
    const abort = vi.fn(async () => {
      resolvePrompt?.();
    });
    const session = createSession({
      onPrompt(listener) {
        listener?.({
          type: "tool_execution_start",
          toolCallId: "tool-bash-1",
          toolName: "bash",
          args: {
            command: "pnpm build"
          }
        });

        return new Promise<void>((resolve) => {
          resolvePrompt = resolve;
        });
      },
      abort,
      messages: []
    });
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    });

    const execution = executePiRunnerTurn(
      {
        bootstrap: {
          schemaVersion: "1",
          runId: "bootstrap-run",
          issue: {
            id: "issue-1",
            identifier: "SYM-42",
            title: "Implement the thing"
          },
          workspace: {
            cwd: "/workspace",
            sessionFile: "/workspace/.symphony/runtime/pi-sdk-session.jsonl",
            agentDir: null
          },
          prompt: {
            title: "Bootstrap",
            text: "Bootstrap"
          },
          model: {
            id: "xiaomi/mimo-v2-pro",
            reasoningEffort: "xhigh",
            profile: null,
            providerId: "openrouter",
            providerName: "OpenRouter"
          },
          timeouts: {
            runTimeoutMs: 300000,
            modelIdleTimeoutMs: 60000,
            toolTimeoutMs: 900000
          },
          executionPolicy: {
            approvalMode: "auto",
            emitReasoning: true
          }
        },
        resolvedAgentDir: "/tmp/pi-agent",
        model: {
          provider: "openrouter",
          id: "xiaomi/mimo-v2-pro"
        } as PiRunnerRuntime["model"],
        session,
        sessionId: "session-1",
        threadId: "session-1"
      },
      {
        schemaVersion: "1",
        commandType: "run_turn",
        runId: "run-turn-1",
        turnId: "turn-1",
        prompt: {
          title: "Implement spec",
          text: "Apply the requested change."
        },
        timeouts: {
          runTimeoutMs: 300000,
          modelIdleTimeoutMs: 60,
          toolTimeoutMs: 180
        },
        executionPolicy: {
          emitReasoning: true
        }
      }
    );

    await vi.advanceTimersByTimeAsync(65);

    const heartbeatEvents = writes
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line))
      .filter((event) => event.eventType === "tool_call_heartbeat");

    expect(heartbeatEvents.length).toBeGreaterThanOrEqual(1);
    expect(heartbeatEvents.at(-1)).toMatchObject({
      eventType: "tool_call_heartbeat",
      toolName: "bash",
      commandText: "pnpm build"
    });
    expect(abort).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(120);
    await execution;

    const events = writes
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line));

    expect(events.map((event) => event.eventType)).not.toContain("idle_timeout_triggered");
    expect(events.map((event) => event.eventType)).toContain("tool_timeout_triggered");
    expect(abort).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toMatchObject({
      eventType: "terminal_result",
      result: {
        kind: "failed",
        failureClass: "tool_timeout"
      }
    });
  });

  it("emits heartbeat-backed tool progress without classifying a clean completion as stalled", async () => {
    vi.useFakeTimers();
    const finalMessage = createAssistantMessage("Implemented the requested change.");
    const abort = vi.fn(async () => {});
    const session = createSession({
      onPrompt(listener) {
        listener?.({
          type: "tool_execution_start",
          toolCallId: "tool-bash-1",
          toolName: "bash",
          args: {
            command: "pnpm build"
          }
        });

        setTimeout(() => {
          listener?.({
            type: "tool_execution_end",
            toolCallId: "tool-bash-1",
            toolName: "bash",
            isError: false,
            result: {
              content: [
                {
                  type: "text",
                  text: "Build passed."
                }
              ]
            }
          });
          listener?.({
            type: "message_start",
            message: finalMessage
          });
          listener?.({
            type: "message_update",
            message: finalMessage,
            assistantMessageEvent: {
              type: "text_delta",
              contentIndex: 0,
              delta: "Implemented the requested change.",
              partial: finalMessage
            }
          });
          listener?.({
            type: "message_end",
            message: finalMessage
          });
        }, 90);

        return new Promise<void>((resolve) => {
          setTimeout(resolve, 95);
        });
      },
      messages: [finalMessage],
      abort
    });
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    });

    const execution = executePiRunnerTurn(
      {
        bootstrap: {
          schemaVersion: "1",
          runId: "bootstrap-run",
          issue: {
            id: "issue-1",
            identifier: "SYM-42",
            title: "Implement the thing"
          },
          workspace: {
            cwd: "/workspace",
            sessionFile: "/workspace/.symphony/runtime/pi-sdk-session.jsonl",
            agentDir: null
          },
          prompt: {
            title: "Bootstrap",
            text: "Bootstrap"
          },
          model: {
            id: "xiaomi/mimo-v2-pro",
            reasoningEffort: "xhigh",
            profile: null,
            providerId: "openrouter",
            providerName: "OpenRouter"
          },
          timeouts: {
            runTimeoutMs: 300000,
            modelIdleTimeoutMs: 60000,
            toolTimeoutMs: 900000
          },
          executionPolicy: {
            approvalMode: "auto",
            emitReasoning: true
          }
        },
        resolvedAgentDir: "/tmp/pi-agent",
        model: {
          provider: "openrouter",
          id: "xiaomi/mimo-v2-pro"
        } as PiRunnerRuntime["model"],
        session,
        sessionId: "session-1",
        threadId: "session-1"
      },
      {
        schemaVersion: "1",
        commandType: "run_turn",
        runId: "run-turn-1",
        turnId: "turn-1",
        prompt: {
          title: "Implement spec",
          text: "Apply the requested change."
        },
        timeouts: {
          runTimeoutMs: 300000,
          modelIdleTimeoutMs: 60,
          toolTimeoutMs: 180
        },
        executionPolicy: {
          emitReasoning: true
        }
      }
    );

    await vi.advanceTimersByTimeAsync(100);
    await execution;

    const events = writes
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line));

    expect(events.map((event) => event.eventType)).toContain("tool_call_heartbeat");
    expect(events.map((event) => event.eventType)).not.toContain("idle_timeout_triggered");
    expect(events.map((event) => event.eventType)).not.toContain("tool_timeout_triggered");
    expect(abort).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({
      eventType: "terminal_result",
      result: {
        kind: "completed",
        finalAssistantMessage: "Implemented the requested change."
      }
    });
  });
});
