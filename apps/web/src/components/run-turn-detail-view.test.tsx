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
    expect(html).toContain("Openrouter / Responses");
    expect(html).toContain("Cached 40");
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
