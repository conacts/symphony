import process from "node:process";
import { emitRunnerError } from "./entrypoint/event-emitter.js";
import {
  isPiSdkRunnerEntrypoint,
  runPiSdkRunnerFromStdio
} from "./entrypoint/protocol-host.js";

export type { PiSdkRunnerRuntime } from "./entrypoint/definition.js";
export { bootstrapPiSdkRunner } from "./entrypoint/runtime-bootstrap.js";
export { executePiSdkRunnerTurn } from "./entrypoint/turn-execution.js";
export { runPiSdkRunnerFromStdio } from "./entrypoint/protocol-host.js";

if (isPiSdkRunnerEntrypoint()) {
  void runPiSdkRunnerFromStdio().catch((error) => {
    emitRunnerError({
      runId: "runner-bootstrap-failure",
      failureClass: "runner_startup_failure",
      reason: error instanceof Error ? error.message : String(error)
    });
    process.exitCode = 1;
  });
}
