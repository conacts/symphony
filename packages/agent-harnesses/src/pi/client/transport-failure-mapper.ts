import { HarnessSessionError, type HarnessRuntimeUpdate } from "../../shared/session-types.js";
import type { PiRunnerProcess } from "../runner-process.js";
import { emitTurnFailed } from "../internal/stream-events.js";

export async function mapPiRunnerAwaitEventFailure(input: {
  error: unknown;
  process: PiRunnerProcess;
  readTimeoutMs: number;
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void;
}): Promise<HarnessSessionError | null> {
  if (
    input.error instanceof HarnessSessionError &&
    input.error.code === "pi_runner_timeout"
  ) {
    const timeoutError = new HarnessSessionError(
      "pi_runner_transport_timeout",
      `Timed out waiting for Pi SDK bridge output after ${input.readTimeoutMs}ms.`,
      {
        kind: "transport_timeout",
        transportTimeoutMs: input.readTimeoutMs,
        diagnostics: input.process.diagnosticsSnapshot()
      }
    );
    await emitTurnFailed(input.onMessage, timeoutError.message, timeoutError.detail);
    return timeoutError;
  }

  return null;
}
