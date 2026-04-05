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
    const runDetail = buildSymphonyForensicsRunDetailResult();
    runArtifacts.run.harnessKind = "pi";
    if (runArtifacts.turns[0]) {
      runArtifacts.turns[0].harnessKind = "pi";
      runArtifacts.turns[0].reasoningCount = 2;
    }
    runDetail.run.agentHarness = "pi";
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
    runArtifacts.items.splice(1, 0, {
      runId: "run_123",
      turnId: "turn_123",
      itemId: "reasoning_456",
      itemType: "reasoning",
      startedAt: "2026-03-31T18:00:11.000Z",
      lastUpdatedAt: "2026-03-31T18:00:11.000Z",
      completedAt: "2026-03-31T18:00:11.000Z",
      finalStatus: "completed",
      updateCount: 1,
      durationMs: 1_000,
      latestPreview: "Checking the pending task queue before continuing.",
      latestOverflowId: null,
      insertedAt: "2026-03-31T18:00:11.000Z",
      updatedAt: "2026-03-31T18:00:11.000Z"
    });
    runArtifacts.reasoning.push({
      runId: "run_123",
      turnId: "turn_123",
      itemId: "reasoning_456",
      textContent: "Checking the pending task queue before continuing.",
      textPreview: "Checking the pending task queue before continuing.",
      textOverflowId: null,
      insertedAt: "2026-03-31T18:00:11.000Z",
      updatedAt: "2026-03-31T18:00:11.000Z"
    });
    runArtifacts.items.splice(4, 0, {
      runId: "run_123",
      turnId: "turn_123",
      itemId: "todo_123",
      itemType: "todo_list",
      startedAt: "2026-03-31T18:00:42.000Z",
      lastUpdatedAt: "2026-03-31T18:00:42.000Z",
      completedAt: "2026-03-31T18:00:42.000Z",
      finalStatus: "completed",
      updateCount: 2,
      durationMs: 1_000,
      latestPreview:
        "[x] Explore billing codebase structure; [x] Create internal billing summaries DB action; [ ] Run verification flows",
      latestOverflowId: null,
      insertedAt: "2026-03-31T18:00:42.000Z",
      updatedAt: "2026-03-31T18:00:42.000Z"
    });
    runArtifacts.taskSnapshots.push({
      snapshotId: "snapshot_123",
      runId: "run_123",
      turnId: "turn_123",
      itemId: "todo_123",
      sourceKind: "pi_queue_update",
      recordedAt: "2026-03-31T18:00:42.000Z",
      insertedAt: "2026-03-31T18:00:42.000Z",
      items: [
        {
          snapshotId: "snapshot_123",
          position: 0,
          label: "Keep the patch scoped",
          state: "pending",
          section: "steering",
          insertedAt: "2026-03-31T18:00:42.000Z"
        },
        {
          snapshotId: "snapshot_123",
          position: 1,
          label: "Create internal billing summaries DB action",
          state: "in_progress",
          section: "follow_up",
          insertedAt: "2026-03-31T18:00:42.000Z"
        },
        {
          snapshotId: "snapshot_123",
          position: 2,
          label: "Run verification flows",
          state: "completed",
          section: null,
          insertedAt: "2026-03-31T18:00:42.000Z"
        }
      ]
    });
    runArtifacts.run.itemCount = 7;
    if (runArtifacts.turns[0]) {
      runArtifacts.turns[0].itemCount = 7;
    }

    const viewModel = buildCodexRunViewModel({
      runDetail,
      runArtifacts
    });

    expect(viewModel.issueIdentifier).toBe("COL-165");
    expect(viewModel.metrics[0]?.value).toBe("Finished");
    expect(viewModel.metrics[1]?.value).toBe("Completed");
    expect(viewModel.harnessLabel).toBe("Pi");
    expect(viewModel.metadata[0]?.value).toBe("Pi");
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
    const reasoningEntry = viewModel.transcriptTurns[0]?.entries.find(
      (entry) => entry.kind === "reasoning"
    );
    expect(reasoningEntry?.kind).toBe("reasoning");
    expect(reasoningEntry?.segmentCount).toBe(2);
    expect(reasoningEntry?.preview).toContain(
      "Checking the pending task queue before continuing."
    );
    expect(todoEntry?.kind).toBe("todo-list");
    expect(todoEntry?.markdown).toContain("**Steering**");
    expect(todoEntry?.markdown).toContain("- [ ] Keep the patch scoped");
    expect(todoEntry?.markdown).toContain("**Follow-up**");
    expect(todoEntry?.markdown).toContain(
      "- In progress: Create internal billing summaries DB action"
    );
    expect(todoEntry?.markdown).toContain("- [x] Run verification flows");
  });

  it("formats overflow payloads as readable text", () => {
    expect(formatOverflowContent(buildSymphonyCodexOverflowResult())).toContain(
      "Task complete."
    );
  });
});
