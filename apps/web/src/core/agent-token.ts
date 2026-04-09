import type {
  SymphonyAgentRunArtifactsResult,
  SymphonyForensicsRunDetailResult
} from "@symphony/contracts";

type AgentTurnTokenRow = {
  turnId: string;
  turnSequence: number;
  turnLabel: string;
  issueIdentifier: string;
  runId: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export function buildAgentTurnTokenRows(input: {
  runArtifacts: SymphonyAgentRunArtifactsResult;
  forensicsTurns?: SymphonyForensicsRunDetailResult["turns"];
}): AgentTurnTokenRow[] {
  const turnSequenceMap = new Map(
    (input.forensicsTurns ?? []).map((turn) => [
      turn.turnId,
      turn.turnSequence
    ])
  );
  const forensicsTurnMap = new Map(
    (input.forensicsTurns ?? []).map((turn) => [turn.turnId, turn] as const)
  );

  return input.runArtifacts.turns
    .slice()
    .sort(
      (left, right) =>
        (turnSequenceMap.get(left.turnId) ?? Number.MAX_SAFE_INTEGER) -
        (turnSequenceMap.get(right.turnId) ?? Number.MAX_SAFE_INTEGER)
    )
    .map((turn, index) => {
      const forensicsTurn = forensicsTurnMap.get(turn.turnId);
      const inputTokens =
        turn.usage?.input_tokens ??
        (turn.inputTokens && turn.inputTokens > 0 ? turn.inputTokens : null) ??
        forensicsTurn?.usage?.input_tokens ??
        0;
      const cachedInputTokens =
        turn.usage?.cached_input_tokens ??
        (turn.cachedInputTokens && turn.cachedInputTokens > 0
          ? turn.cachedInputTokens
          : null) ??
        forensicsTurn?.usage?.cached_input_tokens ??
        0;
      const outputTokens =
        turn.usage?.output_tokens ??
        (turn.outputTokens && turn.outputTokens > 0 ? turn.outputTokens : null) ??
        forensicsTurn?.usage?.output_tokens ??
        0;
      const totalTokens =
        turn.totalTokens !== null && turn.totalTokens > 0
          ? turn.totalTokens
          : forensicsTurn?.usage
            ? forensicsTurn.usage.input_tokens +
              forensicsTurn.usage.cached_input_tokens +
              forensicsTurn.usage.output_tokens
          : inputTokens + cachedInputTokens + outputTokens;

      return {
        turnId: turn.turnId,
        turnSequence: turnSequenceMap.get(turn.turnId) ?? index + 1,
        turnLabel: `Turn ${turnSequenceMap.get(turn.turnId) ?? index + 1}`,
        issueIdentifier: input.runArtifacts.run.issueIdentifier,
        runId: turn.runId,
        inputTokens,
        cachedInputTokens,
        outputTokens,
        totalTokens
      };
    });
}

export function sumTurnTokenTotals(rows: AgentTurnTokenRow[]) {
  return rows.reduce(
    (totals, row) => ({
      inputTokens: totals.inputTokens + row.inputTokens,
      cachedInputTokens: totals.cachedInputTokens + row.cachedInputTokens,
      outputTokens: totals.outputTokens + row.outputTokens,
      totalTokens: totals.totalTokens + row.totalTokens
    }),
    {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0
    }
  );
}
