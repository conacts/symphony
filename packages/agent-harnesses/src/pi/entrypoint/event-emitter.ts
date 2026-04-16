import type {
  PiRunnerEvent,
  PiRunnerFailureClass,
  PiRunnerTerminalResult
} from "../runner-contract.js";

let sequence = 0;

export function emitEvent(event: PiRunnerEvent): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

export function emitTerminalResult(input: {
  runId: string;
  result: PiRunnerTerminalResult;
}): void {
  emitEvent({
    schemaVersion: "1",
    eventType: "terminal_result",
    sequence: nextSequence(),
    recordedAt: new Date().toISOString(),
    runId: input.runId,
    result: input.result
  });
}

export function emitTerminalFailure(input: {
  runId: string;
  failureClass: PiRunnerFailureClass;
  reason: string;
}): void {
  emitTerminalResult({
    runId: input.runId,
    result: {
      schemaVersion: "1",
      kind: "failed",
      stopReason: null,
      failureClass: input.failureClass,
      reason: input.reason,
      providerStopReason: null,
      finalAssistantMessage: null,
      usage: null,
      lastActivityAt: null,
      lastActivityType: null
    }
  });
}

export function emitRunnerError(input: {
  runId: string;
  failureClass: PiRunnerFailureClass;
  reason: string;
}): void {
  emitEvent({
    schemaVersion: "1",
    eventType: "runner_error",
    sequence: nextSequence(),
    recordedAt: new Date().toISOString(),
    runId: input.runId,
    failureClass: input.failureClass,
    reason: input.reason
  });
}

export function nextSequence(): number {
  sequence += 1;
  return sequence;
}

export function stringifyJson(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
