import type { PiSdkRunnerCommand } from "../sdk-runner-contract.js";
import {
  createPromptExecutionState,
  type PiSdkRunnerRuntime
} from "./definition.js";
import { emitEvent, emitTerminalResult, nextSequence } from "./event-emitter.js";
import { emitRuntimeEvent } from "./runtime-event-mapper.js";
import {
  buildFailedTerminalResult,
  buildTerminalResult,
  findLastAssistantMessage
} from "./terminal-result.js";
import { createTimeoutController } from "./timeout-controller.js";

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

  const executionState = createPromptExecutionState(promptStartedAt);
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
      emitTriggeredFailureResult(command.runId, triggeredFailure, executionState);
      return;
    }

    const finalAssistantMessage =
      executionState.finalAssistantMessage ??
      findLastAssistantMessage(runtime.session);
    emitTerminalResult({
      runId: command.runId,
      result: buildTerminalResult({
        executionState,
        finalAssistantMessage
      })
    });
  } catch (error) {
    const triggeredFailure = timeoutController.getTriggeredFailure();
    if (triggeredFailure) {
      emitTriggeredFailureResult(command.runId, triggeredFailure, executionState);
      return;
    }

    emitTerminalResult({
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

function emitTriggeredFailureResult(
  runId: string,
  triggeredFailure: ReturnType<
    ReturnType<typeof createTimeoutController>["getTriggeredFailure"]
  >,
  executionState: Parameters<typeof buildFailedTerminalResult>[0]["executionState"]
): void {
  if (!triggeredFailure) {
    return;
  }

  emitTerminalResult({
    runId,
    result: buildFailedTerminalResult({
      failureClass: triggeredFailure.failureClass,
      reason: triggeredFailure.reason,
      executionState
    })
  });
}
