import type {
  HarnessRuntimeUpdate,
  HarnessSession,
  HarnessTurnResult
} from "../../shared/session-types.js";
import { mapPiRunnerAwaitEventFailure } from "../client/transport-failure-mapper.js";
import type {
  PiRunnerTimeoutTriggerEvent,
  PiSdkThreadItemState
} from "./stream-events.js";
import type { PiRunnerProcess } from "../runner-process.js";
import { resolvePiRunnerTurnEvent } from "./turn-resolution.js";

export async function runPiRunnerTurnLoop(input: {
  process: PiRunnerProcess;
  session: HarnessSession;
  turnId: string;
  readTimeoutMs: number;
  threadState: PiSdkThreadItemState;
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void;
}): Promise<HarnessTurnResult> {
  let timeoutTriggerEvent: PiRunnerTimeoutTriggerEvent | null = null;

  while (true) {
    let event;
    try {
      event = await input.process.awaitEvent(input.readTimeoutMs);
    } catch (error) {
      const timeoutError = await mapPiRunnerAwaitEventFailure({
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

    const resolution = await resolvePiRunnerTurnEvent({
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
