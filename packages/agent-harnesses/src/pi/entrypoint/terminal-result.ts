import type {
  AssistantMessage,
  StopReason,
  TextContent
} from "@mariozechner/pi-ai";
import type {
  PiRunnerFailureClass,
  PiRunnerTerminalResult,
  PiRunnerUsage
} from "../runner-contract.js";
import type {
  PiSdkPromptExecutionState,
  PiRunnerSession
} from "./definition.js";

export function captureFinalAssistantMessage(
  executionState: PiSdkPromptExecutionState,
  message: AssistantMessage
): void {
  executionState.finalAssistantMessage = message;
  executionState.finalAssistantText = extractAssistantText(message);
  executionState.usage = toRunnerUsage(message.usage);
  executionState.providerStopReason = message.stopReason;
}

export function buildTerminalResult(input: {
  executionState: PiSdkPromptExecutionState;
  finalAssistantMessage: AssistantMessage | null;
}): PiRunnerTerminalResult {
  if (!input.finalAssistantMessage) {
    return buildFailedTerminalResult({
      failureClass: "terminal_result_missing",
      reason: "Pi runner finished without a terminal assistant message.",
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

export function buildFailedTerminalResult(input: {
  failureClass: PiRunnerFailureClass;
  reason: string;
  executionState: PiSdkPromptExecutionState;
  stopReason?: StopReason | null;
}): PiRunnerTerminalResult {
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

export function findLastAssistantMessage(
  session: PiRunnerSession
): AssistantMessage | null {
  for (let index = session.state.messages.length - 1; index >= 0; index -= 1) {
    const message = session.state.messages[index];
    if (message.role === "assistant") {
      return message;
    }
  }

  return null;
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

function toRunnerUsage(usage: AssistantMessage["usage"]): PiRunnerUsage {
  return {
    inputTokens: usage.input,
    cachedInputTokens: usage.cacheRead,
    outputTokens: usage.output,
    totalTokens: usage.totalTokens
  };
}
