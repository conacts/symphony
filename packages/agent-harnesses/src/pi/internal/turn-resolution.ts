import {
  HarnessSessionError,
  type HarnessRuntimeUpdate,
  type HarnessSession,
  type HarnessTurnResult
} from "../../shared/session-types.js";
import {
  emitAssistantReasoningDelta,
  emitAssistantTextDelta,
  emitTurnFailed,
  finalizeTerminalResult,
  markAssistantMessage,
  type PiSdkRunnerTimeoutTriggerEvent,
  type PiSdkThreadItemState
} from "./stream-events.js";
import {
  emitCommandCompleted,
  emitCommandFailed,
  emitCommandStarted,
  emitFileChangeObserved,
  emitToolCallCompleted,
  emitToolCallFailed,
  emitToolCallHeartbeat,
  emitToolCallStarted
} from "./tool-execution.js";
import type { PiSdkRunnerEvent } from "../sdk-runner-contract.js";

export type PiSdkRunnerEventResolution =
  | {
      kind: "continue";
      timeoutTriggerEvent: PiSdkRunnerTimeoutTriggerEvent | null;
    }
  | {
      kind: "return";
      result: HarnessTurnResult;
    }
  | {
      kind: "throw";
      error: HarnessSessionError;
    };

export async function resolvePiSdkRunnerTurnEvent(input: {
  event: PiSdkRunnerEvent;
  session: HarnessSession;
  turnId: string;
  threadState: PiSdkThreadItemState;
  timeoutTriggerEvent: PiSdkRunnerTimeoutTriggerEvent | null;
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void;
  diagnosticsSnapshot(): Record<string, unknown>;
}): Promise<PiSdkRunnerEventResolution> {
  switch (input.event.eventType) {
    case "prompt_started":
      await input.onMessage({
        event: {
          type: "turn.started"
        },
        rawPayload: input.event
      });
      return {
        kind: "continue",
        timeoutTriggerEvent: input.timeoutTriggerEvent
      };
    case "assistant_message_started":
      markAssistantMessage(input.event, input.threadState);
      return {
        kind: "continue",
        timeoutTriggerEvent: input.timeoutTriggerEvent
      };
    case "assistant_text_delta":
      await emitAssistantTextDelta(
        input.onMessage,
        input.threadState,
        input.event
      );
      return {
        kind: "continue",
        timeoutTriggerEvent: input.timeoutTriggerEvent
      };
    case "assistant_reasoning_delta":
      await emitAssistantReasoningDelta(
        input.onMessage,
        input.threadState,
        input.event
      );
      return {
        kind: "continue",
        timeoutTriggerEvent: input.timeoutTriggerEvent
      };
    case "tool_call_started":
      await emitToolCallStarted(input.onMessage, input.threadState, input.event);
      return {
        kind: "continue",
        timeoutTriggerEvent: input.timeoutTriggerEvent
      };
    case "tool_call_completed":
      await emitToolCallCompleted(
        input.onMessage,
        input.threadState,
        input.event
      );
      return {
        kind: "continue",
        timeoutTriggerEvent: input.timeoutTriggerEvent
      };
    case "tool_call_heartbeat":
      await emitToolCallHeartbeat(
        input.onMessage,
        input.threadState,
        input.event
      );
      return {
        kind: "continue",
        timeoutTriggerEvent: input.timeoutTriggerEvent
      };
    case "tool_call_failed":
      await emitToolCallFailed(input.onMessage, input.threadState, input.event);
      return {
        kind: "continue",
        timeoutTriggerEvent: input.timeoutTriggerEvent
      };
    case "command_started":
      await emitCommandStarted(input.onMessage, input.event);
      return {
        kind: "continue",
        timeoutTriggerEvent: input.timeoutTriggerEvent
      };
    case "command_completed":
      await emitCommandCompleted(input.onMessage, input.event);
      return {
        kind: "continue",
        timeoutTriggerEvent: input.timeoutTriggerEvent
      };
    case "command_failed":
      await emitCommandFailed(input.onMessage, input.event);
      return {
        kind: "continue",
        timeoutTriggerEvent: input.timeoutTriggerEvent
      };
    case "file_change_observed":
      await emitFileChangeObserved(input.onMessage, input.event);
      return {
        kind: "continue",
        timeoutTriggerEvent: input.timeoutTriggerEvent
      };
    case "idle_timeout_triggered":
    case "run_timeout_triggered":
    case "tool_timeout_triggered":
      return {
        kind: "continue",
        timeoutTriggerEvent: input.event
      };
    case "terminal_result":
      return {
        kind: "return",
        result: await finalizeTerminalResult({
          session: input.session,
          turnId: input.turnId,
          threadState: input.threadState,
          resultEvent: input.event,
          timeoutTriggerEvent: input.timeoutTriggerEvent,
          onMessage: input.onMessage
        })
      };
    case "runner_error":
      await emitTurnFailed(input.onMessage, input.event.reason, input.event);
      return {
        kind: "throw",
        error: new HarnessSessionError(
          "pi_sdk_runner_failed",
          input.event.reason,
          {
            kind: "runner_error",
            failureClass: input.event.failureClass,
            runnerEventType: input.event.eventType,
            diagnostics: input.diagnosticsSnapshot()
          }
        )
      };
    default:
      return {
        kind: "continue",
        timeoutTriggerEvent: input.timeoutTriggerEvent
      };
  }
}
