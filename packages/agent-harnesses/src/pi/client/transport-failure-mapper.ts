import { HarnessSessionError, type HarnessRuntimeUpdate } from "../../shared/session-types.js";
import type { PiSdkRunnerProcess } from "../sdk-runner-process.js";
import { emitTurnFailed } from "../internal/stream-events.js";

export async function mapPiSdkRunnerAwaitEventFailure(input: {
  error: unknown;
  process: PiSdkRunnerProcess;
  readTimeoutMs: number;
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void;
}): Promise<HarnessSessionError | null> {
  if (
    input.error instanceof HarnessSessionError &&
    input.error.code === "pi_sdk_runner_timeout"
  ) {
    const timeoutError = new HarnessSessionError(
      "pi_sdk_runner_transport_timeout",
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
