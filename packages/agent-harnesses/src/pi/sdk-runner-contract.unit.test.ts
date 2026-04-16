import { describe, expect, it } from "vitest";
import {
  parsePiSdkRunnerCommand,
  parsePiSdkRunnerEvent,
  parsePiSdkRunnerInput,
  parsePiSdkRunnerTerminalResult,
  piSdkRunnerFailureClasses
} from "./sdk-runner-contract.js";

describe("pi sdk runner contract", () => {
  it("parses a valid runner input", () => {
    const parsed = parsePiSdkRunnerInput({
      schemaVersion: "1",
      runId: "run-1",
      issue: {
        id: "issue-1",
        identifier: "SYM-42",
        title: "Implement the thing"
      },
      workspace: {
        cwd: "/workspace",
        sessionFile: "/workspace/.pi/session.jsonl",
        agentDir: null
      },
      prompt: {
        title: "Implement spec",
        text: "Apply the requested change."
      },
      model: {
        id: "xiaomi/mimo-v2-pro",
        reasoningEffort: "high",
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
    });

    expect(parsed).toEqual({
      schemaVersion: "1",
      runId: "run-1",
      issue: {
        id: "issue-1",
        identifier: "SYM-42",
        title: "Implement the thing"
      },
      workspace: {
        cwd: "/workspace",
        sessionFile: "/workspace/.pi/session.jsonl",
        agentDir: null
      },
      prompt: {
        title: "Implement spec",
        text: "Apply the requested change."
      },
      model: {
        id: "xiaomi/mimo-v2-pro",
        reasoningEffort: "high",
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
    });
  });

  it("rejects malformed runner input", () => {
    expect(() =>
      parsePiSdkRunnerInput({
        schemaVersion: "1",
        runId: "run-1",
        issue: {
          id: "issue-1",
          identifier: "SYM-42",
          title: "Implement the thing"
        },
        workspace: {
          cwd: "/workspace",
          sessionFile: "/workspace/.pi/session.jsonl",
          agentDir: null
        },
        prompt: {
          title: "Implement spec",
          text: "Apply the requested change."
        },
        model: {
          id: "xiaomi/mimo-v2-pro",
          reasoningEffort: "high",
          profile: null,
          providerId: "openrouter",
          providerName: "OpenRouter"
        },
        timeouts: {
          runTimeoutMs: 0,
          modelIdleTimeoutMs: 60000,
          toolTimeoutMs: null
        },
        executionPolicy: {
          approvalMode: "auto",
          emitReasoning: true
        }
      })
    ).toThrow("runTimeoutMs must be a positive integer.");
  });

  it("parses a bootstrap runner command", () => {
    const parsed = parsePiSdkRunnerCommand({
      schemaVersion: "1",
      commandType: "bootstrap",
      input: {
        schemaVersion: "1",
        runId: "run-1",
        issue: {
          id: "issue-1",
          identifier: "SYM-42",
          title: "Implement the thing"
        },
        workspace: {
          cwd: "/workspace",
          sessionFile: "/workspace/.pi/session.jsonl",
          agentDir: null
        },
        prompt: {
          title: "Initialize Pi SDK runner",
          text: "Initialize the Pi SDK runner session."
        },
        model: {
          id: "xiaomi/mimo-v2-pro",
          reasoningEffort: "high",
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
      }
    });

    expect(parsed).toMatchObject({
      commandType: "bootstrap",
      input: {
        runId: "run-1",
        model: {
          id: "xiaomi/mimo-v2-pro"
        }
      }
    });
  });

  it("parses a run_turn command", () => {
    const parsed = parsePiSdkRunnerCommand({
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
        modelIdleTimeoutMs: 60000,
        toolTimeoutMs: null
      },
      executionPolicy: {
        emitReasoning: true
      }
    });

    expect(parsed).toEqual({
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
        modelIdleTimeoutMs: 60000,
        toolTimeoutMs: null
      },
      executionPolicy: {
        emitReasoning: true
      }
    });
  });

  it("parses a completed terminal result", () => {
    const parsed = parsePiSdkRunnerTerminalResult({
      schemaVersion: "1",
      kind: "completed",
      stopReason: "end_turn",
      providerStopReason: "end_turn",
      finalAssistantMessage: "Implemented the requested change.",
      usage: {
        inputTokens: 10,
        cachedInputTokens: 2,
        outputTokens: 7,
        totalTokens: 19
      },
      lastActivityAt: "2026-04-14T18:00:00.000Z",
      lastActivityType: "tool_call_completed"
    });

    expect(parsed).toMatchObject({
      kind: "completed",
      stopReason: "end_turn",
      usage: {
        inputTokens: 10,
        cachedInputTokens: 2,
        outputTokens: 7,
        totalTokens: 19
      },
      lastActivityType: "tool_call_completed"
    });
  });

  it("rejects an invalid terminal result failure class", () => {
    expect(() =>
      parsePiSdkRunnerTerminalResult({
        schemaVersion: "1",
        kind: "failed",
        stopReason: null,
        providerStopReason: null,
        finalAssistantMessage: null,
        usage: null,
        lastActivityAt: null,
        lastActivityType: null,
        failureClass: "stalled",
        reason: "The run stalled."
      })
    ).toThrow(
      `failureClass must be one of ${JSON.stringify(piSdkRunnerFailureClasses)}.`
    );
  });

  it("parses a command completion event with full text fields", () => {
    const parsed = parsePiSdkRunnerEvent({
      schemaVersion: "1",
      eventType: "command_completed",
      sequence: 8,
      recordedAt: "2026-04-14T18:00:00.000Z",
      runId: "run-1",
      commandId: "cmd-1",
      commandText: "pnpm build",
      exitCode: 0,
      stdout: "full stdout text",
      stderr: "full stderr text"
    });

    expect(parsed).toEqual({
      schemaVersion: "1",
      eventType: "command_completed",
      sequence: 8,
      recordedAt: "2026-04-14T18:00:00.000Z",
      runId: "run-1",
      commandId: "cmd-1",
      commandText: "pnpm build",
      exitCode: 0,
      stdout: "full stdout text",
      stderr: "full stderr text"
    });
  });

  it("parses a terminal result event", () => {
    const parsed = parsePiSdkRunnerEvent({
      schemaVersion: "1",
      eventType: "terminal_result",
      sequence: 14,
      recordedAt: "2026-04-14T18:05:00.000Z",
      runId: "run-1",
      result: {
        schemaVersion: "1",
        kind: "awaiting_input",
        stopReason: "end_turn",
        providerStopReason: "end_turn",
        finalAssistantMessage: "I need clarification.",
        usage: null,
        lastActivityAt: "2026-04-14T18:04:58.000Z",
        lastActivityType: "assistant_text_delta",
        reason: "The ticket does not specify the API shape.",
        prompt: "Which response fields should be returned?"
      }
    });

    expect(parsed).toMatchObject({
      eventType: "terminal_result",
      result: {
        kind: "awaiting_input",
        prompt: "Which response fields should be returned?"
      }
    });
  });

  it("parses tool heartbeat and tool-timeout events", () => {
    const heartbeatEvent = parsePiSdkRunnerEvent({
      schemaVersion: "1",
      eventType: "tool_call_heartbeat",
      sequence: 15,
      recordedAt: "2026-04-14T18:05:10.000Z",
      runId: "run-1",
      callId: "tool-bash-1",
      toolName: "bash",
      argumentsText: "{\"command\":\"pnpm build\"}",
      commandText: "pnpm build",
      elapsedMs: 30000,
      heartbeatIntervalMs: 30000,
      timeoutMs: 900000
    });
    const timeoutEvent = parsePiSdkRunnerEvent({
      schemaVersion: "1",
      eventType: "tool_timeout_triggered",
      sequence: 16,
      recordedAt: "2026-04-14T18:20:10.000Z",
      runId: "run-1",
      failureClass: "tool_timeout",
      thresholdMs: 900000,
      callId: "tool-bash-1",
      toolName: "bash",
      commandText: "pnpm build",
      lastActivityAt: "2026-04-14T18:19:40.000Z",
      lastActivityType: "tool_call_heartbeat"
    });

    expect(heartbeatEvent).toMatchObject({
      eventType: "tool_call_heartbeat",
      callId: "tool-bash-1",
      elapsedMs: 30000,
      timeoutMs: 900000
    });
    expect(timeoutEvent).toMatchObject({
      eventType: "tool_timeout_triggered",
      failureClass: "tool_timeout",
      thresholdMs: 900000,
      lastActivityType: "tool_call_heartbeat"
    });
  });

  it("rejects an event with an invalid timestamp", () => {
    expect(() =>
      parsePiSdkRunnerEvent({
        schemaVersion: "1",
        eventType: "runner_error",
        sequence: 2,
        recordedAt: "not-a-timestamp",
        runId: "run-1",
        failureClass: "runtime_crash",
        reason: "The embedded runner exited unexpectedly."
      })
    ).toThrow("recordedAt must be an ISO-8601 timestamp.");
  });
});
