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
    const runArtifacts = buildSymphonyCodexRunArtifactsResult();
    runArtifacts.items.splice(3, 0, {
      runId: "run_123",
      turnId: "turn_123",
      itemId: "todo_123",
      itemType: "todo_list",
      startedAt: "2026-03-31T18:00:41.000Z",
      lastUpdatedAt: "2026-03-31T18:00:41.000Z",
      completedAt: "2026-03-31T18:00:41.000Z",
      finalStatus: "completed",
      updateCount: 1,
      durationMs: 1_000,
      latestPreview:
        "[x] Explore billing codebase structure; [ ] Create internal billing summaries DB action; [ ] Run verification flows",
      latestOverflowId: null,
      insertedAt: "2026-03-31T18:00:41.000Z",
      updatedAt: "2026-03-31T18:00:41.000Z"
    });
    runArtifacts.run.itemCount = 5;
    if (runArtifacts.turns[0]) {
      runArtifacts.turns[0].itemCount = 5;
    }

    const viewModel = buildCodexRunViewModel({
      runDetail: buildSymphonyForensicsRunDetailResult(),
      runArtifacts
    });

    expect(viewModel.issueIdentifier).toBe("COL-165");
    expect(viewModel.metrics[0]?.value).toBe("Finished");
    expect(viewModel.metrics[1]?.value).toBe("Completed");
    expect(viewModel.metadata[0]?.value).toBe("Codex");
    expect(viewModel.metadata[1]?.value).toBe("xiaomi/mimo-v2-pro");
    expect(viewModel.metadata[2]?.value).toBe("OpenRouter");
    expect(viewModel.metadata[3]?.value).toBe("Provider API key");
    expect(viewModel.turnTokens.cards[0]?.value).toBe("120");
    expect(viewModel.turnTokens.rows[0]?.turnLabel).toBe("Turn 1");
    expect(viewModel.turnLatency.cards[0]?.value).toBe("1");
    expect(viewModel.turnLatency.rows[0]?.turnLabel).toBe("Turn 1");
    expect(viewModel.executionPerformance.cards[0]?.value).toBe("1");
    expect(viewModel.executionPerformance.cards[2]?.value).toBe("pnpm");
    expect(viewModel.transcriptTurns).toHaveLength(1);
    expect(viewModel.transcriptTurns[0]?.entries.map((entry) => entry.kind)).toEqual([
      "reasoning",
      "command",
      "tool-call",
      "todo-list",
      "agent-message"
    ]);
    const todoEntry = viewModel.transcriptTurns[0]?.entries.find(
      (entry) => entry.kind === "todo-list"
    );
    expect(todoEntry?.kind).toBe("todo-list");
    expect(todoEntry?.markdown).toContain("\n[ ] Create internal billing summaries DB action");
  });

  it("formats overflow payloads as readable text", () => {
    expect(formatOverflowContent(buildSymphonyCodexOverflowResult())).toContain(
      "Task complete."
    );
  });
});
