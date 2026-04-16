import type { HarnessRuntimeUpdate } from "../../shared/session-types.js";
import type { PiSdkRunnerEvent } from "../sdk-runner-contract.js";
import type { PiSdkThreadItemState } from "./stream-events.js";
import {
  consumePiToolCallArguments,
  peekPiToolCallArguments,
  rememberPiToolCallArguments
} from "./tool-planning.js";

type PiSdkToolExecutionState = Pick<PiSdkThreadItemState, "toolCallArguments">;

export async function emitToolCallStarted(
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void,
  state: PiSdkToolExecutionState,
  event: Extract<PiSdkRunnerEvent, { eventType: "tool_call_started" }>
): Promise<void> {
  if (event.toolName === "bash") {
    return;
  }

  const argumentsValue = rememberPiToolCallArguments(
    state,
    event.callId,
    event.argumentsText
  );

  await onMessage({
    event: {
      type: "item.started",
      item: {
        id: event.callId,
        type: "mcp_tool_call",
        server: "pi",
        tool: event.toolName,
        arguments: argumentsValue,
        status: "in_progress"
      }
    },
    rawPayload: event
  });
}

export async function emitToolCallCompleted(
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void,
  state: PiSdkToolExecutionState,
  event: Extract<PiSdkRunnerEvent, { eventType: "tool_call_completed" }>
): Promise<void> {
  if (event.toolName === "bash") {
    return;
  }

  const argumentsValue = consumePiToolCallArguments(state, event.callId);

  await onMessage({
    event: {
      type: "item.completed",
      item: {
        id: event.callId,
        type: "mcp_tool_call",
        server: "pi",
        tool: event.toolName,
        arguments: argumentsValue,
        status: "completed",
        ...(event.outputText === null
          ? {}
          : {
              result: {
                content: [
                  {
                    type: "text",
                    text: event.outputText
                  }
                ],
                structured_content: null
              }
            })
      }
    },
    rawPayload: event
  });
}

export async function emitToolCallHeartbeat(
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void,
  state: PiSdkToolExecutionState,
  event: Extract<PiSdkRunnerEvent, { eventType: "tool_call_heartbeat" }>
): Promise<void> {
  if (event.toolName === "bash") {
    await onMessage({
      event: {
        type: "item.updated",
        item: {
          id: event.callId,
          type: "command_execution",
          command: event.commandText ?? "bash",
          aggregated_output: `Still running after ${event.elapsedMs}ms.`,
          status: "in_progress"
        }
      },
      rawPayload: event
    });
    return;
  }

  await onMessage({
    event: {
      type: "item.updated",
      item: {
        id: event.callId,
        type: "mcp_tool_call",
        server: "pi",
        tool: event.toolName,
        arguments: peekPiToolCallArguments(
          state,
          event.callId,
          event.argumentsText
        ),
        status: "in_progress"
      }
    },
    rawPayload: event
  });
}

export async function emitToolCallFailed(
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void,
  state: PiSdkToolExecutionState,
  event: Extract<PiSdkRunnerEvent, { eventType: "tool_call_failed" }>
): Promise<void> {
  if (event.toolName === "bash") {
    return;
  }

  const argumentsValue = consumePiToolCallArguments(state, event.callId);

  await onMessage({
    event: {
      type: "item.completed",
      item: {
        id: event.callId,
        type: "mcp_tool_call",
        server: "pi",
        tool: event.toolName,
        arguments: argumentsValue,
        status: "failed",
        ...(event.outputText === null
          ? {}
          : {
              result: {
                content: [
                  {
                    type: "text",
                    text: event.outputText
                  }
                ],
                structured_content: null
              }
            }),
        error: {
          message: event.errorMessage
        }
      }
    },
    rawPayload: event
  });
}

export async function emitCommandStarted(
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void,
  event: Extract<PiSdkRunnerEvent, { eventType: "command_started" }>
): Promise<void> {
  await onMessage({
    event: {
      type: "item.started",
      item: {
        id: event.commandId,
        type: "command_execution",
        command: event.commandText,
        aggregated_output: "",
        status: "in_progress"
      }
    },
    rawPayload: event
  });
}

export async function emitCommandCompleted(
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void,
  event: Extract<PiSdkRunnerEvent, { eventType: "command_completed" }>
): Promise<void> {
  await onMessage({
    event: {
      type: "item.completed",
      item: {
        id: event.commandId,
        type: "command_execution",
        command: event.commandText,
        aggregated_output: joinPiCommandOutput(event.stdout, event.stderr),
        exit_code: event.exitCode,
        status: "completed"
      }
    },
    rawPayload: event
  });
}

export async function emitCommandFailed(
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void,
  event: Extract<PiSdkRunnerEvent, { eventType: "command_failed" }>
): Promise<void> {
  await onMessage({
    event: {
      type: "item.completed",
      item: {
        id: event.commandId,
        type: "command_execution",
        command: event.commandText,
        aggregated_output:
          joinPiCommandOutput(event.stdout, event.stderr) || event.reason,
        ...(event.exitCode === null ? {} : { exit_code: event.exitCode }),
        status: "failed"
      }
    },
    rawPayload: event
  });
}

export async function emitFileChangeObserved(
  onMessage: (update: HarnessRuntimeUpdate) => Promise<void> | void,
  event: Extract<PiSdkRunnerEvent, { eventType: "file_change_observed" }>
): Promise<void> {
  await onMessage({
    event: {
      type: "item.completed",
      item: {
        id: `pi-file-change:${event.runId}:${event.sequence}`,
        type: "file_change",
        changes: [
          {
            path: event.path,
            kind: mapPiFileChangeKind(event.changeType)
          }
        ],
        status: "completed"
      }
    },
    rawPayload: event
  });
}

function joinPiCommandOutput(
  stdout: string | null,
  stderr: string | null
): string {
  return [stdout, stderr]
    .filter((value): value is string => typeof value === "string" && value !== "")
    .join("\n");
}

function mapPiFileChangeKind(
  changeType: Extract<
    PiSdkRunnerEvent,
    { eventType: "file_change_observed" }
  >["changeType"]
): "add" | "delete" | "update" {
  switch (changeType) {
    case "added":
      return "add";
    case "deleted":
      return "delete";
    case "modified":
    default:
      return "update";
  }
}
