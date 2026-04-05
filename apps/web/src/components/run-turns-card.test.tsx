import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RunTurnsCard } from "@/features/runs/components/run-turns-card";

describe("run turns card", () => {
  it("renders turn rows", () => {
    const html = renderToStaticMarkup(
      <RunTurnsCard
        title="Turns"
        description="Run turn breakdown."
        rows={[
          {
            turnId: "turn_123",
            turnSequence: 1,
            href: "/issues/COL-184/runs/run_123/turns/turn_123",
            startedAt: "Apr 5, 10:00 AM",
            endedAt: "Apr 5, 10:01 AM",
            status: "Running",
            tokenSummary: "Usage unavailable",
            commandCount: "23",
            toolCount: "60",
            reasoningCount: "56"
          }
        ]}
      />
    );

    expect(html).toContain("Turns");
    expect(html).toContain("/issues/COL-184/runs/run_123/turns/turn_123");
    expect(html).toContain("60");
  });

  it("renders the empty state when no turns are present", () => {
    const html = renderToStaticMarkup(
      <RunTurnsCard title="Turns" description="Run turn breakdown." rows={[]} />
    );

    expect(html).toContain("No turns were recorded for this run.");
  });
});
