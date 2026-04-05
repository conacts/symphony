import { describe, expect, it } from "vitest";
import {
  buildAgentRunViewModel,
  formatOverflowContent
} from "@/features/runs/model/agent-run-view-model";
import {
  buildSymphonyAgentOverflowResult,
  buildSymphonyAgentRunArtifactsResult,
  buildSymphonyForensicsRunDetailResult
} from "@/test-support/build-symphony-dashboard-view-fixtures";

describe("agent run view model", () => {
  it("builds machine-load cards from run summaries and falls back when unavailable", () => {
    const populated = buildAgentRunViewModel({
      runDetail: buildSymphonyForensicsRunDetailResult(),
      runArtifacts: buildSymphonyAgentRunArtifactsResult()
    });
    const unavailableRunDetail = buildSymphonyForensicsRunDetailResult();
    unavailableRunDetail.run.machineLoad = null;

    const unavailable = buildAgentRunViewModel({
      runDetail: unavailableRunDetail,
      runArtifacts: buildSymphonyAgentRunArtifactsResult()
    });

    expect(populated.machineLoadCards).toEqual([
      {
        label: "Peak CPU load",
        value: "71%",
        detail: "Average 52% across 6 samples."
      },
      {
        label: "Peak memory load",
        value: "64%",
        detail: "Average 58%."
      },
      {
        label: "Peak disk load",
        value: "47%",
        detail: "Average 47%."
      }
    ]);
    expect(unavailable.machineLoadCards).toEqual([
      {
        label: "Peak CPU load",
        value: "n/a",
        detail: "Machine load was not sampled for this run."
      },
      {
        label: "Peak memory load",
        value: "n/a",
        detail: "Machine load was not sampled for this run."
      },
      {
        label: "Peak disk load",
        value: "n/a",
        detail: "Machine load was not sampled for this run."
      }
    ]);
  });

  it("builds a structured transcript from agent artifacts", () => {
    const runArtifacts = buildSymphonyAgentRunArtifactsResult();
    const runDetail = buildSymphonyForensicsRunDetailResult();
    runArtifacts.run.harnessKind = "pi";
    if (runArtifacts.turns[0]) {
      runArtifacts.turns[0].harnessKind = "pi";
      runArtifacts.turns[0].reasoningCount = 2;
    }
    runDetail.run.agentHarness = "pi";
    runArtifacts.items.splice(4, 0, {
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
      recordedAt: "2026-03-31T18:00:11.000Z",
      insertedAt: "2026-03-31T18:00:11.000Z",
      updatedAt: "2026-03-31T18:00:11.000Z"
    });
    runArtifacts.items.splice(5, 0, {
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
    runArtifacts.items.splice(2, 0, {
      runId: "run_123",
      turnId: "turn_123",
      itemId: "tool_read_1",
      itemType: "mcp_tool_call",
      startedAt: "2026-03-31T18:00:20.000Z",
      lastUpdatedAt: "2026-03-31T18:00:21.000Z",
      completedAt: "2026-03-31T18:00:21.000Z",
      finalStatus: "completed",
      updateCount: 1,
      durationMs: 1_000,
      latestPreview: "Read README.md",
      latestOverflowId: null,
      insertedAt: "2026-03-31T18:00:20.000Z",
      updatedAt: "2026-03-31T18:00:21.000Z"
    });
    runArtifacts.items.splice(3, 0, {
      runId: "run_123",
      turnId: "turn_123",
      itemId: "tool_read_2",
      itemType: "mcp_tool_call",
      startedAt: "2026-03-31T18:00:22.000Z",
      lastUpdatedAt: "2026-03-31T18:00:23.000Z",
      completedAt: "2026-03-31T18:00:23.000Z",
      finalStatus: "completed",
      updateCount: 1,
      durationMs: 1_000,
      latestPreview: "Read src/index.ts",
      latestOverflowId: null,
      insertedAt: "2026-03-31T18:00:22.000Z",
      updatedAt: "2026-03-31T18:00:23.000Z"
    });
    runArtifacts.items.splice(4, 0, {
      runId: "run_123",
      turnId: "turn_123",
      itemId: "tool_edit_1",
      itemType: "mcp_tool_call",
      startedAt: "2026-03-31T18:00:24.000Z",
      lastUpdatedAt: "2026-03-31T18:00:24.500Z",
      completedAt: "2026-03-31T18:00:24.500Z",
      finalStatus: "completed",
      updateCount: 1,
      durationMs: 500,
      latestPreview: "Edited packages/db/src/index.ts",
      latestOverflowId: null,
      insertedAt: "2026-03-31T18:00:24.000Z",
      updatedAt: "2026-03-31T18:00:24.500Z"
    });
    runArtifacts.items.splice(5, 0, {
      runId: "run_123",
      turnId: "turn_123",
      itemId: "tool_write_1",
      itemType: "mcp_tool_call",
      startedAt: "2026-03-31T18:00:24.000Z",
      lastUpdatedAt: "2026-03-31T18:00:25.000Z",
      completedAt: "2026-03-31T18:00:25.000Z",
      finalStatus: "completed",
      updateCount: 1,
      durationMs: 1_000,
      latestPreview: "Wrote packages/db/src/index.ts",
      latestOverflowId: null,
      insertedAt: "2026-03-31T18:00:24.000Z",
      updatedAt: "2026-03-31T18:00:25.000Z"
    });
    runArtifacts.items.splice(6, 0, {
      runId: "run_123",
      turnId: "turn_123",
      itemId: "tool_grep_1",
      itemType: "mcp_tool_call",
      startedAt: "2026-03-31T18:00:26.000Z",
      lastUpdatedAt: "2026-03-31T18:00:27.000Z",
      completedAt: "2026-03-31T18:00:27.000Z",
      finalStatus: "completed",
      updateCount: 1,
      durationMs: 1_000,
      latestPreview: "Searched for agent naming references",
      latestOverflowId: null,
      insertedAt: "2026-03-31T18:00:26.000Z",
      updatedAt: "2026-03-31T18:00:27.000Z"
    });
    runArtifacts.items.splice(7, 0, {
      runId: "run_123",
      turnId: "turn_123",
      itemId: "tool_find_1",
      itemType: "mcp_tool_call",
      startedAt: "2026-03-31T18:00:28.000Z",
      lastUpdatedAt: "2026-03-31T18:00:29.000Z",
      completedAt: "2026-03-31T18:00:29.000Z",
      finalStatus: "completed",
      updateCount: 1,
      durationMs: 1_000,
      latestPreview: "Found analytics store files",
      latestOverflowId: null,
      insertedAt: "2026-03-31T18:00:28.000Z",
      updatedAt: "2026-03-31T18:00:29.000Z"
    });
    runArtifacts.toolCalls.unshift(
      {
        runId: "run_123",
        turnId: "turn_123",
        itemId: "tool_read_1",
        server: "pi",
        tool: "read",
        status: "completed",
        errorMessage: null,
        argumentsJson: {
          path: "README.md"
        },
        resultPreview: "README contents",
        resultOverflowId: null,
        startedAt: "2026-03-31T18:00:20.000Z",
        completedAt: "2026-03-31T18:00:21.000Z",
        durationMs: 1_000,
        insertedAt: "2026-03-31T18:00:20.000Z",
        updatedAt: "2026-03-31T18:00:21.000Z"
      },
      {
        runId: "run_123",
        turnId: "turn_123",
        itemId: "tool_read_2",
        server: "pi",
        tool: "read",
        status: "completed",
        errorMessage: null,
        argumentsJson: {
          path: "src/index.ts"
        },
        resultPreview: "index contents",
        resultOverflowId: null,
        startedAt: "2026-03-31T18:00:22.000Z",
        completedAt: "2026-03-31T18:00:23.000Z",
        durationMs: 1_000,
        insertedAt: "2026-03-31T18:00:22.000Z",
        updatedAt: "2026-03-31T18:00:23.000Z"
      },
      {
        runId: "run_123",
        turnId: "turn_123",
        itemId: "tool_edit_1",
        server: "pi",
        tool: "edit",
        status: "completed",
        errorMessage: null,
        argumentsJson: {
          path: "packages/db/src/index.ts",
          edits: [
            {
              old_string: "const oldValue = 1;",
              new_text: "const newValue = 2;"
            },
            {
              old_text: "return oldValue;",
              new_string: "return newValue;"
            }
          ]
        },
        resultPreview: "Updated packages/db/src/index.ts",
        resultOverflowId: null,
        startedAt: "2026-03-31T18:00:24.000Z",
        completedAt: "2026-03-31T18:00:24.500Z",
        durationMs: 500,
        insertedAt: "2026-03-31T18:00:24.000Z",
        updatedAt: "2026-03-31T18:00:24.500Z"
      },
      {
        runId: "run_123",
        turnId: "turn_123",
        itemId: "tool_write_1",
        server: "pi",
        tool: "write",
        status: "completed",
        errorMessage: null,
        argumentsJson: {
          path: "packages/db/src/index.ts",
          file_text: "export const first = 1;\nexport const second = 2;"
        },
        resultPreview: "File updated",
        resultOverflowId: null,
        startedAt: "2026-03-31T18:00:24.000Z",
        completedAt: "2026-03-31T18:00:25.000Z",
        durationMs: 1_000,
        insertedAt: "2026-03-31T18:00:24.000Z",
        updatedAt: "2026-03-31T18:00:25.000Z"
      },
      {
        runId: "run_123",
        turnId: "turn_123",
        itemId: "tool_grep_1",
        server: "pi",
        tool: "grep",
        status: "completed",
        errorMessage: null,
        argumentsJson: {
          pattern: "agentRun",
          path: "packages/db/src",
          ignoreCase: true
        },
        resultPreview: "Found 4 matches",
        resultOverflowId: null,
        piGrep: {
          pattern: "agentRun",
          path: "packages/db/src",
          ignoreCase: true
        },
        startedAt: "2026-03-31T18:00:26.000Z",
        completedAt: "2026-03-31T18:00:27.000Z",
        durationMs: 1_000,
        insertedAt: "2026-03-31T18:00:26.000Z",
        updatedAt: "2026-03-31T18:00:27.000Z"
      },
      {
        runId: "run_123",
        turnId: "turn_123",
        itemId: "tool_find_1",
        server: "pi",
        tool: "find",
        status: "completed",
        errorMessage: null,
        argumentsJson: {
          pattern: "agent-analytics-read-store.ts",
          path: "packages"
        },
        resultPreview: "Found matching file",
        resultOverflowId: null,
        piFind: {
          pattern: "agent-analytics-read-store.ts",
          path: "packages"
        },
        startedAt: "2026-03-31T18:00:28.000Z",
        completedAt: "2026-03-31T18:00:29.000Z",
        durationMs: 1_000,
        insertedAt: "2026-03-31T18:00:28.000Z",
        updatedAt: "2026-03-31T18:00:29.000Z"
      }
    );
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
    if (runArtifacts.turnActivities[0]) {
      runArtifacts.turnActivities[0] = {
        ...runArtifacts.turnActivities[0],
        fileChanges: [],
        taskSnapshots: [runArtifacts.taskSnapshots[0]!]
      };
    }
    runArtifacts.run.itemCount = 11;
    if (runArtifacts.turns[0]) {
      runArtifacts.turns[0].itemCount = 11;
      runArtifacts.turns[0].fileChangeCount = 0;
    }

    const viewModel = buildAgentRunViewModel({
      runDetail,
      runArtifacts
    });

    expect(viewModel.issueIdentifier).toBe("COL-165");
    expect(viewModel.metrics[0]?.value).toBe("Finished");
    expect(viewModel.metrics[1]?.value).toBe("Completed");
    expect(viewModel.harnessLabel).toBe("Pi");
    const metadata = new Map(viewModel.metadata.map((entry) => [entry.label, entry.value] as const));
    expect(metadata.get("Harness")).toBe("Pi");
    expect(metadata.get("Model")).toBe("xiaomi/mimo-v2-pro");
    expect(metadata.get("Provider")).toBe("OpenRouter");
    expect(metadata.get("Auth")).toBe("Provider API key");
    expect(metadata.get("Provider env")).toBe("OpenRouter API key");
    expect(metadata.get("PI profile")).toBe("mimo-v2-pro");
    expect(metadata.get("Reasoning")).toBe("High");
    expect(metadata.get("PI thread")).toBe("thread_123");
    expect(metadata.get("PI process")).toBe("pi-process-123");
    expect(metadata.get("Launch target")).toBe(
      "container / symphony-col-165 / /workspace"
    );
    expect(viewModel.turnTokens.cards[0]?.value).toBe("120");
    expect(viewModel.turnTokens.rows[0]?.turnLabel).toBe("Turn 1");
    expect(viewModel.turnLatency.cards[0]?.value).toBe("1");
    expect(viewModel.turnLatency.rows[0]?.turnLabel).toBe("Turn 1");
    expect(viewModel.executionPerformance.commandSummary).toBe(
      "1 executions · 0 failed or degraded"
    );
    expect(viewModel.executionPerformance.toolSummary).toBe(
      "7 calls · 0 failed or degraded"
    );
    expect(viewModel.executionPerformance.commandRows[0]?.label).toBe(
      "pnpm lint && pnpm test"
    );
    expect(viewModel.executionPerformance.toolRows.map((row) => row.label)).toContain(
      "pi.read"
    );
    expect(viewModel.routes.issueHref).toBe("/issues/COL-165");
    expect(viewModel.routes.runHref).toBe("/issues/COL-165/runs/run_123");
    expect(viewModel.routes.turnsHref).toBe("/issues/COL-165/runs/run_123/turns");
    expect(viewModel.routes.transcriptHref).toBe("/runs/run_123");
    expect(viewModel.transcriptTurns).toHaveLength(1);
    expect(viewModel.turnRows[0]).toMatchObject({
      turnId: "turn_123",
      turnSequence: 1,
      href: "/issues/COL-165/runs/run_123/turns/turn_123",
      commandCount: "1",
      toolCount: "1",
      reasoningCount: "2"
    });
    expect(viewModel.transcriptTurns[0]?.countsSummary).toContain("1 task updates");
    expect(viewModel.transcriptTurns[0]?.activitySummary).toEqual([
      {
        label: "Task queue",
        value: "3 tasks",
        detail: "1 updates · 1 in progress · 1 completed · 1 pending"
      }
    ]);
    expect(viewModel.transcriptTurns[0]?.entries.map((entry) => entry.kind)).toEqual([
      "reasoning",
      "command",
      "pi-read-task",
      "pi-edit-task",
      "pi-write-task",
      "pi-grep-task",
      "pi-find-task",
      "tool-call",
      "todo-list",
      "agent-message",
      "todo-list"
    ]);
    const todoEntry = viewModel.transcriptTurns[0]?.entries.find(
      (entry) => entry.kind === "todo-list"
    );
    const reasoningEntry = viewModel.transcriptTurns[0]?.entries.find(
      (entry) => entry.kind === "reasoning"
    );
    const piReadEntry = viewModel.transcriptTurns[0]?.entries.find(
      (entry) => entry.kind === "pi-read-task"
    );
    const piEditEntry = viewModel.transcriptTurns[0]?.entries.find(
      (entry) => entry.kind === "pi-edit-task"
    );
    const piWriteEntry = viewModel.transcriptTurns[0]?.entries.find(
      (entry) => entry.kind === "pi-write-task"
    );
    const piGrepEntry = viewModel.transcriptTurns[0]?.entries.find(
      (entry) => entry.kind === "pi-grep-task"
    );
    const piFindEntry = viewModel.transcriptTurns[0]?.entries.find(
      (entry) => entry.kind === "pi-find-task"
    );
    expect(reasoningEntry?.kind).toBe("reasoning");
    expect(reasoningEntry?.segmentCount).toBe(2);
    expect(reasoningEntry?.preview).toContain(
      "Checking the pending task queue before continuing."
    );
    expect(piReadEntry?.kind).toBe("pi-read-task");
    expect(piReadEntry?.readCount).toBe(2);
    expect(piReadEntry?.paths).toEqual(["README.md", "src/index.ts"]);
    expect(piEditEntry?.kind).toBe("pi-edit-task");
    expect(piEditEntry?.editCount).toBe(1);
    expect(piEditEntry?.paths).toEqual(["packages/db/src/index.ts"]);
    expect(piEditEntry?.lineCount).toBe(2);
    expect(piEditEntry?.diffText).toContain("@@ edit 1 @@");
    expect(piEditEntry?.diffText).toContain("-const oldValue = 1;");
    expect(piEditEntry?.diffText).toContain("+const newValue = 2;");
    expect(piWriteEntry?.kind).toBe("pi-write-task");
    expect(piWriteEntry?.writeCount).toBe(1);
    expect(piWriteEntry?.lineCount).toBe(2);
    expect(piWriteEntry?.paths).toEqual(["packages/db/src/index.ts"]);
    expect(piGrepEntry?.kind).toBe("pi-grep-task");
    expect(piGrepEntry?.grepCount).toBe(1);
    expect(piGrepEntry?.queries).toEqual([
      {
        pattern: "agentRun",
        path: "packages/db/src",
        ignoreCase: true
      }
    ]);
    expect(piFindEntry?.kind).toBe("pi-find-task");
    expect(piFindEntry?.findCount).toBe(1);
    expect(piFindEntry?.queries).toEqual([
      {
        pattern: "agent-analytics-read-store.ts",
        path: "packages"
      }
    ]);
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
    expect(formatOverflowContent(buildSymphonyAgentOverflowResult())).toContain(
      "Task complete."
    );
  });

  it("falls back to turn token totals when run-level token rollups are zero", () => {
    const runArtifacts = buildSymphonyAgentRunArtifactsResult();
    const runDetail = buildSymphonyForensicsRunDetailResult();

    runArtifacts.run.inputTokens = 0;
    runArtifacts.run.cachedInputTokens = 0;
    runArtifacts.run.outputTokens = 0;
    runArtifacts.run.totalTokens = 0;
    runArtifacts.turns[0]!.totalTokens = 0;
    runDetail.run.inputTokens = 0;
    runDetail.run.outputTokens = 0;
    runDetail.run.totalTokens = 0;

    const viewModel = buildAgentRunViewModel({
      runDetail,
      runArtifacts
    });

    expect(viewModel.metrics[3]).toEqual({
      label: "Tokens",
      value: "200",
      detail: "In 120 / Cached 0 / Out 80"
    });
    expect(viewModel.turnTokens.cards[1]).toEqual({
      label: "Turn output tokens",
      value: "80",
      detail: "200 total turn tokens across the run."
    });
    expect(viewModel.turnTokens.rows[0]?.totalTokens).toBe(200);
  });
});
