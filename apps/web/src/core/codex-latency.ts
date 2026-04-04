import type {
  SymphonyCodexRunArtifactsResult,
  SymphonyForensicsRunDetailResult
} from "@symphony/contracts";

export type CodexTurnLatencyRow = {
  turnId: string;
  turnSequence: number;
  turnLabel: string;
  status: string;
  issueIdentifier: string;
  runId: string;
  wallClockMs: number;
  reasoningMs: number;
  commandMs: number;
  toolMs: number;
  messageMs: number;
  unclassifiedMs: number;
};

export function buildCodexTurnLatencyRows(input: {
  runArtifacts: SymphonyCodexRunArtifactsResult;
  forensicsTurns?: SymphonyForensicsRunDetailResult["turns"];
}): CodexTurnLatencyRow[] {
  const turnSequenceMap = new Map(
    (input.forensicsTurns ?? []).map((turn) => [
      turn.turnId,
      {
        turnSequence: turn.turnSequence,
        promptText: turn.promptText
      }
    ])
  );

  return input.runArtifacts.turns
    .slice()
    .sort((left, right) => {
      const leftSequence = turnSequenceMap.get(left.turnId)?.turnSequence ?? Number.MAX_SAFE_INTEGER;
      const rightSequence =
        turnSequenceMap.get(right.turnId)?.turnSequence ?? Number.MAX_SAFE_INTEGER;

      return leftSequence - rightSequence;
    })
    .map((turn, index) => {
      const items = input.runArtifacts.items.filter((item) => item.turnId === turn.turnId);
      const reasoningMs = sumItemDurations(items, "reasoning");
      const commandMs = sumItemDurations(items, "command_execution");
      const toolMs = sumItemDurations(items, "mcp_tool_call");
      const messageMs = sumItemDurations(items, "agent_message");
      const classifiedDuration = reasoningMs + commandMs + toolMs + messageMs;
      const wallClockMs = computeWallClockMs(turn.startedAt, turn.endedAt, classifiedDuration);

      return {
        turnId: turn.turnId,
        turnSequence: turnSequenceMap.get(turn.turnId)?.turnSequence ?? index + 1,
        turnLabel: `Turn ${turnSequenceMap.get(turn.turnId)?.turnSequence ?? index + 1}`,
        status: turn.status,
        issueIdentifier: input.runArtifacts.run.issueIdentifier,
        runId: turn.runId,
        wallClockMs,
        reasoningMs,
        commandMs,
        toolMs,
        messageMs,
        unclassifiedMs: Math.max(0, wallClockMs - classifiedDuration)
      };
    });
}

export function sumTurnLatencyTotals(rows: CodexTurnLatencyRow[]) {
  return rows.reduce(
    (totals, row) => ({
      wallClockMs: totals.wallClockMs + row.wallClockMs,
      reasoningMs: totals.reasoningMs + row.reasoningMs,
      commandMs: totals.commandMs + row.commandMs,
      toolMs: totals.toolMs + row.toolMs,
      messageMs: totals.messageMs + row.messageMs,
      unclassifiedMs: totals.unclassifiedMs + row.unclassifiedMs
    }),
    {
      wallClockMs: 0,
      reasoningMs: 0,
      commandMs: 0,
      toolMs: 0,
      messageMs: 0,
      unclassifiedMs: 0
    }
  );
}

function sumItemDurations(
  items: SymphonyCodexRunArtifactsResult["items"],
  itemType: SymphonyCodexRunArtifactsResult["items"][number]["itemType"]
) {
  return items
    .filter((item) => item.itemType === itemType)
    .reduce((total, item) => total + (item.durationMs ?? 0), 0);
}

function computeWallClockMs(
  startedAt: string | null,
  endedAt: string | null,
  fallbackDurationMs: number
) {
  if (!startedAt || !endedAt) {
    return fallbackDurationMs;
  }

  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return fallbackDurationMs;
  }

  return Math.max(0, end - start);
}
