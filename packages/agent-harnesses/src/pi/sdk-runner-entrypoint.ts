import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { AgentSession, AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
  SettingsManager
} from "@mariozechner/pi-coding-agent";
import type { Api, AssistantMessage, Model, StopReason, TextContent } from "@mariozechner/pi-ai";
import { normalizePiThinkingLevel } from "./model-selection.js";
import {
  parsePiSdkRunnerCommand,
  type PiSdkRunnerCommand,
  type PiSdkRunnerEvent,
  type PiSdkRunnerFailureClass,
  type PiSdkRunnerInput,
  type PiSdkRunnerTerminalResult,
  type PiSdkRunnerUsage
} from "./sdk-runner-contract.js";

type PiSdkRunnerSession = {
  abort: AgentSession["abort"];
  dispose: AgentSession["dispose"];
  prompt: AgentSession["prompt"];
  state: {
    messages: AgentSession["state"]["messages"];
  };
  subscribe: AgentSession["subscribe"];
};

export type PiSdkRunnerRuntime = {
  bootstrap: PiSdkRunnerInput;
  resolvedAgentDir: string;
  model: Model<Api>;
  session: PiSdkRunnerSession;
  sessionId: string;
  threadId: string | null;
};

type PiSdkPromptExecutionState = {
  messageIds: Set<string>;
  toolCalls: Map<
    string,
    {
      toolName: string;
      args: unknown;
    }
  >;
  finalAssistantMessage: AssistantMessage | null;
  finalAssistantText: string | null;
  usage: PiSdkRunnerUsage | null;
  providerStopReason: string | null;
  lastActivityAt: string | null;
  lastActivityType: string | null;
};

type PiSdkTimeoutFailure = {
  failureClass: "model_idle_timeout" | "run_timeout";
  reason: string;
};

type PiSdkTimeoutController = {
  recordActivity(recordedAt: string, activityType: string): void;
  getTriggeredFailure(): PiSdkTimeoutFailure | null;
  dispose(): void;
};

let sequence = 0;

export async function runPiSdkRunnerFromStdio(): Promise<void> {
  let runtime: PiSdkRunnerRuntime | null = null;

  for await (const line of readStdinLines()) {
    if (line.trim() === "") {
      continue;
    }

    let command: PiSdkRunnerCommand;
    try {
      command = parseCommandLine(line);
    } catch (error) {
      emitRunnerError({
        runId: "runner-command-parse-failure",
        failureClass: "bridge_protocol_failure",
        reason:
          error instanceof Error ? error.message : String(error)
      });
      continue;
    }

    switch (command.commandType) {
      case "bootstrap":
        try {
          runtime = await bootstrapPiSdkRunner(command.input);
          emitEvent({
            schemaVersion: "1",
            eventType: "session_started",
            sequence: nextSequence(),
            recordedAt: new Date().toISOString(),
            runId: command.input.runId,
            sessionId: runtime.sessionId,
            threadId: runtime.threadId,
            modelId: command.input.model.id,
            cwd: command.input.workspace.cwd
          });
        } catch (error) {
          emitRunnerError({
            runId: command.input.runId,
            failureClass: "runner_startup_failure",
            reason:
              error instanceof Error ? error.message : String(error)
          });
          return;
        }
        break;
      case "run_turn":
        if (runtime === null) {
          emitTerminalFailure({
            runId: command.runId,
            failureClass: "bridge_protocol_failure",
            reason: "Pi SDK runner must be bootstrapped before run_turn."
          });
          break;
        }

        await executePiSdkRunnerTurn(runtime, command);
        break;
      case "shutdown":
        runtime?.session.dispose();
        return;
    }
  }

  runtime?.session.dispose();
}

export async function bootstrapPiSdkRunner(
  input: PiSdkRunnerInput
): Promise<PiSdkRunnerRuntime> {
  const resolvedAgentDir = resolveAgentDir(input.workspace.agentDir);
  const authStorage = AuthStorage.create(
    resolve(resolvedAgentDir, "auth.json")
  );
  const modelRegistry = ModelRegistry.create(
    authStorage,
    resolve(resolvedAgentDir, "models.json")
  );
  const settingsManager = SettingsManager.create(
    input.workspace.cwd,
    resolvedAgentDir
  );
  const resourceLoader = new DefaultResourceLoader({
    cwd: input.workspace.cwd,
    agentDir: resolvedAgentDir,
    settingsManager
  });
  await resourceLoader.reload();

  const model = resolveRunnerModel(input, modelRegistry);
  const thinkingLevel = (
    normalizePiThinkingLevel(input.model.reasoningEffort) ?? "medium"
  ) as ThinkingLevel;
  const sessionManager = SessionManager.open(
    input.workspace.sessionFile,
    dirname(input.workspace.sessionFile),
    input.workspace.cwd
  );
  const { session } = await createAgentSession({
    cwd: input.workspace.cwd,
    agentDir: resolvedAgentDir,
    authStorage,
    modelRegistry,
    model,
    thinkingLevel,
    sessionManager,
    settingsManager,
    resourceLoader
  });

  return {
    bootstrap: input,
    resolvedAgentDir,
    model,
    session,
    sessionId: session.sessionId,
    threadId: session.sessionId
  };
}

export async function executePiSdkRunnerTurn(
  runtime: PiSdkRunnerRuntime,
  command: Extract<PiSdkRunnerCommand, { commandType: "run_turn" }>
): Promise<void> {
  const promptStartedAt = new Date().toISOString();
  emitEvent({
    schemaVersion: "1",
    eventType: "prompt_started",
    sequence: nextSequence(),
    recordedAt: promptStartedAt,
    runId: command.runId,
    promptTitle: command.prompt.title,
    promptText: command.prompt.text
  });

  const executionState: PiSdkPromptExecutionState = {
    messageIds: new Set(),
    toolCalls: new Map(),
    finalAssistantMessage: null,
    finalAssistantText: null,
    usage: null,
    providerStopReason: null,
    lastActivityAt: promptStartedAt,
    lastActivityType: "prompt_started"
  };
  const timeoutController = createTimeoutController({
    runtime,
    command,
    executionState
  });
  const unsubscribe = runtime.session.subscribe((event) => {
    emitRuntimeEvent({
      runtime,
      command,
      executionState,
      timeoutController,
      event
    });
  });

  try {
    await runtime.session.prompt(command.prompt.text, {
      expandPromptTemplates: true,
      source: "rpc"
    });
    const triggeredFailure = timeoutController.getTriggeredFailure();
    if (triggeredFailure) {
      emitEvent({
        schemaVersion: "1",
        eventType: "terminal_result",
        sequence: nextSequence(),
        recordedAt: new Date().toISOString(),
        runId: command.runId,
        result: buildFailedTerminalResult({
          failureClass: triggeredFailure.failureClass,
          reason: triggeredFailure.reason,
          executionState
        })
      });
      return;
    }

    const finalAssistantMessage =
      executionState.finalAssistantMessage ??
      findLastAssistantMessage(runtime.session);
    const terminalResult = buildTerminalResult({
      executionState,
      finalAssistantMessage
    });

    emitEvent({
      schemaVersion: "1",
      eventType: "terminal_result",
      sequence: nextSequence(),
      recordedAt: new Date().toISOString(),
      runId: command.runId,
      result: terminalResult
    });
  } catch (error) {
    const triggeredFailure = timeoutController.getTriggeredFailure();
    if (triggeredFailure) {
      emitEvent({
        schemaVersion: "1",
        eventType: "terminal_result",
        sequence: nextSequence(),
        recordedAt: new Date().toISOString(),
        runId: command.runId,
        result: buildFailedTerminalResult({
          failureClass: triggeredFailure.failureClass,
          reason: triggeredFailure.reason,
          executionState
        })
      });
      return;
    }

    emitEvent({
      schemaVersion: "1",
      eventType: "terminal_result",
      sequence: nextSequence(),
      recordedAt: new Date().toISOString(),
      runId: command.runId,
      result: buildFailedTerminalResult({
        failureClass: "runtime_crash",
        reason: error instanceof Error ? error.message : String(error),
        executionState
      })
    });
  } finally {
    unsubscribe();
    timeoutController.dispose();
  }
}

function emitRuntimeEvent(input: {
  runtime: PiSdkRunnerRuntime;
  command: Extract<PiSdkRunnerCommand, { commandType: "run_turn" }>;
  executionState: PiSdkPromptExecutionState;
  timeoutController: PiSdkTimeoutController;
  event: AgentSessionEvent;
}): void {
  switch (input.event.type) {
    case "message_start":
      if (input.event.message.role !== "assistant") {
        return;
      }
      emitAssistantMessageStarted(
        input.command.runId,
        input.event.message,
        input.executionState,
        input.timeoutController
      );
      return;
    case "message_update":
      emitAssistantMessageUpdate({
        runId: input.command.runId,
        executionState: input.executionState,
        timeoutController: input.timeoutController,
        event: input.event
      });
      return;
    case "message_end":
      if (input.event.message.role !== "assistant") {
        return;
      }
      captureFinalAssistantMessage(input.executionState, input.event.message);
      return;
    case "tool_execution_start":
      input.executionState.toolCalls.set(input.event.toolCallId, {
        toolName: input.event.toolName,
        args: input.event.args
      });
      emitEventWithActivity(
        input.executionState,
        "tool_call_started",
        {
          schemaVersion: "1",
          eventType: "tool_call_started",
          sequence: nextSequence(),
          recordedAt: new Date().toISOString(),
          runId: input.command.runId,
          callId: input.event.toolCallId,
          toolName: input.event.toolName,
          argumentsText: stringifyJson(input.event.args)
        },
        input.timeoutController
      );
      if (input.event.toolName === "bash") {
        emitEventWithActivity(
          input.executionState,
          "command_started",
          {
            schemaVersion: "1",
            eventType: "command_started",
            sequence: nextSequence(),
            recordedAt: new Date().toISOString(),
            runId: input.command.runId,
            commandId: input.event.toolCallId,
            commandText: extractBashCommand(input.event.args),
            workingDirectory: input.runtime.bootstrap.workspace.cwd
          },
          input.timeoutController
        );
      }
      return;
    case "tool_execution_end": {
      const toolCall = input.executionState.toolCalls.get(input.event.toolCallId);
      input.executionState.toolCalls.delete(input.event.toolCallId);
      const outputText = extractToolResultText(input.event.result);

      if (input.event.isError) {
        emitEventWithActivity(
          input.executionState,
          "tool_call_failed",
          {
            schemaVersion: "1",
            eventType: "tool_call_failed",
            sequence: nextSequence(),
            recordedAt: new Date().toISOString(),
            runId: input.command.runId,
            callId: input.event.toolCallId,
            toolName: input.event.toolName,
            errorMessage:
              extractToolErrorMessage(input.event.result) ??
              "Pi tool execution failed.",
            outputText
          },
          input.timeoutController
        );

        if (input.event.toolName === "bash") {
          emitEventWithActivity(
            input.executionState,
            "command_failed",
            {
              schemaVersion: "1",
              eventType: "command_failed",
              sequence: nextSequence(),
              recordedAt: new Date().toISOString(),
              runId: input.command.runId,
              commandId: input.event.toolCallId,
              commandText: extractBashCommand(toolCall?.args),
              exitCode: parseBashExitCode(outputText),
              reason:
                extractToolErrorMessage(input.event.result) ??
                "Pi tool execution failed.",
              stdout: outputText,
              stderr: null
            },
            input.timeoutController
          );
        }
        return;
      }

      emitEventWithActivity(
        input.executionState,
        "tool_call_completed",
        {
          schemaVersion: "1",
          eventType: "tool_call_completed",
          sequence: nextSequence(),
          recordedAt: new Date().toISOString(),
          runId: input.command.runId,
          callId: input.event.toolCallId,
          toolName: input.event.toolName,
          outputText
        },
        input.timeoutController
      );

      if (input.event.toolName === "bash") {
        emitEventWithActivity(
          input.executionState,
          "command_completed",
          {
            schemaVersion: "1",
            eventType: "command_completed",
            sequence: nextSequence(),
            recordedAt: new Date().toISOString(),
            runId: input.command.runId,
            commandId: input.event.toolCallId,
            commandText: extractBashCommand(toolCall?.args),
            exitCode: 0,
            stdout: outputText,
            stderr: null
          },
          input.timeoutController
        );
      }

      const fileChangeEvent = buildFileChangeObservedEvent({
        runId: input.command.runId,
        toolName: input.event.toolName,
        args: toolCall?.args,
        result: input.event.result
      });
      if (fileChangeEvent) {
        emitEventWithActivity(
          input.executionState,
          "file_change_observed",
          fileChangeEvent,
          input.timeoutController
        );
      }
      return;
    }
    default:
      return;
  }
}

function emitAssistantMessageStarted(
  runId: string,
  message: AssistantMessage,
  executionState: PiSdkPromptExecutionState,
  timeoutController?: PiSdkTimeoutController
): void {
  const messageId = resolveAssistantMessageId(message);
  if (executionState.messageIds.has(messageId)) {
    return;
  }

  executionState.messageIds.add(messageId);
  emitEventWithActivity(
    executionState,
    "assistant_message_started",
    {
      schemaVersion: "1",
      eventType: "assistant_message_started",
      sequence: nextSequence(),
      recordedAt: new Date().toISOString(),
      runId,
      messageId
    },
    timeoutController
  );
}

function emitAssistantMessageUpdate(input: {
  runId: string;
  executionState: PiSdkPromptExecutionState;
  timeoutController: PiSdkTimeoutController;
  event: Extract<AgentSessionEvent, { type: "message_update" }>;
}): void {
  if (input.event.message.role !== "assistant") {
    return;
  }

  const messageId = resolveAssistantMessageId(input.event.message);
  if (!input.executionState.messageIds.has(messageId)) {
    emitAssistantMessageStarted(
      input.runId,
      input.event.message,
      input.executionState,
      input.timeoutController
    );
  }

  switch (input.event.assistantMessageEvent.type) {
    case "text_delta":
      emitEventWithActivity(
        input.executionState,
        "assistant_text_delta",
        {
          schemaVersion: "1",
          eventType: "assistant_text_delta",
          sequence: nextSequence(),
          recordedAt: new Date().toISOString(),
          runId: input.runId,
          messageId,
          text: input.event.assistantMessageEvent.delta
        },
        input.timeoutController
      );
      return;
    case "thinking_delta":
      emitEventWithActivity(
        input.executionState,
        "assistant_reasoning_delta",
        {
          schemaVersion: "1",
          eventType: "assistant_reasoning_delta",
          sequence: nextSequence(),
          recordedAt: new Date().toISOString(),
          runId: input.runId,
          messageId,
          text: input.event.assistantMessageEvent.delta
        },
        input.timeoutController
      );
      return;
    case "done":
      captureFinalAssistantMessage(
        input.executionState,
        input.event.assistantMessageEvent.message
      );
      return;
    case "error":
      captureFinalAssistantMessage(
        input.executionState,
        input.event.assistantMessageEvent.error
      );
      return;
    default:
      return;
  }
}

function captureFinalAssistantMessage(
  executionState: PiSdkPromptExecutionState,
  message: AssistantMessage
): void {
  executionState.finalAssistantMessage = message;
  executionState.finalAssistantText = extractAssistantText(message);
  executionState.usage = toRunnerUsage(message.usage);
  executionState.providerStopReason = message.stopReason;
}

function buildTerminalResult(input: {
  executionState: PiSdkPromptExecutionState;
  finalAssistantMessage: AssistantMessage | null;
}): PiSdkRunnerTerminalResult {
  if (!input.finalAssistantMessage) {
    return buildFailedTerminalResult({
      failureClass: "terminal_result_missing",
      reason: "Pi SDK runner finished without a terminal assistant message.",
      executionState: input.executionState
    });
  }

  if (
    input.finalAssistantMessage.stopReason === "error" ||
    input.finalAssistantMessage.stopReason === "aborted"
  ) {
    return buildFailedTerminalResult({
      failureClass: "provider_error",
      reason:
        input.finalAssistantMessage.errorMessage ??
        "Pi SDK prompt ended with an error stop reason.",
      executionState: input.executionState,
      stopReason: input.finalAssistantMessage.stopReason
    });
  }

  return {
    schemaVersion: "1",
    kind: "completed",
    stopReason: mapStopReason(input.finalAssistantMessage.stopReason),
    providerStopReason: input.finalAssistantMessage.stopReason,
    finalAssistantMessage:
      input.executionState.finalAssistantText ??
      extractAssistantText(input.finalAssistantMessage),
    usage: input.executionState.usage ?? toRunnerUsage(input.finalAssistantMessage.usage),
    lastActivityAt: input.executionState.lastActivityAt,
    lastActivityType: input.executionState.lastActivityType
  };
}

function buildFailedTerminalResult(input: {
  failureClass: PiSdkRunnerFailureClass;
  reason: string;
  executionState: PiSdkPromptExecutionState;
  stopReason?: StopReason | null;
}): PiSdkRunnerTerminalResult {
  return {
    schemaVersion: "1",
    kind: "failed",
    stopReason: input.stopReason ? mapStopReason(input.stopReason) : null,
    failureClass: input.failureClass,
    reason: input.reason,
    providerStopReason: input.stopReason ?? input.executionState.providerStopReason,
    finalAssistantMessage: input.executionState.finalAssistantText,
    usage: input.executionState.usage,
    lastActivityAt: input.executionState.lastActivityAt,
    lastActivityType: input.executionState.lastActivityType
  };
}

function findLastAssistantMessage(session: PiSdkRunnerSession): AssistantMessage | null {
  for (let index = session.state.messages.length - 1; index >= 0; index -= 1) {
    const message = session.state.messages[index];
    if (message.role === "assistant") {
      return message;
    }
  }

  return null;
}

function resolveAssistantMessageId(message: AssistantMessage): string {
  return message.responseId ?? `assistant-${randomUUID()}`;
}

function extractAssistantText(message: AssistantMessage): string | null {
  const textParts = message.content
    .filter((part): part is TextContent => part.type === "text")
    .map((part) => part.text);
  if (textParts.length === 0) {
    return null;
  }

  return textParts.join("");
}

function mapStopReason(stopReason: StopReason) {
  switch (stopReason) {
    case "stop":
      return "end_turn";
    case "length":
      return "max_tokens";
    case "toolUse":
      return "tool_calls";
    case "error":
      return "error";
    case "aborted":
      return "aborted";
    default:
      return "unknown";
  }
}

function toRunnerUsage(usage: AssistantMessage["usage"]): PiSdkRunnerUsage {
  return {
    inputTokens: usage.input,
    cachedInputTokens: usage.cacheRead,
    outputTokens: usage.output,
    totalTokens: usage.totalTokens
  };
}

function createTimeoutController(input: {
  runtime: PiSdkRunnerRuntime;
  command: Extract<PiSdkRunnerCommand, { commandType: "run_turn" }>;
  executionState: PiSdkPromptExecutionState;
}): PiSdkTimeoutController {
  let triggeredFailure: PiSdkTimeoutFailure | null = null;
  let runTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let idleTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const dispose = () => {
    disposed = true;
    if (runTimeoutHandle) {
      clearTimeout(runTimeoutHandle);
      runTimeoutHandle = null;
    }
    if (idleTimeoutHandle) {
      clearTimeout(idleTimeoutHandle);
      idleTimeoutHandle = null;
    }
  };

  const abortSession = () => {
    void input.runtime.session.abort().catch(() => {
      // Preserve the original timeout failure classification.
    });
  };

  const triggerFailure = (
    failureClass: PiSdkTimeoutFailure["failureClass"],
    event:
      | Extract<PiSdkRunnerEvent, { eventType: "idle_timeout_triggered" }>
      | Extract<PiSdkRunnerEvent, { eventType: "run_timeout_triggered" }>,
    reason: string
  ) => {
    if (disposed || triggeredFailure !== null) {
      return;
    }

    triggeredFailure = {
      failureClass,
      reason
    };
    emitEvent(event);
    abortSession();
  };

  const recordActivity = (recordedAt: string, activityType: string) => {
    input.executionState.lastActivityAt = recordedAt;
    input.executionState.lastActivityType = activityType;

    if (disposed || triggeredFailure !== null) {
      return;
    }

    if (input.command.timeouts.modelIdleTimeoutMs !== null) {
      if (idleTimeoutHandle) {
        clearTimeout(idleTimeoutHandle);
      }

      idleTimeoutHandle = setTimeout(() => {
        const thresholdMs = input.command.timeouts.modelIdleTimeoutMs;
        if (thresholdMs === null) {
          return;
        }

        const recordedAt = new Date().toISOString();
        triggerFailure(
          "model_idle_timeout",
          {
            schemaVersion: "1",
            eventType: "idle_timeout_triggered",
            sequence: nextSequence(),
            recordedAt,
            runId: input.command.runId,
            failureClass: "model_idle_timeout",
            thresholdMs,
            lastActivityAt: input.executionState.lastActivityAt,
            lastActivityType: input.executionState.lastActivityType
          },
          `Pi SDK runner idled for ${thresholdMs}ms without visible activity.`
        );
      }, input.command.timeouts.modelIdleTimeoutMs);
    }
  };

  if (input.command.timeouts.runTimeoutMs > 0) {
    runTimeoutHandle = setTimeout(() => {
      const recordedAt = new Date().toISOString();
      triggerFailure(
        "run_timeout",
        {
          schemaVersion: "1",
          eventType: "run_timeout_triggered",
          sequence: nextSequence(),
          recordedAt,
          runId: input.command.runId,
          failureClass: "run_timeout",
          thresholdMs: input.command.timeouts.runTimeoutMs,
          lastActivityAt: input.executionState.lastActivityAt,
          lastActivityType: input.executionState.lastActivityType
        },
        `Pi SDK runner exceeded the ${input.command.timeouts.runTimeoutMs}ms turn timeout.`
      );
    }, input.command.timeouts.runTimeoutMs);
  }

  recordActivity(
    input.executionState.lastActivityAt ?? new Date().toISOString(),
    input.executionState.lastActivityType ?? "prompt_started"
  );

  return {
    recordActivity,
    getTriggeredFailure() {
      return triggeredFailure;
    },
    dispose
  };
}

function emitEventWithActivity(
  executionState: PiSdkPromptExecutionState,
  activityType: string,
  event: PiSdkRunnerEvent,
  timeoutController?: PiSdkTimeoutController
): void {
  executionState.lastActivityAt = event.recordedAt;
  executionState.lastActivityType = activityType;
  timeoutController?.recordActivity(event.recordedAt, activityType);
  emitEvent(event);
}

function emitTerminalFailure(input: {
  runId: string;
  failureClass: PiSdkRunnerFailureClass;
  reason: string;
}): void {
  emitEvent({
    schemaVersion: "1",
    eventType: "terminal_result",
    sequence: nextSequence(),
    recordedAt: new Date().toISOString(),
    runId: input.runId,
    result: {
      schemaVersion: "1",
      kind: "failed",
      stopReason: null,
      failureClass: input.failureClass,
      reason: input.reason,
      providerStopReason: null,
      finalAssistantMessage: null,
      usage: null,
      lastActivityAt: null,
      lastActivityType: null
    }
  });
}

function emitRunnerError(input: {
  runId: string;
  failureClass: PiSdkRunnerFailureClass;
  reason: string;
}): void {
  emitEvent({
    schemaVersion: "1",
    eventType: "runner_error",
    sequence: nextSequence(),
    recordedAt: new Date().toISOString(),
    runId: input.runId,
    failureClass: input.failureClass,
    reason: input.reason
  });
}

function resolveAgentDir(agentDir: string | null): string {
  const resolvedAgentDir = (agentDir ?? getAgentDir()).trim();
  if (resolvedAgentDir === "") {
    throw new TypeError("Pi SDK runner requires a non-empty agent directory.");
  }

  return resolvedAgentDir;
}

function resolveRunnerModel(
  input: PiSdkRunnerInput,
  modelRegistry: ModelRegistry
): Model<Api> {
  if (input.model.providerId) {
    const providerModel = modelRegistry.find(
      input.model.providerId,
      input.model.id
    );
    if (providerModel) {
      return providerModel;
    }
  }

  const exactMatches = modelRegistry
    .getAll()
    .filter((model) => model.id === input.model.id);
  if (exactMatches.length === 1) {
    return exactMatches[0]!;
  }

  if (exactMatches.length > 1) {
    throw new TypeError(
      `Pi SDK runner model ${JSON.stringify(
        input.model.id
      )} is ambiguous without an explicit provider id.`
    );
  }

  throw new TypeError(
    `Pi SDK runner could not resolve model ${JSON.stringify(
      input.model.id
    )}.`
  );
}

function parseCommandLine(line: string): PiSdkRunnerCommand {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new TypeError(`Pi SDK runner command must be valid JSON: ${reason}`, {
      cause: error
    });
  }

  return parsePiSdkRunnerCommand(parsed);
}

async function* readStdinLines(): AsyncGenerator<string> {
  const reader = createInterface({
    input: process.stdin,
    crlfDelay: Infinity
  });

  for await (const line of reader) {
    yield line;
  }
}

function emitEvent(event: PiSdkRunnerEvent): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function stringifyJson(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function nextSequence(): number {
  sequence += 1;
  return sequence;
}

function extractBashCommand(args: unknown): string {
  const record = asRecord(args);
  const command = typeof record?.command === "string" ? record.command.trim() : "";
  return command !== "" ? command : "bash";
}

function extractToolPath(args: unknown): string | null {
  const record = asRecord(args);
  if (!record) {
    return null;
  }

  const path =
    typeof record.path === "string"
      ? record.path.trim()
      : typeof record.file_path === "string"
        ? record.file_path.trim()
        : "";
  return path !== "" ? path : null;
}

function extractToolResultText(value: unknown): string | null {
  const record = asRecord(value);
  const content = Array.isArray(record?.content) ? record.content : [];
  const parts = content
    .map((entry) => {
      const part = asRecord(entry);
      return typeof part?.text === "string" ? part.text : null;
    })
    .filter((text): text is string => typeof text === "string");

  if (parts.length > 0) {
    return parts.join("");
  }

  return stringifyJson(value);
}

function extractToolErrorMessage(value: unknown): string | null {
  const record = asRecord(value);
  if (typeof record?.message === "string" && record.message.trim() !== "") {
    return record.message.trim();
  }

  return extractToolResultText(value);
}

function extractEditDiff(value: unknown): string | null {
  const record = asRecord(value);
  const details = asRecord(record?.details);
  return typeof details?.diff === "string" && details.diff !== ""
    ? details.diff
    : null;
}

function parseBashExitCode(text: string | null): number | null {
  if (!text) {
    return null;
  }

  const match = text.match(/Command exited with code\s+(-?\d+)/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildFileChangeObservedEvent(input: {
  runId: string;
  toolName: string;
  args: unknown;
  result: unknown;
}): Extract<PiSdkRunnerEvent, { eventType: "file_change_observed" }> | null {
  if (input.toolName !== "edit" && input.toolName !== "write") {
    return null;
  }

  const path = extractToolPath(input.args);
  if (!path) {
    return null;
  }

  return {
    schemaVersion: "1",
    eventType: "file_change_observed",
    sequence: nextSequence(),
    recordedAt: new Date().toISOString(),
    runId: input.runId,
    path,
    changeType: "modified",
    diffText: input.toolName === "edit" ? extractEditDiff(input.result) : null
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isEntrypoint(): boolean {
  const currentFilePath = fileURLToPath(import.meta.url);
  const argvPath = process.argv[1];
  if (typeof argvPath !== "string" || argvPath.trim() === "") {
    return false;
  }

  return currentFilePath === resolve(argvPath);
}

if (isEntrypoint()) {
  void runPiSdkRunnerFromStdio().catch((error) => {
    emitRunnerError({
      runId: "runner-bootstrap-failure",
      failureClass: "runner_startup_failure",
      reason: error instanceof Error ? error.message : String(error)
    });
    process.exitCode = 1;
  });
}
