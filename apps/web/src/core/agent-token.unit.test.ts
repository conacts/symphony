import { describe, expect, it } from "vitest";
import {
  buildAgentTurnTokenRows,
  sumTurnTokenTotals
} from "@/core/agent-token";
import {
  buildSymphonyAgentRunArtifactsResult,
  buildSymphonyForensicsRunDetailResult
} from "@/test-support/build-symphony-dashboard-view-fixtures";

describe("agent token", () => {
  it("includes cached input in fallback turn totals when totalTokens is missing", () => {
    const runArtifacts = buildSymphonyAgentRunArtifactsResult();
    const turn = runArtifacts.turns[0];

    if (!turn || !turn.usage) {
      throw new Error("Expected default test fixture turn usage.");
    }

    turn.totalTokens = 0;
    turn.usage.input_tokens = 12;
    turn.usage.cached_input_tokens = 5;
    turn.usage.output_tokens = 8;

    const rows = buildAgentTurnTokenRows({ runArtifacts });

    expect(rows[0]).toMatchObject({
      inputTokens: 12,
      cachedInputTokens: 5,
      outputTokens: 8,
      totalTokens: 25
    });
    expect(sumTurnTokenTotals(rows)).toMatchObject({
      inputTokens: 12,
      cachedInputTokens: 5,
      outputTokens: 8,
      totalTokens: 25
    });
  });

  it("falls back to forensics turn usage when run artifacts store zero token values", () => {
    const runArtifacts = buildSymphonyAgentRunArtifactsResult();
    const runDetail = buildSymphonyForensicsRunDetailResult();
    const turn = runArtifacts.turns[0];
    const forensicsTurn = runDetail.turns[0];

    if (!turn || !forensicsTurn || !forensicsTurn.usage) {
      throw new Error("Expected default test fixture turn usage.");
    }

    turn.usage = null;
    turn.inputTokens = 0;
    turn.cachedInputTokens = 0;
    turn.outputTokens = 0;
    turn.totalTokens = 0;
    forensicsTurn.usage.input_tokens = 120;
    forensicsTurn.usage.cached_input_tokens = 40;
    forensicsTurn.usage.output_tokens = 80;

    const rows = buildAgentTurnTokenRows({
      runArtifacts,
      forensicsTurns: runDetail.turns
    });

    expect(rows[0]).toMatchObject({
      inputTokens: 120,
      cachedInputTokens: 40,
      outputTokens: 80,
      totalTokens: 240
    });
  });
});
