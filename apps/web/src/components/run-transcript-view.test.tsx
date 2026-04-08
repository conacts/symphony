import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RunTranscriptView } from "@/features/runs/components/run-transcript-view";
import {
  buildSymphonyAgentRunArtifactsResult,
  buildSymphonyForensicsRunDetailResult
} from "@/test-support/build-symphony-dashboard-view-fixtures";

describe("run transcript view", () => {
  it("renders the run-level turn table and paginated turn stream", () => {
    const html = renderToStaticMarkup(
      <RunTranscriptView
        error={null}
        loading={false}
        resource={{
          runDetail: buildSymphonyForensicsRunDetailResult(),
          runArtifacts: buildSymphonyAgentRunArtifactsResult(),
          agentError: null
        }}
      />
    );

    expect(html).toContain("Turns");
    expect(html).toContain("Turn token load");
    expect(html).toContain("Run pressure");
    expect(html).toContain("/issues/COL-165/runs/run_123/turns/turn_123?repo=symphony");
    expect(html).toContain("Turn 1");
    expect(html).toContain("Commands");
    expect(html).toContain("Tools");
    expect(html).toContain("Reasoning");
    expect(html).toContain("Turn stream");
    expect(html).toContain("Open turn");
    expect(html).toContain("Showing 1-1 of 1");
    expect(html).toContain("200 tokens");
    expect(html).not.toContain("Prompt");
    expect(html).not.toContain("Browse turns");
    expect(html).not.toContain("<p class=\"text-sm font-medium text-muted-foreground\">COL-165</p>");
    expect(html).not.toContain("Structured run conversation");
    expect(html).not.toContain("Turn latency");
    expect(html).not.toContain("Execution performance");
    expect(html).not.toContain("Pi responses");
    expect(html).not.toContain("Run context");
    expect(html).not.toContain("Machine load");
    expect(html).not.toContain("Debug context");
  });

  it("limits the turn stream to the first page of newest turns", () => {
    const turnCount = 7;
    const runArtifacts = buildSymphonyAgentRunArtifactsResult({
      turns: Array.from({ length: turnCount }, (_, index) => ({
        ...buildSymphonyAgentRunArtifactsResult().turns[0]!,
        turnId: `turn_${index + 1}`,
        startedAt: `2026-03-31T18:0${index}:00.000Z`,
        endedAt: `2026-03-31T18:0${index}:30.000Z`,
        insertedAt: `2026-03-31T18:0${index}:00.000Z`,
        updatedAt: `2026-03-31T18:0${index}:30.000Z`
      })),
      items: [],
      turnActivities: [],
      taskSnapshots: [],
      run: {
        ...buildSymphonyAgentRunArtifactsResult().run,
        turnCount,
        itemCount: 0
      }
    });
    const runDetail = buildSymphonyForensicsRunDetailResult({
      turns: Array.from({ length: turnCount }, (_, index) => ({
        ...buildSymphonyForensicsRunDetailResult().turns[0]!,
        turnId: `turn_${index + 1}`,
        turnSequence: index + 1,
        promptText: `Solve task ${index + 1}`,
        startedAt: `2026-03-31T18:0${index}:00.000Z`,
        endedAt: `2026-03-31T18:0${index}:30.000Z`,
        insertedAt: `2026-03-31T18:0${index}:00.000Z`,
        updatedAt: `2026-03-31T18:0${index}:30.000Z`,
        events: []
      })),
      run: {
        ...buildSymphonyForensicsRunDetailResult().run,
        turnCount
      }
    });
    const html = renderToStaticMarkup(
      <RunTranscriptView
        error={null}
        loading={false}
        resource={{
          runDetail,
          runArtifacts,
          agentError: null
        }}
      />
    );

    expect(html).toContain("Showing 1-6 of 7");
    expect(html).toContain("Turn 7");
    expect(html).toContain("Turn 2");
    expect(html).not.toContain("Solve task 1");
  });

  it("renders degraded and empty states for missing run data", () => {
    const html = renderToStaticMarkup(
      <RunTranscriptView
        error="runtime unavailable"
        loading={false}
        resource={null}
      />
    );

    expect(html).toContain("Run transcript degraded");
    expect(html).toContain("runtime unavailable");
  });
});
