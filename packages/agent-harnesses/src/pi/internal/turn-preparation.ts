import {
  buildPiSdkRunnerRunTurnCommand
} from "../client/bootstrap.js";
import {
  createThreadItemState,
  type PiSdkThreadItemState
} from "./stream-events.js";
import type { PiSdkRunnerCommand } from "../sdk-runner-contract.js";

export type PreparedPiSdkRunnerTurn = {
  turnId: string;
  threadState: PiSdkThreadItemState;
  command: Extract<PiSdkRunnerCommand, { commandType: "run_turn" }>;
};

export function preparePiSdkRunnerTurn(input: {
  turnSequence: number;
  promptTitle: string;
  promptText: string;
  turnTimeoutMs: number;
  stallTimeoutMs: number;
  toolTimeoutMs: number | null;
}): PreparedPiSdkRunnerTurn {
  const turnId = `pi-sdk-turn-${input.turnSequence}`;

  return {
    turnId,
    threadState: createThreadItemState(),
    command: buildPiSdkRunnerRunTurnCommand({
      turnId,
      promptTitle: input.promptTitle,
      promptText: input.promptText,
      turnTimeoutMs: input.turnTimeoutMs,
      stallTimeoutMs: input.stallTimeoutMs,
      toolTimeoutMs: input.toolTimeoutMs
    }) as Extract<PiSdkRunnerCommand, { commandType: "run_turn" }>
  };
}
