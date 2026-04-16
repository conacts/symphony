import { resolve } from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import {
  parsePiRunnerCommand,
  type PiRunnerCommand
} from "../runner-contract.js";
import { type PiRunnerRuntime } from "./definition.js";
import {
  emitEvent,
  emitRunnerError,
  emitTerminalFailure,
  nextSequence
} from "./event-emitter.js";
import { bootstrapPiRunner } from "./runtime-bootstrap.js";
import { executePiRunnerTurn } from "./turn-execution.js";

export async function runPiRunnerFromStdio(): Promise<void> {
  let runtime: PiRunnerRuntime | null = null;

  for await (const line of readStdinLines()) {
    if (line.trim() === "") {
      continue;
    }

    let command: PiRunnerCommand;
    try {
      command = parseCommandLine(line);
    } catch (error) {
      emitRunnerError({
        runId: "runner-command-parse-failure",
        failureClass: "bridge_protocol_failure",
        reason: error instanceof Error ? error.message : String(error)
      });
      continue;
    }

    switch (command.commandType) {
      case "bootstrap":
        try {
          runtime = await bootstrapPiRunner(command.input);
          emitEvent({
            schemaVersion: "1",
            eventType: "session_started",
            sequence: nextSequence(),
            recordedAt: new Date().toISOString(),
            runId: command.input.runId,
            sessionId: runtime.sessionId,
            threadId: runtime.threadId,
            modelId: command.input.model.id,
            cwd: command.input.workspace.cwd
          });
        } catch (error) {
          emitRunnerError({
            runId: command.input.runId,
            failureClass: "runner_startup_failure",
            reason: error instanceof Error ? error.message : String(error)
          });
          return;
        }
        break;
      case "run_turn":
        if (runtime === null) {
          emitTerminalFailure({
            runId: command.runId,
            failureClass: "bridge_protocol_failure",
            reason: "Pi runner must be bootstrapped before run_turn."
          });
          break;
        }

        await executePiRunnerTurn(runtime, command);
        break;
      case "shutdown":
        runtime?.session.dispose();
        return;
    }
  }

  runtime?.session.dispose();
}

export function isPiRunnerEntrypoint(): boolean {
  const currentFilePath = fileURLToPath(import.meta.url);
  const argvPath = process.argv[1];
  if (typeof argvPath !== "string" || argvPath.trim() === "") {
    return false;
  }

  return currentFilePath === resolve(argvPath);
}

function parseCommandLine(line: string): PiRunnerCommand {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new TypeError(`Pi runner command must be valid JSON: ${reason}`, {
      cause: error
    });
  }

  return parsePiRunnerCommand(parsed);
}

async function* readStdinLines(): AsyncGenerator<string> {
  const reader = createInterface({
    input: process.stdin,
    crlfDelay: Infinity
  });

  for await (const line of reader) {
    yield line;
  }
}
