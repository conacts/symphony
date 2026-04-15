import { randomUUID } from "node:crypto";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import {
  HarnessSessionError,
  type HarnessRuntimeUpdate,
  type HarnessLaunchSessionInput,
  type HarnessSession,
  type HarnessSessionClient,
  type HarnessTurnResult
} from "../shared/session-types.js";
import { resolveHarnessModelRuntimePolicy } from "../shared/runtime-policy.js";
import { resolvePiIssueSelection } from "./model-selection.js";
import {
  type PiSdkRunnerCommand,
  type PiSdkRunnerEvent,
  parsePiSdkRunnerEvent,
  type PiSdkRunnerInput
} from "./sdk-runner-contract.js";
import { PiSdkRunnerProcess } from "./sdk-runner-process.js";

type SpawnSpecOverride = {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  hostLaunchPath: string;
  runtimeWorkspacePath: string;
  runtimeWorkspaceRoot?: string;
};

export class PiSdkRunnerClient implements HarnessSessionClient {
  readonly #process: PiSdkRunnerProcess;
  readonly #readTimeoutMs: number;
  readonly #stallTimeoutMs: number;
  readonly #toolTimeoutMs: number | null;
  #threadStartedEmitted = false;
  #turnSequence = 0;

  constructor(input: {
    process: PiSdkRunnerProcess;
    readTimeoutMs: number;
    stallTimeoutMs: number;
    toolTimeoutMs: number | null;
  }) {
    this.#process = input.process;
    this.#readTimeoutMs = input.readTimeoutMs;
    this.#stallTimeoutMs = input.stallTimeoutMs;
    this.#toolTimeoutMs = input.toolTimeoutMs;
  }

  static async startSession(
    input: HarnessLaunchSessionInput,
    options?: {
      spawnSpecOverride?: SpawnSpecOverride;
    }
  ): Promise<HarnessSession> {
    const modelPolicy = resolveHarnessModelRuntimePolicy(input.runtimePolicy);
    const selection = resolvePiIssueSelection(input.issue, {
      model: modelPolicy.defaultModel,
      reasoningEffort: modelPolicy.defaultReasoningEffort,
      defaultPreset: modelPolicy.defaultPreset,
      presets: modelPolicy.presets
    });
    const started = await PiSdkRunnerProcess.start(input, {
      spawnSpecOverride: options?.spawnSpecOverride
    });
    const client = new PiSdkRunnerClient({
      process: started.process,
      readTimeoutMs: input.runtimePolicy.pi.readTimeoutMs,
      stallTimeoutMs: input.runtimePolicy.pi.stallTimeoutMs,
      toolTimeoutMs: input.runtimePolicy.pi.toolTimeoutMs
    });

    try {
      const runnerInput = buildPiSdkRunnerBootstrapInput({
        issue: input.issue,
        runtimeWorkspacePath: started.runtimeWorkspacePath,
        runtimeWorkspaceRoot: started.runtimeWorkspaceRoot,
        selection,
        providerId:
          selection.authMode === "provider"
            ? (modelPolicy.provider?.id ?? null)
            : null,
        providerName:
          selection.authMode === "provider"
            ? (modelPolicy.provider?.name ?? null)
            : null
      });
      started.process.sendCommand(
        buildPiSdkRunnerBootstrapCommand(runnerInput)
      );

      const firstEvent = await awaitSessionStartedEvent({
        process: started.process,
        timeoutMs: input.runtimePolicy.agentRuntime.readTimeoutMs
      });

      if (firstEvent.eventType !== "session_started") {
        throw new HarnessSessionError(
          "pi_sdk_runner_initialize_failed",
          `Expected the Pi SDK runner to emit session_started first, received ${firstEvent.eventType}.`,
          firstEvent
        );
      }

      return {
        client,
        threadId: firstEvent.threadId ?? firstEvent.sessionId,
        workspacePath: started.runtimeWorkspacePath,
        hostLaunchPath: started.hostLaunchPath,
        hostWorkspacePath: input.launchTarget.hostWorkspacePath,
        launchTarget: input.launchTarget,
        issue: input.issue,
        processId: started.process.processId,
        autoApproveRequests:
          input.runtimePolicy.agentRuntime.approvalPolicy === "never",
        approvalPolicy: input.runtimePolicy.agentRuntime.approvalPolicy,
        model: selection.model,
        reasoningEffort: selection.reasoningEffort,
        profile: modelPolicy.profile ?? null,
        providerId:
          selection.authMode === "provider"
            ? (modelPolicy.provider?.id ?? null)
            : null,
        providerName:
          selection.authMode === "provider"
            ? (modelPolicy.provider?.name ?? null)
            : null
      };
    } catch (error) {
      started.process.close();
      throw error;
    }
  }

  close(): void {
    this.#process.close();
  }

  async runTurn(
    session: HarnessSession,
    input: Parameters<HarnessSessionClient["runTurn"]>[1]
  ): Promise<HarnessTurnResult> {
    this.#turnSequence += 1;
    const turnId = `pi-sdk-turn-${this.#turnSequence}`;
    const threadState = createThreadItemState();
    let timeoutTriggerEvent: PiSdkRunnerTimeoutTriggerEvent | null = null;

    if (!this.#threadStartedEmitted) {
      this.#threadStartedEmitted = true;
      await input.onMessage({
        event: {
          type: "thread.started",
          thread_id: session.threadId
        }
      });
    }

    this.#process.sendCommand(
      buildPiSdkRunnerRunTurnCommand({
        turnId,
        promptTitle: input.title,
        promptText: input.prompt,
        turnTimeoutMs: input.turnTimeoutMs,
        stallTimeoutMs: this.#stallTimeoutMs,
        toolTimeoutMs:
          this.#toolTimeoutMs === null
            ? null
            : Math.min(this.#toolTimeoutMs, input.turnTimeoutMs)
      })
    );

    while (true) {
      let event: PiSdkRunnerEvent;
      try {
        event = await this.#process.awaitEvent(this.#readTimeoutMs);
      } catch (error) {
        if (
          error instanceof HarnessSessionError &&
          error.code === "pi_sdk_runner_timeout"
        ) {
          const timeoutError = new HarnessSessionError(
            "pi_sdk_runner_transport_timeout",
            `Timed out waiting for Pi SDK bridge output after ${this.#readTimeoutMs}ms.`,
            {
              transportTimeoutMs: this.#readTimeoutMs,
              diagnostics: this.#process.diagnosticsSnapshot()
            }
          );
          await emitTurnFailed(input.onMessage, timeoutError.message, timeoutError.detail);
          throw timeoutError;
        }

        throw error;
      }

      switch (event.eventType) {
        case "prompt_started":
          await input.onMessage({
            event: {
              type: "turn.started"
            },
            rawPayload: event
          });
          break;
        case "assistant_message_started":
          markAssistantMessage(event, threadState);
          break;
        case "assistant_text_delta":
          await emitAssistantTextDelta(input.onMessage, threadState, event);
          break;
        case "assistant_reasoning_delta":
          await emitAssistantReasoningDelta(input.onMessage, threadState, event);
          break;
        case "tool_call_started":
          await emitToolCallStarted(input.onMessage, threadState, event);
          break;
        case "tool_call_completed":
          await emitToolCallCompleted(input.onMessage, threadState, event);
          break;
        case "tool_call_heartbeat":
          await emitToolCallHeartbeat(input.onMessage, threadState, event);
          break;
        case "tool_call_failed":
          await emitToolCallFailed(input.onMessage, threadState, event);
          break;
        case "command_started":
          await emitCommandStarted(input.onMessage, event);
          break;
        case "command_completed":
          await emitCommandCompleted(input.onMessage, event);
          break;
        case "command_failed":
          await emitCommandFailed(input.onMessage, event);
          break;
        case "file_change_observed":
          await emitFileChangeObserved(input.onMessage, event);
          break;
        case "idle_timeout_triggered":
        case "run_timeout_triggered":
        case "tool_timeout_triggered":
          timeoutTriggerEvent = event;
          break;
        case "terminal_result":
          return await finalizeTerminalResult({
            session,
            turnId,
            threadState,
            resultEvent: event,
            timeoutTriggerEvent,
            onMessage: input.onMessage
          });
        case "runner_error":
          await emitTurnFailed(input.onMessage, event.reason, event);
          throw new HarnessSessionError(
            "pi_sdk_runner_failed",
            event.reason,
            {
              event,
              diagnostics: this.#process.diagnosticsSnapshot()
            }
          );
        default:
          break;
      }
    }
  }
}

type PiSdkThreadItemState = {
  agentMessages: Map<string, string>;
  reasoningMessages: Map<string, string>;
  seenAssistantMessages: Set<string>;
  toolCallArguments: Map<string, unknown>;
};

type PiSdkRunnerTimeoutTriggerEvent = Extract<
  PiSdkRunnerEvent,
  {
    eventType:
      | "idle_timeout_triggered"
      | "run_timeout_triggered"
      | "tool_timeout_triggered";
  }
>;

function buildPiSdkRunnerBootstrapInput(input: {
  issue: SymphonyTrackerIssue;
  runtimeWorkspacePath: string;
  runtimeWorkspaceRoot: string;
  selection: ReturnType<typeof resolvePiIssueSelection>;
  providerId: string | null;
  providerName: string | null;
}): PiSdkRunnerInput {
  return {
    schemaVersion: "1",
    runId: `sdk-bootstrap-${input.issue.identifier}-${randomUUID()}`,
    issue: {
      id: input.issue.id,
      identifier: input.issue.identifier,
      title: input.issue.title
    },
    workspace: {
      cwd: input.runtimeWorkspacePath,
      sessionFile: `${input.runtimeWorkspaceRoot}/.symphony/runtime/pi-sdk-session.jsonl`,
      agentDir: null
    },
    prompt: {
      title: "Initialize Pi SDK runner",
      text: "Initialize the Pi SDK runner session."
    },
    model: {
      id: input.selection.model,
      reasoningEffort: input.selection.reasoningEffort,
      profile: null,
      providerId: input.providerId,
      providerName: input.providerName
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
  };
}

function buildPiSdkRunnerBootstrapCommand(
  runnerInput: PiSdkRunnerInput
): PiSdkRunnerCommand {
  return {
    schemaVersion: "1",
    commandType: "bootstrap",
    input: runnerInput
  };
}

function buildPiSdkRunnerRunTurnCommand(input: {
  turnId: string;
  promptTitle: string;
  promptText: string;
  turnTimeoutMs: number;
  stallTimeoutMs: number;
  toolTimeoutMs: number | null;
}): PiSdkRunnerCommand {
  return {
    schemaVersion: "1",
    commandType: "run_turn",
    runId: input.turnId,
    turnId: input.turnId,
    prompt: {
      title: input.promptTitle,
      text: input.promptText
    },
    timeouts: {
      runTimeoutMs: input.turnTimeoutMs,
      modelIdleTimeoutMs: input.stallTimeoutMs,
      toolTimeoutMs: input.toolTimeoutMs
    },
    executionPolicy: {
      emitReasoning: true
    }
  };
}

export function parsePiSdkRunnerBootstrapEvent(value: unknown) {
  return parsePiSdkRunnerEvent(value);
}

async function awaitSessionStartedEvent(input: {
  process: PiSdkRunnerProcess;
  timeoutMs: number;
}) {
  const deadline = Date.now() + input.timeoutMs;
  let lastEvent: ReturnType<typeof parsePiSdkRunnerEvent> | null = null;

  while (Date.now() < deadline) {
    const remainingMs = Math.max(1, deadline - Date.now());
    try {
      const event = await input.process.awaitEvent(remainingMs);
      if (event.eventType === "session_started") {
        return event;
      }
      if (event.eventType === "runner_error") {
        throw new HarnessSessionError(
          "pi_sdk_runner_initialize_failed",
          event.reason,
          event
        );
      }
      lastEvent = event;
    } catch (error) {
      if (
        error instanceof HarnessSessionError &&
        error.code === "pi_sdk_runner_timeout" &&
        lastEvent !== null
      ) {
        return lastEvent;
      }
      throw error;
    }
  }

  if (lastEvent !== null) {
    return lastEvent;
  }

  throw new HarnessSessionError(
    "pi_sdk_runner_initialize_timeout",
    `Timed out waiting for Pi SDK runner startup after ${input.timeoutMs}ms.`,
    {
      transportTimeoutMs: input.timeoutMs,
      diagnostics: input.process.diagnosticsSnapshot()
    }
  );
}

function createThreadItemState(): PiSdkThreadItemState {
  return {
    agentMessages: new Map(),
    reasoningMessages: new Map(),
    seenAssistantMessages: new Set(),
    toolCallArguments: new Map()
  };
}

function markAssistantMessage(
  event: Extract<PiSdkRunnerEvent, { eventType: "assistant_message_started" }>,
  state: PiSdkThreadItemState
): void {
  state.seenAssistantMessages.add(event.messageId);
}

async function emitAssistantTextDelta(
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void,
  state: PiSdkThreadItemState,
  event: Extract<PiSdkRunnerEvent, { eventType: "assistant_text_delta" }>
): Promise<void> {
  const previous = state.agentMessages.get(event.messageId) ?? "";

  if (!state.agentMessages.has(event.messageId)) {
    await onMessage({
      event: {
        type: "item.started",
        item: {
          id: event.messageId,
          type: "agent_message",
          text: ""
        }
      }
    });
  }

  const next = previous + event.text;
  state.agentMessages.set(event.messageId, next);
  await onMessage({
    event: {
      type: "item.updated",
      item: {
        id: event.messageId,
        type: "agent_message",
        text: next
      }
    },
    rawPayload: event
  });
}

async function emitAssistantReasoningDelta(
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void,
  state: PiSdkThreadItemState,
  event: Extract<PiSdkRunnerEvent, { eventType: "assistant_reasoning_delta" }>
): Promise<void> {
  const reasoningId = `${event.messageId}:reasoning`;
  const previous = state.reasoningMessages.get(reasoningId) ?? "";

  if (!state.reasoningMessages.has(reasoningId)) {
    await onMessage({
      event: {
        type: "item.started",
        item: {
          id: reasoningId,
          type: "reasoning",
          text: ""
        }
      }
    });
  }

  const next = previous + event.text;
  state.reasoningMessages.set(reasoningId, next);
  await onMessage({
    event: {
      type: "item.updated",
      item: {
        id: reasoningId,
        type: "reasoning",
        text: next
      }
    },
    rawPayload: event
  });
}

async function finalizeTerminalResult(input: {
  session: HarnessSession;
  turnId: string;
  threadState: PiSdkThreadItemState;
  resultEvent: Extract<PiSdkRunnerEvent, { eventType: "terminal_result" }>;
  timeoutTriggerEvent: PiSdkRunnerTimeoutTriggerEvent | null;
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void;
}): Promise<HarnessTurnResult> {
  const usage = toHarnessUsage(input.resultEvent.result.usage);

  switch (input.resultEvent.result.kind) {
    case "completed":
      await emitCompletedAssistantItems(
        input.onMessage,
        input.threadState,
        input.resultEvent
      );
      if (usage) {
        await input.onMessage({
          event: {
            type: "turn.completed",
            usage
          },
          rawPayload: input.resultEvent
        });
      }
      return {
        kind: "completed",
        threadId: input.session.threadId,
        turnId: input.turnId,
        usage: usage ?? null
      };
    case "awaiting_input":
      await emitTurnFailed(
        input.onMessage,
        input.resultEvent.result.reason,
        input.resultEvent
      );
      return {
        kind: "awaiting_input",
        threadId: input.session.threadId,
        turnId: input.turnId,
        usage: usage ?? null,
        reason: input.resultEvent.result.reason,
        prompt: input.resultEvent.result.prompt,
        detail: input.resultEvent.result
      };
    case "blocked":
      await emitTurnFailed(
        input.onMessage,
        input.resultEvent.result.reason,
        input.resultEvent
      );
      return {
        kind: "blocked",
        threadId: input.session.threadId,
        turnId: input.turnId,
        usage: usage ?? null,
        reason: input.resultEvent.result.reason,
        detail: input.resultEvent.result
      };
    case "failed":
      await emitTurnFailed(
        input.onMessage,
        input.resultEvent.result.reason,
        input.resultEvent
      );
      return {
        kind: "failed",
        threadId: input.session.threadId,
        turnId: input.turnId,
        usage: usage ?? null,
        reason: input.resultEvent.result.reason,
        failureClass: input.resultEvent.result.failureClass,
        detail: buildFailedTurnDetail({
          result: input.resultEvent.result,
          timeoutTriggerEvent: input.timeoutTriggerEvent
        })
      };
  }

  throw new HarnessSessionError(
    "pi_sdk_runner_failed",
    "Pi SDK runner returned an unsupported terminal result.",
    input.resultEvent.result
  );
}

async function emitCompletedAssistantItems(
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void,
  state: PiSdkThreadItemState,
  resultEvent: Extract<PiSdkRunnerEvent, { eventType: "terminal_result" }>
): Promise<void> {
  const completedAgentMessages =
    state.agentMessages.size > 0
      ? [...state.agentMessages.entries()]
      : resultEvent.result.finalAssistantMessage
        ? [
            [
              resolveFinalAssistantMessageId(state, resultEvent),
              resultEvent.result.finalAssistantMessage
            ] as const
          ]
        : [];

  for (const [messageId, text] of completedAgentMessages) {
    await onMessage({
      event: {
        type: "item.completed",
        item: {
          id: messageId,
          type: "agent_message",
          text
        }
      },
      rawPayload: resultEvent
    });
  }

  for (const [reasoningId, text] of state.reasoningMessages.entries()) {
    await onMessage({
      event: {
        type: "item.completed",
        item: {
          id: reasoningId,
          type: "reasoning",
          text
        }
      },
      rawPayload: resultEvent
    });
  }
}

async function emitTurnFailed(
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void,
  message: string,
  rawPayload: unknown
): Promise<void> {
  await onMessage({
    event: {
      type: "turn.failed",
      error: {
        message
      }
    },
    rawPayload
  });
}

function toHarnessUsage(
  usage: Extract<
    PiSdkRunnerEvent,
    { eventType: "terminal_result" }
  >["result"]["usage"]
): HarnessTurnResult["usage"] {
  if (!usage || !("inputTokens" in usage)) {
    return null;
  }

  return {
    input_tokens: usage.inputTokens,
    cached_input_tokens: usage.cachedInputTokens,
    output_tokens: usage.outputTokens
  };
}

function buildFailedTurnDetail(input: {
  result: Extract<PiSdkRunnerEvent, { eventType: "terminal_result" }>["result"];
  timeoutTriggerEvent: PiSdkRunnerTimeoutTriggerEvent | null;
}) {
  return input.timeoutTriggerEvent
    ? {
        result: input.result,
        timeoutTriggerEvent: input.timeoutTriggerEvent
      }
    : input.result;
}

async function emitToolCallStarted(
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void,
  state: PiSdkThreadItemState,
  event: Extract<PiSdkRunnerEvent, { eventType: "tool_call_started" }>
): Promise<void> {
  if (event.toolName === "bash") {
    return;
  }

  const parsedArguments = parseToolArguments(event.argumentsText);
  state.toolCallArguments.set(event.callId, parsedArguments);

  await onMessage({
    event: {
      type: "item.started",
      item: {
        id: event.callId,
        type: "mcp_tool_call",
        server: "pi",
        tool: event.toolName,
        arguments: parsedArguments,
        status: "in_progress"
      }
    },
    rawPayload: event
  });
}

async function emitToolCallCompleted(
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void,
  state: PiSdkThreadItemState,
  event: Extract<PiSdkRunnerEvent, { eventType: "tool_call_completed" }>
): Promise<void> {
  if (event.toolName === "bash") {
    return;
  }

  const argumentsValue = state.toolCallArguments.get(event.callId) ?? {};
  state.toolCallArguments.delete(event.callId);

  await onMessage({
    event: {
      type: "item.completed",
      item: {
        id: event.callId,
        type: "mcp_tool_call",
        server: "pi",
        tool: event.toolName,
        arguments: argumentsValue,
        status: "completed",
        ...(event.outputText === null
          ? {}
          : {
              result: {
                content: [
                  {
                    type: "text",
                    text: event.outputText
                  }
                ],
                structured_content: null
              }
            })
      }
    },
    rawPayload: event
  });
}

async function emitToolCallHeartbeat(
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void,
  state: PiSdkThreadItemState,
  event: Extract<PiSdkRunnerEvent, { eventType: "tool_call_heartbeat" }>
): Promise<void> {
  if (event.toolName === "bash") {
    await onMessage({
      event: {
        type: "item.updated",
        item: {
          id: event.callId,
          type: "command_execution",
          command: event.commandText ?? "bash",
          aggregated_output: `Still running after ${event.elapsedMs}ms.`,
          status: "in_progress"
        }
      },
      rawPayload: event
    });
    return;
  }

  await onMessage({
    event: {
      type: "item.updated",
      item: {
        id: event.callId,
        type: "mcp_tool_call",
        server: "pi",
        tool: event.toolName,
        arguments:
          state.toolCallArguments.get(event.callId) ??
          parseToolArguments(event.argumentsText),
        status: "in_progress"
      }
    },
    rawPayload: event
  });
}

async function emitToolCallFailed(
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void,
  state: PiSdkThreadItemState,
  event: Extract<PiSdkRunnerEvent, { eventType: "tool_call_failed" }>
): Promise<void> {
  if (event.toolName === "bash") {
    return;
  }

  const argumentsValue = state.toolCallArguments.get(event.callId) ?? {};
  state.toolCallArguments.delete(event.callId);

  await onMessage({
    event: {
      type: "item.completed",
      item: {
        id: event.callId,
        type: "mcp_tool_call",
        server: "pi",
        tool: event.toolName,
        arguments: argumentsValue,
        status: "failed",
        ...(event.outputText === null
          ? {}
          : {
              result: {
                content: [
                  {
                    type: "text",
                    text: event.outputText
                  }
                ],
                structured_content: null
              }
            }),
        error: {
          message: event.errorMessage
        }
      }
    },
    rawPayload: event
  });
}

async function emitCommandStarted(
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void,
  event: Extract<PiSdkRunnerEvent, { eventType: "command_started" }>
): Promise<void> {
  await onMessage({
    event: {
      type: "item.started",
      item: {
        id: event.commandId,
        type: "command_execution",
        command: event.commandText,
        aggregated_output: "",
        status: "in_progress"
      }
    },
    rawPayload: event
  });
}

async function emitCommandCompleted(
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void,
  event: Extract<PiSdkRunnerEvent, { eventType: "command_completed" }>
): Promise<void> {
  await onMessage({
    event: {
      type: "item.completed",
      item: {
        id: event.commandId,
        type: "command_execution",
        command: event.commandText,
        aggregated_output: joinCommandOutput(event.stdout, event.stderr),
        exit_code: event.exitCode,
        status: "completed"
      }
    },
    rawPayload: event
  });
}

async function emitCommandFailed(
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void,
  event: Extract<PiSdkRunnerEvent, { eventType: "command_failed" }>
): Promise<void> {
  await onMessage({
    event: {
      type: "item.completed",
      item: {
        id: event.commandId,
        type: "command_execution",
        command: event.commandText,
        aggregated_output:
          joinCommandOutput(event.stdout, event.stderr) || event.reason,
        ...(event.exitCode === null ? {} : { exit_code: event.exitCode }),
        status: "failed"
      }
    },
    rawPayload: event
  });
}

async function emitFileChangeObserved(
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void,
  event: Extract<PiSdkRunnerEvent, { eventType: "file_change_observed" }>
): Promise<void> {
  await onMessage({
    event: {
      type: "item.completed",
      item: {
        id: `pi-file-change:${event.runId}:${event.sequence}`,
        type: "file_change",
        changes: [
          {
            path: event.path,
            kind: mapFileChangeKind(event.changeType)
          }
        ],
        status: "completed"
      }
    },
    rawPayload: event
  });
}

function resolveFinalAssistantMessageId(
  state: PiSdkThreadItemState,
  resultEvent: Extract<PiSdkRunnerEvent, { eventType: "terminal_result" }>
): string {
  const lastSeenMessageId = [...state.seenAssistantMessages].at(-1);
  return lastSeenMessageId ?? `${resultEvent.runId}:assistant`;
}

function parseToolArguments(argumentsText: string | null): unknown {
  if (argumentsText === null) {
    return {};
  }

  try {
    return JSON.parse(argumentsText);
  } catch {
    return {
      raw: argumentsText
    };
  }
}

function joinCommandOutput(
  stdout: string | null,
  stderr: string | null
): string {
  return [stdout, stderr]
    .filter((value): value is string => typeof value === "string" && value !== "")
    .join("\n");
}

function mapFileChangeKind(
  changeType: Extract<
    PiSdkRunnerEvent,
    { eventType: "file_change_observed" }
  >["changeType"]
): "add" | "delete" | "update" {
  switch (changeType) {
    case "added":
      return "add";
    case "deleted":
      return "delete";
    case "modified":
    default:
      return "update";
  }
}
