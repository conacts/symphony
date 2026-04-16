import {
  buildPiRunnerRunTurnCommand
} from "../client/bootstrap.js";
import {
  createThreadItemState,
  type PiSdkThreadItemState
} from "./stream-events.js";
import type { PiRunnerCommand } from "../runner-contract.js";

export type PreparedPiRunnerTurn = {
  turnId: string;
  threadState: PiSdkThreadItemState;
  command: Extract<PiRunnerCommand, { commandType: "run_turn" }>;
};

export function preparePiRunnerTurn(input: {
  turnSequence: number;
  promptTitle: string;
  promptText: string;
  turnTimeoutMs: number;
  stallTimeoutMs: number;
  toolTimeoutMs: number | null;
}): PreparedPiRunnerTurn {
  const turnId = `pi-sdk-turn-${input.turnSequence}`;

  return {
    turnId,
    threadState: createThreadItemState(),
    command: buildPiRunnerRunTurnCommand({
      turnId,
      promptTitle: input.promptTitle,
      promptText: input.promptText,
      turnTimeoutMs: input.turnTimeoutMs,
      stallTimeoutMs: input.stallTimeoutMs,
      toolTimeoutMs: input.toolTimeoutMs
    }) as Extract<PiRunnerCommand, { commandType: "run_turn" }>
  };
}
