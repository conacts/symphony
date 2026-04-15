import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { SymphonyAgentRuntimeConfig } from "@symphony/orchestrator";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import { HarnessSessionError } from "../shared/session-types.js";
import {
  buildPiSdkRunnerSpawnSpec,
  defaultPiSdkRunnerEntrypointPath,
  defaultPiSdkRunnerTsxLoaderPath
} from "./launch.js";
import { PiSdkRunnerClient } from "./sdk-runner-client.js";

const { startMock } = vi.hoisted(() => ({
  startMock: vi.fn()
}));

vi.mock("./sdk-runner-process.js", () => ({
  PiSdkRunnerProcess: {
    start: startMock
  }
}));

const currentFilePath = fileURLToPath(import.meta.url);
const packageRoot = path.resolve(path.dirname(currentFilePath), "../../..");
const repoRoot = path.resolve(packageRoot, "../..");
const hostCommandEnvSource = {
  PATH: "/usr/bin:/bin",
  HOME: "/tmp/symphony-home"
};

function createIssue(): SymphonyTrackerIssue {
  return {
    id: "issue-1",
    identifier: "SYM-42",
    title: "Implement the thing",
    description: null,
    priority: null,
    url: null,
    state: "Todo",
    branchName: null,
    labels: [],
    projectId: null,
    projectName: null,
    teamKey: "SYM",
    assigneeId: null,
    blockedBy: [],
    assignedToWorker: false,
    createdAt: null,
    updatedAt: null
  };
}

function createRuntimePolicy(): SymphonyAgentRuntimeConfig {
  return {
    tracker: {
      kind: "linear",
      endpoint: "https://api.linear.app/graphql",
      apiKey: "token",
      teamKey: "SYM",
      excludedProjectIds: [],
      assignee: null,
      dispatchableStates: ["Todo", "Bootstrapping", "In Progress"],
      terminalStates: ["Canceled", "Done"],
      claimTransitionToState: "Bootstrapping",
      claimTransitionFromStates: ["Todo"],
      startupFailureTransitionToState: "Failed",
      pauseTransitionToState: "Paused",
      blockedTransitionToState: "Blocked"
    },
    workspace: {
      root: repoRoot
    },
    agent: {
      harness: "pi",
      maxTurns: 20
    },
    agentRuntime: {
      command: "pi",
      approvalPolicy: "never",
      threadSandbox: "danger-full-access",
      turnSandboxPolicy: null,
      profile: "mimo-v2-pro",
      defaultModel: "xiaomi/mimo-v2-pro",
      defaultReasoningEffort: "high",
      defaultPreset: "advanced",
      presets: {
        advanced: {
          model: "xiaomi/mimo-v2-pro",
          reasoningEffort: "xhigh",
          authMode: "provider"
        }
      },
      provider: {
        id: "openrouter",
        name: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        envKey: "OPENROUTER_API_KEY",
        supportsWebsockets: false,
        wireApi: "responses"
      },
      turnTimeoutMs: 300000,
      readTimeoutMs: 5000,
      stallTimeoutMs: 300000
    },
    pi: {
      profile: "mimo-v2-pro",
      defaultModel: "xiaomi/mimo-v2-pro",
      defaultReasoningEffort: "high",
      defaultPreset: "advanced",
      presets: {
        advanced: {
          model: "xiaomi/mimo-v2-pro",
          reasoningEffort: "xhigh",
          authMode: "provider"
        }
      },
      provider: {
        id: "openrouter",
        name: "OpenRouter",
        baseUrl: "https://openrouter.ai/api/v1",
        envKey: "OPENROUTER_API_KEY",
        supportsWebsockets: false,
        wireApi: "responses"
      },
      turnTimeoutMs: 300000,
      readTimeoutMs: 5000,
      stallTimeoutMs: 300000,
      toolTimeoutMs: 900000
    },
    hooks: {
      timeoutMs: 150000
    }
  };
}

describe("pi sdk runner client", () => {
  it("builds a docker spawn spec rooted at the workspace root", () => {
    const spec = buildPiSdkRunnerSpawnSpec({
      launchTarget: {
        kind: "container",
        hostLaunchPath: `${repoRoot}/apps/api`,
        hostWorkspacePath: repoRoot,
        runtimeWorkspacePath: "/workspace/apps/api",
        containerId: "container-1",
        containerName: "symphony-col-123",
        shell: "sh",
        user: "1000:1000"
      },
      env: {
        OPENROUTER_API_KEY: "test-key"
      },
      hostCommandEnvSource
    });

    expect(spec.runtimeWorkspaceRoot).toBe("/workspace");
    expect(spec.args.at(-1)).toContain(
      `exec node --import '${defaultPiSdkRunnerTsxLoaderPath}' '${defaultPiSdkRunnerEntrypointPath}'`
    );
  });

  it("starts the runner skeleton and receives session_started", async () => {
    const awaitEvent = vi
      .fn()
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "session_started",
        sequence: 1,
        recordedAt: "2026-04-14T18:00:00.000Z",
        runId: "sdk-bootstrap-SYM-42-run",
        sessionId: "sdk-bootstrap-SYM-42-session",
        threadId: null,
        modelId: "xiaomi/mimo-v2-pro",
        cwd: "/workspace/packages/agent-harnesses"
      });
    const sendCommand = vi.fn();
    startMock.mockResolvedValue({
      process: {
        processId: "1234",
        sendCommand,
        awaitEvent,
        close: vi.fn()
      },
      hostLaunchPath: packageRoot,
      runtimeWorkspacePath: "/workspace/packages/agent-harnesses",
      runtimeWorkspaceRoot: "/workspace"
    });

    const runtimePolicy = createRuntimePolicy();
    const session = await PiSdkRunnerClient.startSession(
      {
        launchTarget: {
          kind: "container",
          hostLaunchPath: packageRoot,
          hostWorkspacePath: repoRoot,
          runtimeWorkspacePath: "/workspace/packages/agent-harnesses",
          containerId: "container-1",
          containerName: "symphony-col-123",
          shell: "sh",
          user: "1000:1000"
        },
        env: {},
        hostCommandEnvSource,
        runtimePolicy,
        issue: createIssue(),
        logger: {
          debug() {},
          warn() {},
          error() {}
        }
      }
    );

    expect(session.threadId).toContain("sdk-bootstrap-SYM-42");
    expect(session.workspacePath).toBe("/workspace/packages/agent-harnesses");
    expect(session.model).toBe("xiaomi/mimo-v2-pro");
    expect(session.reasoningEffort).toBe("xhigh");
    expect(sendCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        commandType: "bootstrap"
      })
    );

    session.client.close();
  });

  it("runs a turn and emits canonical thread events from SDK runner events", async () => {
    const awaitEvent = vi
      .fn()
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "session_started",
        sequence: 1,
        recordedAt: "2026-04-14T18:00:00.000Z",
        runId: "sdk-bootstrap-SYM-42-run",
        sessionId: "sdk-bootstrap-SYM-42-session",
        threadId: null,
        modelId: "xiaomi/mimo-v2-pro",
        cwd: "/workspace/packages/agent-harnesses"
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "prompt_started",
        sequence: 2,
        recordedAt: "2026-04-14T18:01:00.000Z",
        runId: "pi-sdk-turn-1",
        promptTitle: "Implement spec",
        promptText: "Apply the requested change."
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "assistant_message_started",
        sequence: 3,
        recordedAt: "2026-04-14T18:01:01.000Z",
        runId: "pi-sdk-turn-1",
        messageId: "assistant-1"
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "assistant_text_delta",
        sequence: 4,
        recordedAt: "2026-04-14T18:01:02.000Z",
        runId: "pi-sdk-turn-1",
        messageId: "assistant-1",
        text: "Implemented the change."
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "assistant_reasoning_delta",
        sequence: 5,
        recordedAt: "2026-04-14T18:01:03.000Z",
        runId: "pi-sdk-turn-1",
        messageId: "assistant-1",
        text: "Checking the file before writing."
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "command_started",
        sequence: 6,
        recordedAt: "2026-04-14T18:01:03.250Z",
        runId: "pi-sdk-turn-1",
        commandId: "tool-bash-1",
        commandText: "pnpm test",
        workingDirectory: "/workspace/packages/agent-harnesses"
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "command_completed",
        sequence: 7,
        recordedAt: "2026-04-14T18:01:03.500Z",
        runId: "pi-sdk-turn-1",
        commandId: "tool-bash-1",
        commandText: "pnpm test",
        exitCode: 0,
        stdout: "Tests passed.",
        stderr: null
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "tool_call_started",
        sequence: 8,
        recordedAt: "2026-04-14T18:01:03.700Z",
        runId: "pi-sdk-turn-1",
        callId: "tool-edit-1",
        toolName: "edit",
        argumentsText: "{\"path\":\"src/example.ts\"}"
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "tool_call_completed",
        sequence: 9,
        recordedAt: "2026-04-14T18:01:03.800Z",
        runId: "pi-sdk-turn-1",
        callId: "tool-edit-1",
        toolName: "edit",
        outputText: "Edited src/example.ts."
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "file_change_observed",
        sequence: 10,
        recordedAt: "2026-04-14T18:01:03.900Z",
        runId: "pi-sdk-turn-1",
        path: "src/example.ts",
        changeType: "modified",
        diffText: "@@ -1 +1 @@\n-old\n+new"
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "terminal_result",
        sequence: 11,
        recordedAt: "2026-04-14T18:01:04.000Z",
        runId: "pi-sdk-turn-1",
        result: {
          schemaVersion: "1",
          kind: "completed",
          stopReason: "end_turn",
          providerStopReason: "stop",
          finalAssistantMessage: "Implemented the change.",
          usage: {
            inputTokens: 11,
            cachedInputTokens: 2,
            outputTokens: 7,
            totalTokens: 20
          },
          lastActivityAt: "2026-04-14T18:01:03.000Z",
          lastActivityType: "assistant_reasoning_delta"
        }
      });
    const sendCommand = vi.fn();
    const close = vi.fn();

    startMock.mockResolvedValue({
      process: {
        processId: "1234",
        sendCommand,
        awaitEvent,
        close
      },
      hostLaunchPath: packageRoot,
      runtimeWorkspacePath: "/workspace/packages/agent-harnesses",
      runtimeWorkspaceRoot: "/workspace"
    });

    const runtimePolicy = createRuntimePolicy();
    const session = await PiSdkRunnerClient.startSession(
      {
        launchTarget: {
          kind: "container",
          hostLaunchPath: packageRoot,
          hostWorkspacePath: repoRoot,
          runtimeWorkspacePath: "/workspace/packages/agent-harnesses",
          containerId: "container-1",
          containerName: "symphony-col-123",
          shell: "sh",
          user: "1000:1000"
        },
        env: {},
        hostCommandEnvSource,
        runtimePolicy,
        issue: createIssue(),
        logger: {
          debug() {},
          warn() {},
          error() {}
        }
      }
    );

    const updates: Array<Record<string, unknown>> = [];
    const result = await session.client.runTurn(session, {
      prompt: "Apply the requested change.",
      title: "Implement spec",
      onMessage(update) {
        updates.push(update.event);
      },
      turnTimeoutMs: 30_000
    });

    expect(result).toEqual({
      kind: "completed",
      threadId: "sdk-bootstrap-SYM-42-session",
      turnId: "pi-sdk-turn-1",
      usage: {
        input_tokens: 11,
        cached_input_tokens: 2,
        output_tokens: 7
      }
    });
    expect(sendCommand).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        commandType: "run_turn",
        turnId: "pi-sdk-turn-1",
        timeouts: expect.objectContaining({
          toolTimeoutMs: 30000
        })
      })
    );
    expect(updates).toEqual([
      {
        type: "thread.started",
        thread_id: "sdk-bootstrap-SYM-42-session"
      },
      {
        type: "turn.started"
      },
      {
        type: "item.started",
        item: {
          id: "assistant-1",
          type: "agent_message",
          text: ""
        }
      },
      {
        type: "item.updated",
        item: {
          id: "assistant-1",
          type: "agent_message",
          text: "Implemented the change."
        }
      },
      {
        type: "item.started",
        item: {
          id: "assistant-1:reasoning",
          type: "reasoning",
          text: ""
        }
      },
      {
        type: "item.updated",
        item: {
          id: "assistant-1:reasoning",
          type: "reasoning",
          text: "Checking the file before writing."
        }
      },
      {
        type: "item.started",
        item: {
          id: "tool-bash-1",
          type: "command_execution",
          command: "pnpm test",
          aggregated_output: "",
          status: "in_progress"
        }
      },
      {
        type: "item.completed",
        item: {
          id: "tool-bash-1",
          type: "command_execution",
          command: "pnpm test",
          aggregated_output: "Tests passed.",
          exit_code: 0,
          status: "completed"
        }
      },
      {
        type: "item.started",
        item: {
          id: "tool-edit-1",
          type: "mcp_tool_call",
          server: "pi",
          tool: "edit",
          arguments: {
            path: "src/example.ts"
          },
          status: "in_progress"
        }
      },
      {
        type: "item.completed",
        item: {
          id: "tool-edit-1",
          type: "mcp_tool_call",
          server: "pi",
          tool: "edit",
          arguments: {
            path: "src/example.ts"
          },
          status: "completed",
          result: {
            content: [
              {
                type: "text",
                text: "Edited src/example.ts."
              }
            ],
            structured_content: null
          }
        }
      },
      {
        type: "item.completed",
        item: {
          id: "pi-file-change:pi-sdk-turn-1:10",
          type: "file_change",
          changes: [
            {
              path: "src/example.ts",
              kind: "update"
            }
          ],
          status: "completed"
        }
      },
      {
        type: "item.completed",
        item: {
          id: "assistant-1",
          type: "agent_message",
          text: "Implemented the change."
        }
      },
      {
        type: "item.completed",
        item: {
          id: "assistant-1:reasoning",
          type: "reasoning",
          text: "Checking the file before writing."
        }
      },
      {
        type: "turn.completed",
        usage: {
          input_tokens: 11,
          cached_input_tokens: 2,
          output_tokens: 7
        }
      }
    ]);

    session.client.close();
    expect(close).toHaveBeenCalled();
  });

  it("classifies missing bridge output as a transport timeout", async () => {
    const awaitEvent = vi
      .fn()
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "session_started",
        sequence: 1,
        recordedAt: "2026-04-14T18:00:00.000Z",
        runId: "sdk-bootstrap-SYM-42-run",
        sessionId: "sdk-bootstrap-SYM-42-session",
        threadId: null,
        modelId: "xiaomi/mimo-v2-pro",
        cwd: "/workspace/packages/agent-harnesses"
      });
    const sendCommand = vi.fn();

    startMock.mockResolvedValue({
      process: {
        processId: "1234",
        sendCommand,
        awaitEvent,
        close: vi.fn(),
        diagnosticsSnapshot: vi.fn().mockReturnValue({
          processId: "1234",
          recentStdoutLines: [],
          recentStderrLines: []
        })
      },
      hostLaunchPath: packageRoot,
      runtimeWorkspacePath: "/workspace/packages/agent-harnesses",
      runtimeWorkspaceRoot: "/workspace"
    });

    const runtimePolicy = createRuntimePolicy();
    const session = await PiSdkRunnerClient.startSession(
      {
        launchTarget: {
          kind: "container",
          hostLaunchPath: packageRoot,
          hostWorkspacePath: repoRoot,
          runtimeWorkspacePath: "/workspace/packages/agent-harnesses",
          containerId: "container-1",
          containerName: "symphony-col-123",
          shell: "sh",
          user: "1000:1000"
        },
        env: {},
        hostCommandEnvSource,
        runtimePolicy,
        issue: createIssue(),
        logger: {
          debug() {},
          warn() {},
          error() {}
        }
      }
    );

    awaitEvent.mockRejectedValueOnce(
      new HarnessSessionError(
        "pi_sdk_runner_timeout",
        "Timed out waiting for Pi SDK runner event after 5000ms."
      )
    );

    const updates: Array<Record<string, unknown>> = [];
    await expect(
      session.client.runTurn(session, {
        prompt: "Apply the requested change.",
        title: "Implement spec",
        onMessage(update) {
          updates.push(update.event);
        },
        turnTimeoutMs: 30_000
      })
    ).rejects.toMatchObject({
      code: "pi_sdk_runner_transport_timeout"
    });

    expect(updates).toContainEqual({
      type: "turn.failed",
      error: {
        message: "Timed out waiting for Pi SDK bridge output after 5000ms."
      }
    });
  });

  it("synthesizes a completed assistant item when the terminal result is the only assistant payload", async () => {
    const awaitEvent = vi
      .fn()
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "session_started",
        sequence: 1,
        recordedAt: "2026-04-14T18:00:00.000Z",
        runId: "sdk-bootstrap-SYM-42-run",
        sessionId: "sdk-bootstrap-SYM-42-session",
        threadId: null,
        modelId: "xiaomi/mimo-v2-pro",
        cwd: "/workspace/packages/agent-harnesses"
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "prompt_started",
        sequence: 2,
        recordedAt: "2026-04-14T18:01:00.000Z",
        runId: "pi-sdk-turn-1",
        promptTitle: "Implement spec",
        promptText: "Apply the requested change."
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "terminal_result",
        sequence: 3,
        recordedAt: "2026-04-14T18:01:04.000Z",
        runId: "pi-sdk-turn-1",
        result: {
          schemaVersion: "1",
          kind: "completed",
          stopReason: "end_turn",
          providerStopReason: "stop",
          finalAssistantMessage: "Implemented the change.",
          usage: {
            inputTokens: 11,
            cachedInputTokens: 2,
            outputTokens: 7,
            totalTokens: 20
          },
          lastActivityAt: "2026-04-14T18:01:03.000Z",
          lastActivityType: "assistant_reasoning_delta"
        }
      });
    const sendCommand = vi.fn();

    startMock.mockResolvedValue({
      process: {
        processId: "1234",
        sendCommand,
        awaitEvent,
        close: vi.fn()
      },
      hostLaunchPath: packageRoot,
      runtimeWorkspacePath: "/workspace/packages/agent-harnesses",
      runtimeWorkspaceRoot: "/workspace"
    });

    const runtimePolicy = createRuntimePolicy();
    const session = await PiSdkRunnerClient.startSession(
      {
        launchTarget: {
          kind: "container",
          hostLaunchPath: packageRoot,
          hostWorkspacePath: repoRoot,
          runtimeWorkspacePath: "/workspace/packages/agent-harnesses",
          containerId: "container-1",
          containerName: "symphony-col-123",
          shell: "sh",
          user: "1000:1000"
        },
        env: {},
        hostCommandEnvSource,
        runtimePolicy,
        issue: createIssue(),
        logger: {
          debug() {},
          warn() {},
          error() {}
        }
      }
    );

    const updates: Array<Record<string, unknown>> = [];
    const result = await session.client.runTurn(session, {
      prompt: "Apply the requested change.",
      title: "Implement spec",
      onMessage(update) {
        updates.push(update.event);
      },
      turnTimeoutMs: 30_000
    });

    expect(result).toEqual({
      kind: "completed",
      threadId: "sdk-bootstrap-SYM-42-session",
      turnId: "pi-sdk-turn-1",
      usage: {
        input_tokens: 11,
        cached_input_tokens: 2,
        output_tokens: 7
      }
    });
    expect(updates).toEqual([
      {
        type: "thread.started",
        thread_id: "sdk-bootstrap-SYM-42-session"
      },
      {
        type: "turn.started"
      },
      {
        type: "item.completed",
        item: {
          id: "pi-sdk-turn-1:assistant",
          type: "agent_message",
          text: "Implemented the change."
        }
      },
      {
        type: "turn.completed",
        usage: {
          input_tokens: 11,
          cached_input_tokens: 2,
          output_tokens: 7
        }
      }
    ]);
  });

  it("returns awaiting_input terminal results without throwing", async () => {
    const awaitEvent = vi
      .fn()
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "session_started",
        sequence: 1,
        recordedAt: "2026-04-14T18:00:00.000Z",
        runId: "sdk-bootstrap-SYM-42-run",
        sessionId: "sdk-bootstrap-SYM-42-session",
        threadId: null,
        modelId: "xiaomi/mimo-v2-pro",
        cwd: "/workspace/packages/agent-harnesses"
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "prompt_started",
        sequence: 2,
        recordedAt: "2026-04-14T18:01:00.000Z",
        runId: "pi-sdk-turn-1",
        promptTitle: "Implement spec",
        promptText: "Apply the requested change."
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "terminal_result",
        sequence: 3,
        recordedAt: "2026-04-14T18:01:04.000Z",
        runId: "pi-sdk-turn-1",
        result: {
          schemaVersion: "1",
          kind: "awaiting_input",
          stopReason: "end_turn",
          providerStopReason: "stop",
          finalAssistantMessage: "Need the production API host before continuing.",
          usage: {
            inputTokens: 11,
            cachedInputTokens: 2,
            outputTokens: 7,
            totalTokens: 20
          },
          lastActivityAt: "2026-04-14T18:01:03.000Z",
          lastActivityType: "assistant_text_delta",
          reason: "Need the production API host before continuing.",
          prompt: "Provide the production API host."
        }
      });

    startMock.mockResolvedValue({
      process: {
        processId: "1234",
        sendCommand: vi.fn(),
        awaitEvent,
        close: vi.fn()
      },
      hostLaunchPath: packageRoot,
      runtimeWorkspacePath: "/workspace/packages/agent-harnesses",
      runtimeWorkspaceRoot: "/workspace"
    });

    const session = await PiSdkRunnerClient.startSession({
      launchTarget: {
        kind: "container",
        hostLaunchPath: packageRoot,
        hostWorkspacePath: repoRoot,
        runtimeWorkspacePath: "/workspace/packages/agent-harnesses",
        containerId: "container-1",
        containerName: "symphony-col-123",
        shell: "sh",
        user: "1000:1000"
      },
      env: {},
      hostCommandEnvSource,
      runtimePolicy: createRuntimePolicy(),
      issue: createIssue(),
      logger: {
        debug() {},
        warn() {},
        error() {}
      }
    });

    const updates: Array<Record<string, unknown>> = [];
    const result = await session.client.runTurn(session, {
      prompt: "Apply the requested change.",
      title: "Implement spec",
      onMessage(update) {
        updates.push(update.event);
      },
      turnTimeoutMs: 30_000
    });

    expect(result).toEqual({
      kind: "awaiting_input",
      threadId: "sdk-bootstrap-SYM-42-session",
      turnId: "pi-sdk-turn-1",
      usage: {
        input_tokens: 11,
        cached_input_tokens: 2,
        output_tokens: 7
      },
      reason: "Need the production API host before continuing.",
      prompt: "Provide the production API host.",
      detail: expect.objectContaining({
        kind: "awaiting_input"
      })
    });
    expect(updates.at(-1)).toEqual({
      type: "turn.failed",
      error: {
        message: "Need the production API host before continuing."
      }
    });
  });

  it("returns failed terminal results without converting them into transport errors", async () => {
    const awaitEvent = vi
      .fn()
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "session_started",
        sequence: 1,
        recordedAt: "2026-04-14T18:00:00.000Z",
        runId: "sdk-bootstrap-SYM-42-run",
        sessionId: "sdk-bootstrap-SYM-42-session",
        threadId: null,
        modelId: "xiaomi/mimo-v2-pro",
        cwd: "/workspace/packages/agent-harnesses"
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "prompt_started",
        sequence: 2,
        recordedAt: "2026-04-14T18:01:00.000Z",
        runId: "pi-sdk-turn-1",
        promptTitle: "Implement spec",
        promptText: "Apply the requested change."
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "terminal_result",
        sequence: 3,
        recordedAt: "2026-04-14T18:01:04.000Z",
        runId: "pi-sdk-turn-1",
        result: {
          schemaVersion: "1",
          kind: "failed",
          stopReason: "error",
          providerStopReason: "error",
          finalAssistantMessage: null,
          usage: null,
          lastActivityAt: "2026-04-14T18:01:03.000Z",
          lastActivityType: "command_failed",
          failureClass: "tool_timeout",
          reason: "Command execution exceeded the configured timeout."
        }
      });

    startMock.mockResolvedValue({
      process: {
        processId: "1234",
        sendCommand: vi.fn(),
        awaitEvent,
        close: vi.fn()
      },
      hostLaunchPath: packageRoot,
      runtimeWorkspacePath: "/workspace/packages/agent-harnesses",
      runtimeWorkspaceRoot: "/workspace"
    });

    const session = await PiSdkRunnerClient.startSession({
      launchTarget: {
        kind: "container",
        hostLaunchPath: packageRoot,
        hostWorkspacePath: repoRoot,
        runtimeWorkspacePath: "/workspace/packages/agent-harnesses",
        containerId: "container-1",
        containerName: "symphony-col-123",
        shell: "sh",
        user: "1000:1000"
      },
      env: {},
      hostCommandEnvSource,
      runtimePolicy: createRuntimePolicy(),
      issue: createIssue(),
      logger: {
        debug() {},
        warn() {},
        error() {}
      }
    });

    const result = await session.client.runTurn(session, {
      prompt: "Apply the requested change.",
      title: "Implement spec",
      onMessage() {},
      turnTimeoutMs: 30_000
    });

    expect(result).toEqual({
      kind: "failed",
      threadId: "sdk-bootstrap-SYM-42-session",
      turnId: "pi-sdk-turn-1",
      usage: null,
      reason: "Command execution exceeded the configured timeout.",
      failureClass: "tool_timeout",
      detail: expect.objectContaining({
        kind: "failed",
        failureClass: "tool_timeout"
      })
    });
  });

  it("preserves timeout trigger metadata on idle-timeout terminal failures", async () => {
    const awaitEvent = vi
      .fn()
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "session_started",
        sequence: 1,
        recordedAt: "2026-04-14T18:00:00.000Z",
        runId: "sdk-bootstrap-SYM-42-run",
        sessionId: "sdk-bootstrap-SYM-42-session",
        threadId: null,
        modelId: "xiaomi/mimo-v2-pro",
        cwd: "/workspace/packages/agent-harnesses"
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "prompt_started",
        sequence: 2,
        recordedAt: "2026-04-14T18:01:00.000Z",
        runId: "pi-sdk-turn-1",
        promptTitle: "Implement spec",
        promptText: "Apply the requested change."
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "idle_timeout_triggered",
        sequence: 3,
        recordedAt: "2026-04-14T18:01:05.000Z",
        runId: "pi-sdk-turn-1",
        failureClass: "model_idle_timeout",
        thresholdMs: 30_000,
        lastActivityAt: "2026-04-14T18:00:35.000Z",
        lastActivityType: "assistant_text_delta"
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "terminal_result",
        sequence: 4,
        recordedAt: "2026-04-14T18:01:05.100Z",
        runId: "pi-sdk-turn-1",
        result: {
          schemaVersion: "1",
          kind: "failed",
          stopReason: null,
          providerStopReason: null,
          finalAssistantMessage: null,
          usage: null,
          lastActivityAt: "2026-04-14T18:00:35.000Z",
          lastActivityType: "assistant_text_delta",
          failureClass: "model_idle_timeout",
          reason: "Pi SDK runner idled for 30000ms without visible activity."
        }
      });

    startMock.mockResolvedValue({
      process: {
        processId: "1234",
        sendCommand: vi.fn(),
        awaitEvent,
        close: vi.fn()
      },
      hostLaunchPath: packageRoot,
      runtimeWorkspacePath: "/workspace/packages/agent-harnesses",
      runtimeWorkspaceRoot: "/workspace"
    });

    const session = await PiSdkRunnerClient.startSession({
      launchTarget: {
        kind: "container",
        hostLaunchPath: packageRoot,
        hostWorkspacePath: repoRoot,
        runtimeWorkspacePath: "/workspace/packages/agent-harnesses",
        containerId: "container-1",
        containerName: "symphony-col-123",
        shell: "sh",
        user: "1000:1000"
      },
      env: {},
      hostCommandEnvSource,
      runtimePolicy: createRuntimePolicy(),
      issue: createIssue(),
      logger: {
        debug() {},
        warn() {},
        error() {}
      }
    });

    const result = await session.client.runTurn(session, {
      prompt: "Apply the requested change.",
      title: "Implement spec",
      onMessage() {},
      turnTimeoutMs: 30_000
    });

    expect(result).toEqual({
      kind: "failed",
      threadId: "sdk-bootstrap-SYM-42-session",
      turnId: "pi-sdk-turn-1",
      usage: null,
      reason: "Pi SDK runner idled for 30000ms without visible activity.",
      failureClass: "model_idle_timeout",
      detail: {
        result: expect.objectContaining({
          failureClass: "model_idle_timeout"
        }),
        timeoutTriggerEvent: expect.objectContaining({
          eventType: "idle_timeout_triggered",
          thresholdMs: 30_000,
          lastActivityAt: "2026-04-14T18:00:35.000Z",
          lastActivityType: "assistant_text_delta"
        })
      }
    });
  });

  it("emits command progress updates for tool heartbeats", async () => {
    const awaitEvent = vi
      .fn()
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "session_started",
        sequence: 1,
        recordedAt: "2026-04-14T18:00:00.000Z",
        runId: "sdk-bootstrap-SYM-42-run",
        sessionId: "sdk-bootstrap-SYM-42-session",
        threadId: null,
        modelId: "xiaomi/mimo-v2-pro",
        cwd: "/workspace/packages/agent-harnesses"
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "prompt_started",
        sequence: 2,
        recordedAt: "2026-04-14T18:01:00.000Z",
        runId: "pi-sdk-turn-1",
        promptTitle: "Implement spec",
        promptText: "Apply the requested change."
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "tool_call_started",
        sequence: 3,
        recordedAt: "2026-04-14T18:01:01.000Z",
        runId: "pi-sdk-turn-1",
        callId: "tool-bash-1",
        toolName: "bash",
        argumentsText: "{\"command\":\"pnpm build\"}"
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "command_started",
        sequence: 4,
        recordedAt: "2026-04-14T18:01:01.010Z",
        runId: "pi-sdk-turn-1",
        commandId: "tool-bash-1",
        commandText: "pnpm build",
        workingDirectory: "/workspace"
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "tool_call_heartbeat",
        sequence: 5,
        recordedAt: "2026-04-14T18:01:31.000Z",
        runId: "pi-sdk-turn-1",
        callId: "tool-bash-1",
        toolName: "bash",
        argumentsText: "{\"command\":\"pnpm build\"}",
        commandText: "pnpm build",
        elapsedMs: 30000,
        heartbeatIntervalMs: 30000,
        timeoutMs: 900000
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "tool_call_completed",
        sequence: 6,
        recordedAt: "2026-04-14T18:01:40.000Z",
        runId: "pi-sdk-turn-1",
        callId: "tool-bash-1",
        toolName: "bash",
        outputText: "Build passed."
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "command_completed",
        sequence: 7,
        recordedAt: "2026-04-14T18:01:40.010Z",
        runId: "pi-sdk-turn-1",
        commandId: "tool-bash-1",
        commandText: "pnpm build",
        exitCode: 0,
        stdout: "Build passed.",
        stderr: null
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "terminal_result",
        sequence: 8,
        recordedAt: "2026-04-14T18:01:41.000Z",
        runId: "pi-sdk-turn-1",
        result: {
          schemaVersion: "1",
          kind: "completed",
          stopReason: "end_turn",
          providerStopReason: "stop",
          finalAssistantMessage: "Implemented the change.",
          usage: {
            inputTokens: 11,
            cachedInputTokens: 2,
            outputTokens: 7,
            totalTokens: 20
          },
          lastActivityAt: "2026-04-14T18:01:40.010Z",
          lastActivityType: "command_completed"
        }
      });

    startMock.mockResolvedValue({
      process: {
        processId: "1234",
        sendCommand: vi.fn(),
        awaitEvent,
        close: vi.fn()
      },
      hostLaunchPath: packageRoot,
      runtimeWorkspacePath: "/workspace/packages/agent-harnesses",
      runtimeWorkspaceRoot: "/workspace"
    });

    const session = await PiSdkRunnerClient.startSession({
      launchTarget: {
        kind: "container",
        hostLaunchPath: packageRoot,
        hostWorkspacePath: repoRoot,
        runtimeWorkspacePath: "/workspace/packages/agent-harnesses",
        containerId: "container-1",
        containerName: "symphony-col-123",
        shell: "sh",
        user: "1000:1000"
      },
      env: {},
      hostCommandEnvSource,
      runtimePolicy: createRuntimePolicy(),
      issue: createIssue(),
      logger: {
        debug() {},
        warn() {},
        error() {}
      }
    });

    const updates: Array<Record<string, unknown>> = [];
    const result = await session.client.runTurn(session, {
      prompt: "Apply the requested change.",
      title: "Implement spec",
      onMessage(update) {
        updates.push(update.event);
      },
      turnTimeoutMs: 30_000
    });

    expect(result.kind).toBe("completed");
    expect(updates).toContainEqual({
      type: "item.updated",
      item: {
        id: "tool-bash-1",
        type: "command_execution",
        command: "pnpm build",
        aggregated_output: "Still running after 30000ms.",
        status: "in_progress"
      }
    });
  });

  it("preserves timeout trigger metadata on tool-timeout terminal failures", async () => {
    const awaitEvent = vi
      .fn()
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "session_started",
        sequence: 1,
        recordedAt: "2026-04-14T18:00:00.000Z",
        runId: "sdk-bootstrap-SYM-42-run",
        sessionId: "sdk-bootstrap-SYM-42-session",
        threadId: null,
        modelId: "xiaomi/mimo-v2-pro",
        cwd: "/workspace/packages/agent-harnesses"
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "prompt_started",
        sequence: 2,
        recordedAt: "2026-04-14T18:01:00.000Z",
        runId: "pi-sdk-turn-1",
        promptTitle: "Implement spec",
        promptText: "Apply the requested change."
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "tool_timeout_triggered",
        sequence: 3,
        recordedAt: "2026-04-14T18:16:00.000Z",
        runId: "pi-sdk-turn-1",
        failureClass: "tool_timeout",
        thresholdMs: 900000,
        callId: "tool-bash-1",
        toolName: "bash",
        commandText: "pnpm build",
        lastActivityAt: "2026-04-14T18:15:30.000Z",
        lastActivityType: "tool_call_heartbeat"
      })
      .mockResolvedValueOnce({
        schemaVersion: "1",
        eventType: "terminal_result",
        sequence: 4,
        recordedAt: "2026-04-14T18:16:00.100Z",
        runId: "pi-sdk-turn-1",
        result: {
          schemaVersion: "1",
          kind: "failed",
          stopReason: null,
          providerStopReason: null,
          finalAssistantMessage: null,
          usage: null,
          lastActivityAt: "2026-04-14T18:15:30.000Z",
          lastActivityType: "tool_call_heartbeat",
          failureClass: "tool_timeout",
          reason:
            "Pi SDK runner exceeded the 900000ms tool timeout while waiting for bash command \"pnpm build\"."
        }
      });

    startMock.mockResolvedValue({
      process: {
        processId: "1234",
        sendCommand: vi.fn(),
        awaitEvent,
        close: vi.fn()
      },
      hostLaunchPath: packageRoot,
      runtimeWorkspacePath: "/workspace/packages/agent-harnesses",
      runtimeWorkspaceRoot: "/workspace"
    });

    const session = await PiSdkRunnerClient.startSession({
      launchTarget: {
        kind: "container",
        hostLaunchPath: packageRoot,
        hostWorkspacePath: repoRoot,
        runtimeWorkspacePath: "/workspace/packages/agent-harnesses",
        containerId: "container-1",
        containerName: "symphony-col-123",
        shell: "sh",
        user: "1000:1000"
      },
      env: {},
      hostCommandEnvSource,
      runtimePolicy: createRuntimePolicy(),
      issue: createIssue(),
      logger: {
        debug() {},
        warn() {},
        error() {}
      }
    });

    const result = await session.client.runTurn(session, {
      prompt: "Apply the requested change.",
      title: "Implement spec",
      onMessage() {},
      turnTimeoutMs: 30_000
    });

    expect(result).toEqual({
      kind: "failed",
      threadId: "sdk-bootstrap-SYM-42-session",
      turnId: "pi-sdk-turn-1",
      usage: null,
      reason:
        "Pi SDK runner exceeded the 900000ms tool timeout while waiting for bash command \"pnpm build\".",
      failureClass: "tool_timeout",
      detail: {
        result: expect.objectContaining({
          failureClass: "tool_timeout"
        }),
        timeoutTriggerEvent: expect.objectContaining({
          eventType: "tool_timeout_triggered",
          thresholdMs: 900000,
          callId: "tool-bash-1",
          toolName: "bash",
          lastActivityType: "tool_call_heartbeat"
        })
      }
    });
  });
});
