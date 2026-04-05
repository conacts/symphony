import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RunTurnsView } from "@/features/runs/components/run-turns-view";
import {
  buildSymphonyAgentRunArtifactsResult,
  buildSymphonyForensicsRunDetailResult
} from "@/test-support/build-symphony-dashboard-view-fixtures";

describe("run turns view", () => {
  it("renders the run turn table with nested links", () => {
    const html = renderToStaticMarkup(
      <RunTurnsView
        error={null}
        loading={false}
        resource={{
          runDetail: buildSymphonyForensicsRunDetailResult(),
          runArtifacts: buildSymphonyAgentRunArtifactsResult(),
          agentError: null
        }}
      />
    );

    expect(html).toContain("Turn table");
    expect(html).toContain("Turn 1");
    expect(html).toContain("/issues/COL-165/runs/run_123");
    expect(html).toContain("/issues/COL-165/runs/run_123/turns/turn_123");
    expect(html).toContain("Commands");
    expect(html).toContain("Tools");
    expect(html).toContain("Reasoning");
    expect(html).not.toContain("Back to run transcript");
    expect(html).not.toContain("Prompt");
  });
});
