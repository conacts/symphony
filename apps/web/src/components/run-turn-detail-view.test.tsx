import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RunTurnDetailView } from "@/features/runs/components/run-turn-detail-view";
import {
  buildSymphonyAgentRunArtifactsResult,
  buildSymphonyForensicsRunDetailResult
} from "@/test-support/build-symphony-dashboard-view-fixtures";

describe("run turn detail view", () => {
  it("renders a single turn drilldown with nested breadcrumb links", () => {
    const html = renderToStaticMarkup(
      <RunTurnDetailView
        error={null}
        loading={false}
        resource={{
          runDetail: buildSymphonyForensicsRunDetailResult(),
          runArtifacts: buildSymphonyAgentRunArtifactsResult(),
          agentError: null
        }}
        turnId="turn_123"
        onOpenOverflow={vi.fn()}
      />
    );

    expect(html).toContain("Turn transcript");
    expect(html).toContain("Single-turn drilldown");
    expect(html).not.toContain("Back to turns table");
    expect(html).toContain("Turn 1");
    expect(html).toContain("Operator prompt");
    expect(html).toContain("Reasoning");
    expect(html).toContain("Execution log");
    expect(html).toContain("Assistant output");
    expect(html).toContain("In 120 · Cached 40 · Out 80");
    expect(html).toContain("Tokens 240 · In 120 · Cached 40 · Out 80");
    expect(html).not.toContain("Openrouter / Responses");
  });

  it("renders a task timeline section when todo snapshots are present", () => {
    const runArtifacts = buildSymphonyAgentRunArtifactsResult();
    runArtifacts.taskSnapshots.push({
      snapshotId: "snapshot_123",
      runId: "run_123",
      turnId: "turn_123",
      itemId: "todo_123",
      sourceKind: "pi",
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
        }
      ]
    });
    runArtifacts.items.push({
      runId: "run_123",
      turnId: "turn_123",
      itemId: "todo_123",
      itemType: "todo_list",
      startedAt: "2026-03-31T18:00:42.000Z",
      lastUpdatedAt: "2026-03-31T18:00:42.000Z",
      completedAt: "2026-03-31T18:00:42.000Z",
      finalStatus: "completed",
      updateCount: 1,
      durationMs: 0,
      latestPreview: "Keep the patch scoped",
      latestOverflowId: null,
      insertedAt: "2026-03-31T18:00:42.000Z",
      updatedAt: "2026-03-31T18:00:42.000Z"
    });
    if (runArtifacts.turnActivities[0]) {
      runArtifacts.turnActivities[0] = {
        ...runArtifacts.turnActivities[0],
        taskSnapshots: [runArtifacts.taskSnapshots[0]!]
      };
    }
    if (runArtifacts.turns[0]) {
      runArtifacts.turns[0] = {
        ...runArtifacts.turns[0],
        itemCount: runArtifacts.turns[0].itemCount + 1
      };
    }
    runArtifacts.run.itemCount += 1;

    const html = renderToStaticMarkup(
      <RunTurnDetailView
        error={null}
        loading={false}
        resource={{
          runDetail: buildSymphonyForensicsRunDetailResult(),
          runArtifacts,
          agentError: null
        }}
        turnId="turn_123"
        onOpenOverflow={vi.fn()}
      />
    );

    expect(html).toContain("Task timeline");
    expect(html).toContain("Structured task-state updates captured during the turn.");
    expect(html).toContain("Keep the patch scoped");
  });

  it("renders a not found state when the turn is missing", () => {
    const html = renderToStaticMarkup(
      <RunTurnDetailView
        error={null}
        loading={false}
        resource={{
          runDetail: buildSymphonyForensicsRunDetailResult(),
          runArtifacts: buildSymphonyAgentRunArtifactsResult(),
          agentError: null
        }}
        turnId="missing_turn"
        onOpenOverflow={vi.fn()}
      />
    );

    expect(html).toContain("Turn not found");
    expect(html).toContain("could not be found for this run");
  });
});
