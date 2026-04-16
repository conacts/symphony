import { randomUUID } from "node:crypto";
import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { PiRunnerEvent } from "../runner-contract.js";
import type {
  PiSdkPromptExecutionState,
  PiRunnerRuntime,
  PiSdkTimeoutController
} from "./definition.js";
import { emitEvent, nextSequence, stringifyJson } from "./event-emitter.js";
import { captureFinalAssistantMessage } from "./terminal-result.js";

export function emitRuntimeEvent(input: {
  runtime: PiRunnerRuntime;
  command: {
    runId: string;
  };
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
    case "tool_execution_start": {
      const toolStartedAt = new Date().toISOString();
      input.executionState.toolCalls.set(input.event.toolCallId, {
        toolName: input.event.toolName,
        args: input.event.args,
        commandText:
          input.event.toolName === "bash"
            ? extractBashCommand(input.event.args)
            : null,
        startedAt: toolStartedAt,
        lastHeartbeatAt: null
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
    }
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
              commandText: toolCall?.commandText ?? extractBashCommand(toolCall?.args),
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
            commandText: toolCall?.commandText ?? extractBashCommand(toolCall?.args),
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

function emitEventWithActivity(
  executionState: PiSdkPromptExecutionState,
  activityType: string,
  event: PiRunnerEvent,
  timeoutController?: PiSdkTimeoutController
): void {
  executionState.lastActivityAt = event.recordedAt;
  executionState.lastActivityType = activityType;
  timeoutController?.recordActivity(event.recordedAt, activityType);
  emitEvent(event);
}

function resolveAssistantMessageId(message: AssistantMessage): string {
  return message.responseId ?? `assistant-${randomUUID()}`;
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
}): Extract<PiRunnerEvent, { eventType: "file_change_observed" }> | null {
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
