import type { PiSdkThreadItemState } from "./stream-events.js";

type PiSdkToolPlanningState = Pick<PiSdkThreadItemState, "toolCallArguments">;

export function parsePiToolArguments(argumentsText: string | null): unknown {
  if (argumentsText === null) {
    return {};
  }

  try {
    return JSON.parse(argumentsText);
  } catch {
    return {
      raw: argumentsText
    };
  }
}

export function rememberPiToolCallArguments(
  state: PiSdkToolPlanningState,
  callId: string,
  argumentsText: string | null
): unknown {
  const argumentsValue = parsePiToolArguments(argumentsText);
  state.toolCallArguments.set(callId, argumentsValue);
  return argumentsValue;
}

export function peekPiToolCallArguments(
  state: PiSdkToolPlanningState,
  callId: string,
  argumentsText: string | null
): unknown {
  return state.toolCallArguments.get(callId) ?? parsePiToolArguments(argumentsText);
}

export function consumePiToolCallArguments(
  state: PiSdkToolPlanningState,
  callId: string
): unknown {
  const argumentsValue = state.toolCallArguments.get(callId) ?? {};
  state.toolCallArguments.delete(callId);
  return argumentsValue;
}
