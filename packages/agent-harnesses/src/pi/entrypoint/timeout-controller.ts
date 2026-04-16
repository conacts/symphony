import type { PiSdkRunnerCommand, PiSdkRunnerEvent } from "../sdk-runner-contract.js";
import type {
  PiSdkPromptExecutionState,
  PiSdkTimeoutController,
  PiSdkTimeoutFailure,
  PiSdkRunnerRuntime
} from "./definition.js";
import { emitEvent, nextSequence, stringifyJson } from "./event-emitter.js";

export function createTimeoutController(input: {
  runtime: PiSdkRunnerRuntime;
  command: Extract<PiSdkRunnerCommand, { commandType: "run_turn" }>;
  executionState: PiSdkPromptExecutionState;
}): PiSdkTimeoutController {
  let triggeredFailure: PiSdkTimeoutFailure | null = null;
  let runTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let idleTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let toolTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let toolHeartbeatHandle: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const clearIdleTimeout = () => {
    if (idleTimeoutHandle) {
      clearTimeout(idleTimeoutHandle);
      idleTimeoutHandle = null;
    }
  };

  const clearToolTimers = () => {
    if (toolTimeoutHandle) {
      clearTimeout(toolTimeoutHandle);
      toolTimeoutHandle = null;
    }
    if (toolHeartbeatHandle) {
      clearTimeout(toolHeartbeatHandle);
      toolHeartbeatHandle = null;
    }
  };

  const dispose = () => {
    disposed = true;
    if (runTimeoutHandle) {
      clearTimeout(runTimeoutHandle);
      runTimeoutHandle = null;
    }
    clearIdleTimeout();
    clearToolTimers();
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
      | Extract<PiSdkRunnerEvent, { eventType: "run_timeout_triggered" }>
      | Extract<PiSdkRunnerEvent, { eventType: "tool_timeout_triggered" }>,
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

  const setLastActivity = (recordedAt: string, activityType: string) => {
    input.executionState.lastActivityAt = recordedAt;
    input.executionState.lastActivityType = activityType;
  };

  const getActiveToolCall = () => {
    const firstToolEntry = input.executionState.toolCalls.entries().next();
    if (firstToolEntry.done) {
      return null;
    }

    const [callId, toolCall] = firstToolEntry.value;
    return {
      callId,
      ...toolCall
    };
  };

  const resolveToolHeartbeatIntervalMs = () => {
    const candidates = [
      input.command.timeouts.modelIdleTimeoutMs,
      input.command.timeouts.toolTimeoutMs
    ].filter((value): value is number => value !== null);

    if (candidates.length === 0) {
      return null;
    }

    return Math.max(1, Math.min(30_000, Math.floor(Math.min(...candidates) / 3)));
  };

  const buildToolTimeoutReason = (
    activeTool: NonNullable<ReturnType<typeof getActiveToolCall>>
  ) => {
    const thresholdMs = input.command.timeouts.toolTimeoutMs;
    if (thresholdMs === null) {
      return "Pi SDK runner exceeded the configured tool timeout.";
    }

    if (activeTool.toolName === "bash" && activeTool.commandText) {
      return `Pi SDK runner exceeded the ${thresholdMs}ms tool timeout while waiting for bash command ${JSON.stringify(activeTool.commandText)}.`;
    }

    return `Pi SDK runner exceeded the ${thresholdMs}ms tool timeout while waiting for tool ${JSON.stringify(activeTool.toolName)}.`;
  };

  const syncTimeouts = () => {
    clearIdleTimeout();
    clearToolTimers();

    if (disposed || triggeredFailure !== null) {
      return;
    }

    const activeTool = getActiveToolCall();
    if (activeTool) {
      const toolTimeoutMs = input.command.timeouts.toolTimeoutMs;
      if (toolTimeoutMs !== null) {
        const timeoutAtMs = Date.parse(activeTool.startedAt) + toolTimeoutMs;
        toolTimeoutHandle = setTimeout(() => {
          if (disposed || triggeredFailure !== null) {
            return;
          }

          const currentActiveTool = getActiveToolCall();
          if (currentActiveTool?.callId !== activeTool.callId) {
            syncTimeouts();
            return;
          }

          const recordedAt = new Date().toISOString();
          triggerFailure(
            "tool_timeout",
            {
              schemaVersion: "1",
              eventType: "tool_timeout_triggered",
              sequence: nextSequence(),
              recordedAt,
              runId: input.command.runId,
              failureClass: "tool_timeout",
              thresholdMs: toolTimeoutMs,
              callId: currentActiveTool.callId,
              toolName: currentActiveTool.toolName,
              commandText: currentActiveTool.commandText,
              lastActivityAt: input.executionState.lastActivityAt,
              lastActivityType: input.executionState.lastActivityType
            },
            buildToolTimeoutReason(currentActiveTool)
          );
        }, Math.max(1, timeoutAtMs - Date.now()));
      }

      const heartbeatIntervalMs = resolveToolHeartbeatIntervalMs();
      if (heartbeatIntervalMs !== null) {
        const heartbeatBaseAt =
          activeTool.lastHeartbeatAt ??
          activeTool.startedAt;
        const heartbeatAtMs = Date.parse(heartbeatBaseAt) + heartbeatIntervalMs;
        toolHeartbeatHandle = setTimeout(() => {
          if (disposed || triggeredFailure !== null) {
            return;
          }

          const currentActiveTool = getActiveToolCall();
          if (currentActiveTool?.callId !== activeTool.callId) {
            syncTimeouts();
            return;
          }

          const recordedAt = new Date().toISOString();
          input.executionState.toolCalls.set(currentActiveTool.callId, {
            toolName: currentActiveTool.toolName,
            args: currentActiveTool.args,
            commandText: currentActiveTool.commandText,
            startedAt: currentActiveTool.startedAt,
            lastHeartbeatAt: recordedAt
          });
          setLastActivity(recordedAt, "tool_call_heartbeat");
          emitEvent({
            schemaVersion: "1",
            eventType: "tool_call_heartbeat",
            sequence: nextSequence(),
            recordedAt,
            runId: input.command.runId,
            callId: currentActiveTool.callId,
            toolName: currentActiveTool.toolName,
            argumentsText: stringifyJson(currentActiveTool.args),
            commandText: currentActiveTool.commandText,
            elapsedMs: Math.max(
              1,
              Date.parse(recordedAt) - Date.parse(currentActiveTool.startedAt)
            ),
            heartbeatIntervalMs,
            timeoutMs: input.command.timeouts.toolTimeoutMs
          });
          syncTimeouts();
        }, Math.max(1, heartbeatAtMs - Date.now()));
      }
      return;
    }

    const modelIdleTimeoutMs = input.command.timeouts.modelIdleTimeoutMs;
    if (modelIdleTimeoutMs === null) {
      return;
    }

    idleTimeoutHandle = setTimeout(() => {
      if (disposed || triggeredFailure !== null) {
        return;
      }

      if (getActiveToolCall() !== null) {
        syncTimeouts();
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
          thresholdMs: modelIdleTimeoutMs,
          lastActivityAt: input.executionState.lastActivityAt,
          lastActivityType: input.executionState.lastActivityType
        },
        `Pi SDK runner idled for ${modelIdleTimeoutMs}ms without visible activity.`
      );
    }, modelIdleTimeoutMs);
  };

  const recordActivity = (recordedAt: string, activityType: string) => {
    setLastActivity(recordedAt, activityType);

    if (disposed || triggeredFailure !== null) {
      return;
    }
    syncTimeouts();
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
