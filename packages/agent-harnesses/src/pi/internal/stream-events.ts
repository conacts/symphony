import {
  HarnessSessionError,
  type HarnessCompletionCandidate,
  type HarnessTerminalTurnMetadata,
  type HarnessTimeoutTriggerDetail,
  type HarnessRuntimeUpdate,
  type HarnessSession,
  type HarnessTurnResult
} from "../../shared/session-types.js";
import {
  parseSymphonyImplementationModuleResultMessage
} from "@symphony/runtime-contract";
import type { PiSdkRunnerEvent } from "../sdk-runner-contract.js";

export type PiSdkThreadItemState = {
  agentMessages: Map<string, string>;
  reasoningMessages: Map<string, string>;
  seenAssistantMessages: Set<string>;
  toolCallArguments: Map<string, unknown>;
};

export type PiSdkRunnerTimeoutTriggerEvent = Extract<
  PiSdkRunnerEvent,
  {
    eventType:
      | "idle_timeout_triggered"
      | "run_timeout_triggered"
      | "tool_timeout_triggered";
  }
>;

export function createThreadItemState(): PiSdkThreadItemState {
  return {
    agentMessages: new Map(),
    reasoningMessages: new Map(),
    seenAssistantMessages: new Set(),
    toolCallArguments: new Map()
  };
}

export function markAssistantMessage(
  event: Extract<PiSdkRunnerEvent, { eventType: "assistant_message_started" }>,
  state: PiSdkThreadItemState
): void {
  state.seenAssistantMessages.add(event.messageId);
}

export async function emitAssistantTextDelta(
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

export async function emitAssistantReasoningDelta(
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

export async function emitTurnFailed(
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

export function resolveFinalAssistantMessageId(
  state: PiSdkThreadItemState,
  resultEvent: Extract<PiSdkRunnerEvent, { eventType: "terminal_result" }>
): string {
  const lastSeenMessageId = [...state.seenAssistantMessages].at(-1);
  return lastSeenMessageId ?? `${resultEvent.runId}:assistant`;
}

export async function finalizeTerminalResult(input: {
  session: HarnessSession;
  turnId: string;
  threadState: PiSdkThreadItemState;
  resultEvent: Extract<PiSdkRunnerEvent, { eventType: "terminal_result" }>;
  timeoutTriggerEvent: PiSdkRunnerTimeoutTriggerEvent | null;
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void;
}): Promise<HarnessTurnResult> {
  const usage = toHarnessUsage(input.resultEvent.result.usage);
  const terminalTurnMetadata = buildTerminalTurnMetadata(input.resultEvent.result);

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
        detail: terminalTurnMetadata
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
        detail: terminalTurnMetadata
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
          result: terminalTurnMetadata,
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
    const completionCandidate = buildCompletionCandidate(text);
    await onMessage({
      event: {
        type: "item.completed",
        item: {
          id: messageId,
          type: "agent_message",
          text
        }
      },
      completionCandidate,
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
  result: HarnessTerminalTurnMetadata;
  timeoutTriggerEvent: PiSdkRunnerTimeoutTriggerEvent | null;
}) {
  return {
    kind: "terminal_result" as const,
    result: input.result,
    timeoutTrigger: buildTimeoutTriggerDetail(input.timeoutTriggerEvent)
  };
}

function buildTerminalTurnMetadata(
  result: Extract<PiSdkRunnerEvent, { eventType: "terminal_result" }>["result"]
): HarnessTerminalTurnMetadata {
  const parsed = parseSymphonyImplementationModuleResultMessage({
    messageText: result.finalAssistantMessage
  });

  return {
    finalAssistantMessage: result.finalAssistantMessage,
    moduleResult: parsed.kind === "parsed" ? parsed.result : null,
    stopReason: "stopReason" in result ? result.stopReason : null,
    providerStopReason: result.providerStopReason,
    lastActivityAt: result.lastActivityAt,
    lastActivityType: result.lastActivityType
  };
}

function buildTimeoutTriggerDetail(
  event: PiSdkRunnerTimeoutTriggerEvent | null
): HarnessTimeoutTriggerDetail | null {
  if (!event) {
    return null;
  }

  return {
    failureClass: event.failureClass,
    thresholdMs: event.thresholdMs,
    callId: "callId" in event ? event.callId : null,
    toolName: "toolName" in event ? event.toolName : null,
    commandText: "commandText" in event ? event.commandText : null,
    lastActivityAt: event.lastActivityAt,
    lastActivityType: event.lastActivityType
  };
}

function buildCompletionCandidate(
  messageText: string
): HarnessCompletionCandidate | null {
  const parsed = parseSymphonyImplementationModuleResultMessage({
    messageText
  });

  return parsed.kind === "parsed"
    ? {
        kind: "module_result",
        moduleResult: parsed.result
      }
    : null;
}
