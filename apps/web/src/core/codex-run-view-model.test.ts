import { describe, expect, it } from "vitest";
import {
  buildCodexRunViewModel,
  formatOverflowContent
} from "@/features/runs/model/codex-run-view-model";
import {
  buildSymphonyCodexOverflowResult,
  buildSymphonyCodexRunArtifactsResult,
  buildSymphonyForensicsRunDetailResult
} from "@/test-support/build-symphony-dashboard-view-fixtures";

describe("codex run view model", () => {
  it("builds a structured transcript from Codex artifacts", () => {
    const viewModel = buildCodexRunViewModel({
      runDetail: buildSymphonyForensicsRunDetailResult(),
      runArtifacts: buildSymphonyCodexRunArtifactsResult()
    });

    expect(viewModel.issueIdentifier).toBe("COL-165");
    expect(viewModel.metrics[0]?.value).toBe("finished");
    expect(viewModel.metrics[1]?.value).toBe("completed");
    expect(viewModel.metadata[0]?.value).toBe("OpenRouter");
    expect(viewModel.metadata[1]?.value).toBe("api_key_env");
    expect(viewModel.turnLatency.cards[0]?.value).toBe("1");
    expect(viewModel.turnLatency.rows[0]?.turnLabel).toBe("Turn 1");
    expect(viewModel.executionPerformance.cards[0]?.value).toBe("1");
    expect(viewModel.executionPerformance.cards[2]?.value).toBe("pnpm");
    expect(viewModel.transcriptTurns).toHaveLength(1);
    expect(viewModel.transcriptTurns[0]?.entries.map((entry) => entry.kind)).toEqual([
      "reasoning",
      "command",
      "tool-call",
      "agent-message"
    ]);
  });

  it("formats overflow payloads as readable text", () => {
    expect(formatOverflowContent(buildSymphonyCodexOverflowResult())).toContain(
      "Task complete."
    );
  });
});
