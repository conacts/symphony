import { describe, expect, it } from "vitest";
import {
  buildAgentTurnTokenRows,
  sumTurnTokenTotals
} from "@/core/agent-token";
import { buildSymphonyAgentRunArtifactsResult } from "@/test-support/build-symphony-dashboard-view-fixtures";

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
});
