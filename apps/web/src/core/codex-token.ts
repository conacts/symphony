import type {
  SymphonyCodexRunArtifactsResult,
  SymphonyForensicsRunDetailResult
} from "@symphony/contracts";

export type CodexTurnTokenRow = {
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

export function buildCodexTurnTokenRows(input: {
  runArtifacts: SymphonyCodexRunArtifactsResult;
  forensicsTurns?: SymphonyForensicsRunDetailResult["turns"];
}): CodexTurnTokenRow[] {
  const turnSequenceMap = new Map(
    (input.forensicsTurns ?? []).map((turn) => [
      turn.turnId,
      turn.turnSequence
    ])
  );

  return input.runArtifacts.turns
    .slice()
    .sort(
      (left, right) =>
        (turnSequenceMap.get(left.turnId) ?? Number.MAX_SAFE_INTEGER) -
        (turnSequenceMap.get(right.turnId) ?? Number.MAX_SAFE_INTEGER)
    )
    .map((turn, index) => {
      const inputTokens = turn.usage?.input_tokens ?? turn.inputTokens ?? 0;
      const cachedInputTokens =
        turn.usage?.cached_input_tokens ?? turn.cachedInputTokens ?? 0;
      const outputTokens = turn.usage?.output_tokens ?? turn.outputTokens ?? 0;

      return {
        turnId: turn.turnId,
        turnSequence: turnSequenceMap.get(turn.turnId) ?? index + 1,
        turnLabel: `Turn ${turnSequenceMap.get(turn.turnId) ?? index + 1}`,
        issueIdentifier: input.runArtifacts.run.issueIdentifier,
        runId: turn.runId,
        inputTokens,
        cachedInputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens
      };
    });
}

export function sumTurnTokenTotals(rows: CodexTurnTokenRow[]) {
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
