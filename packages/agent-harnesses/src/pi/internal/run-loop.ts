import type {
  HarnessRuntimeUpdate,
  HarnessSession,
  HarnessTurnResult
} from "../../shared/session-types.js";
import { mapPiSdkRunnerAwaitEventFailure } from "../client/transport-failure-mapper.js";
import type {
  PiSdkRunnerTimeoutTriggerEvent,
  PiSdkThreadItemState
} from "./stream-events.js";
import type { PiSdkRunnerProcess } from "../sdk-runner-process.js";
import { resolvePiSdkRunnerTurnEvent } from "./turn-resolution.js";

export async function runPiSdkRunnerTurnLoop(input: {
  process: PiSdkRunnerProcess;
  session: HarnessSession;
  turnId: string;
  readTimeoutMs: number;
  threadState: PiSdkThreadItemState;
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void;
}): Promise<HarnessTurnResult> {
  let timeoutTriggerEvent: PiSdkRunnerTimeoutTriggerEvent | null = null;

  while (true) {
    let event;
    try {
      event = await input.process.awaitEvent(input.readTimeoutMs);
    } catch (error) {
      const timeoutError = await mapPiSdkRunnerAwaitEventFailure({
        error,
        process: input.process,
        readTimeoutMs: input.readTimeoutMs,
        onMessage: input.onMessage
      });
      if (timeoutError) {
        throw timeoutError;
      }

      throw error;
    }

    const resolution = await resolvePiSdkRunnerTurnEvent({
      event,
      session: input.session,
      turnId: input.turnId,
      threadState: input.threadState,
      timeoutTriggerEvent,
      onMessage: input.onMessage,
      diagnosticsSnapshot: () => input.process.diagnosticsSnapshot()
    });

    switch (resolution.kind) {
      case "continue":
        timeoutTriggerEvent = resolution.timeoutTriggerEvent;
        break;
      case "return":
        return resolution.result;
      case "throw":
        throw resolution.error;
    }
  }
}
