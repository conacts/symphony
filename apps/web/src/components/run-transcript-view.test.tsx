import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RunTranscriptView } from "@/features/runs/components/run-transcript-view";
import {
  buildSymphonyAgentRunArtifactsResult,
  buildSymphonyForensicsRunDetailResult
} from "@/test-support/build-symphony-dashboard-view-fixtures";

describe("run transcript view", () => {
  it("renders the run-level turn table instead of the full transcript", () => {
    const html = renderToStaticMarkup(
      <RunTranscriptView
        runtimeBaseUrl="http://127.0.0.1:4400"
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
    expect(html).toContain("Turn tokens");
    expect(html).toContain("Turn token breakdown");
    expect(html).toContain("Turn latency");
    expect(html).toContain("Turn latency breakdown");
    expect(html).toContain("Execution performance");
    expect(html).toContain("Command executions");
    expect(html).toContain("Tool calls");
    expect(html).toContain("/issues/COL-165/runs/run_123/turns");
    expect(html).toContain("/issues/COL-165/runs/run_123/turns/turn_123");
    expect(html).toContain("Turn 1");
    expect(html).toContain("Commands");
    expect(html).toContain("Tools");
    expect(html).toContain("Reasoning");
    expect(html).not.toContain("Prompt");
    expect(html).not.toContain("Browse turns");
    expect(html).not.toContain("<p class=\"text-sm font-medium text-muted-foreground\">COL-165</p>");
    expect(html).not.toContain("Structured run conversation");
    expect(html).toContain("Debug context");
  });
});
