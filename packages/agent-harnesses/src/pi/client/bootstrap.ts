import { randomUUID } from "node:crypto";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import { HarnessSessionError } from "../../shared/session-types.js";
import type { PiSdkRunnerProcess } from "../sdk-runner-process.js";
import {
  type PiSdkRunnerCommand,
  type PiSdkRunnerInput,
  parsePiSdkRunnerEvent
} from "../sdk-runner-contract.js";
import { resolvePiIssueSelection } from "../model-selection.js";

export function buildPiSdkRunnerBootstrapInput(input: {
  issue: SymphonyTrackerIssue;
  runtimeWorkspacePath: string;
  runtimeWorkspaceRoot: string;
  selection: ReturnType<typeof resolvePiIssueSelection>;
  providerId: string | null;
  providerName: string | null;
}): PiSdkRunnerInput {
  return {
    schemaVersion: "1",
    runId: `sdk-bootstrap-${input.issue.identifier}-${randomUUID()}`,
    issue: {
      id: input.issue.id,
      identifier: input.issue.identifier,
      title: input.issue.title
    },
    workspace: {
      cwd: input.runtimeWorkspacePath,
      sessionFile: `${input.runtimeWorkspaceRoot}/.symphony/runtime/pi-sdk-session.jsonl`,
      agentDir: null
    },
    prompt: {
      title: "Initialize Pi SDK runner",
      text: "Initialize the Pi SDK runner session."
    },
    model: {
      id: input.selection.model,
      reasoningEffort: input.selection.reasoningEffort,
      profile: null,
      providerId: input.providerId,
      providerName: input.providerName
    },
    timeouts: {
      runTimeoutMs: 300000,
      modelIdleTimeoutMs: 60000,
      toolTimeoutMs: null
    },
    executionPolicy: {
      approvalMode: "auto",
      emitReasoning: true
    }
  };
}

export function buildPiSdkRunnerBootstrapCommand(
  runnerInput: PiSdkRunnerInput
): PiSdkRunnerCommand {
  return {
    schemaVersion: "1",
    commandType: "bootstrap",
    input: runnerInput
  };
}

export function buildPiSdkRunnerRunTurnCommand(input: {
  turnId: string;
  promptTitle: string;
  promptText: string;
  turnTimeoutMs: number;
  stallTimeoutMs: number;
  toolTimeoutMs: number | null;
}): PiSdkRunnerCommand {
  return {
    schemaVersion: "1",
    commandType: "run_turn",
    runId: input.turnId,
    turnId: input.turnId,
    prompt: {
      title: input.promptTitle,
      text: input.promptText
    },
    timeouts: {
      runTimeoutMs: input.turnTimeoutMs,
      modelIdleTimeoutMs: input.stallTimeoutMs,
      toolTimeoutMs: input.toolTimeoutMs
    },
    executionPolicy: {
      emitReasoning: true
    }
  };
}

export function parsePiSdkRunnerBootstrapEvent(value: unknown) {
  return parsePiSdkRunnerEvent(value);
}

export async function awaitSessionStartedEvent(input: {
  process: PiSdkRunnerProcess;
  timeoutMs: number;
}) {
  const deadline = Date.now() + input.timeoutMs;
  let lastEvent: ReturnType<typeof parsePiSdkRunnerEvent> | null = null;

  while (Date.now() < deadline) {
    const remainingMs = Math.max(1, deadline - Date.now());
    try {
      const event = await input.process.awaitEvent(remainingMs);
      if (event.eventType === "session_started") {
        return event;
      }
      if (event.eventType === "runner_error") {
        throw new HarnessSessionError(
          "pi_sdk_runner_initialize_failed",
          event.reason,
          event
        );
      }
      lastEvent = event;
    } catch (error) {
      if (
        error instanceof HarnessSessionError &&
        error.code === "pi_sdk_runner_timeout" &&
        lastEvent !== null
      ) {
        return lastEvent;
      }
      throw error;
    }
  }

  if (lastEvent !== null) {
    return lastEvent;
  }

  throw new HarnessSessionError(
    "pi_sdk_runner_initialize_timeout",
    `Timed out waiting for Pi SDK runner startup after ${input.timeoutMs}ms.`,
    {
      transportTimeoutMs: input.timeoutMs,
      diagnostics: input.process.diagnosticsSnapshot()
    }
  );
}
