import process from "node:process";
import { emitRunnerError } from "./entrypoint/event-emitter.js";
import {
  isPiRunnerEntrypoint,
  runPiRunnerFromStdio
} from "./entrypoint/protocol-host.js";

export type { PiRunnerRuntime } from "./entrypoint/definition.js";
export { bootstrapPiRunner } from "./entrypoint/runtime-bootstrap.js";
export { executePiRunnerTurn } from "./entrypoint/turn-execution.js";
export { runPiRunnerFromStdio } from "./entrypoint/protocol-host.js";

if (isPiRunnerEntrypoint()) {
  void runPiRunnerFromStdio().catch((error) => {
    emitRunnerError({
      runId: "runner-bootstrap-failure",
      failureClass: "runner_startup_failure",
      reason: error instanceof Error ? error.message : String(error)
    });
    process.exitCode = 1;
  });
}
