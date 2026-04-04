import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RunTranscriptView } from "@/features/runs/components/run-transcript-view";
import {
  buildSymphonyCodexRunArtifactsResult,
  buildSymphonyForensicsRunDetailResult
} from "@/test-support/build-symphony-dashboard-view-fixtures";

describe("run transcript view", () => {
  it("renders the structured Codex transcript", () => {
    const html = renderToStaticMarkup(
      <RunTranscriptView
        runtimeBaseUrl="http://127.0.0.1:4400"
        error={null}
        loading={false}
        resource={{
          runDetail: buildSymphonyForensicsRunDetailResult(),
          runArtifacts: buildSymphonyCodexRunArtifactsResult(),
          codexError: null
        }}
      />
    );

    expect(html).toContain("Structured run conversation");
    expect(html).toContain("Turn tokens");
    expect(html).toContain("Turn token breakdown");
    expect(html).toContain("Turn latency");
    expect(html).toContain("Turn latency breakdown");
    expect(html).toContain("Execution performance");
    expect(html).toContain("Slow command executions");
    expect(html).toContain("Turn 1");
    expect(html).toContain("data-slot=\"accordion-trigger\"");
    expect(html).toContain("Tool call");
    expect(html).toContain("Debug context");
    expect(html).toContain("View full message");
  });
});
