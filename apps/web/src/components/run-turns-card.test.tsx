import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RunTurnsCard } from "@/features/runs/components/run-turns-card";

describe("run turns card", () => {
  it("renders turn rows and sorts by started time by default", () => {
    const html = renderToStaticMarkup(
      <RunTurnsCard
        title="Turns"
        description="Run turn breakdown."
        rows={[
          {
            turnId: "turn_old",
            turnSequence: 1,
            href: "/issues/COL-184/runs/run_123/turns/turn_old",
            startedAtIso: "2026-04-05T10:00:00.000Z",
            startedAt: "Apr 5, 10:00 AM",
            endedAtIso: "2026-04-05T10:01:00.000Z",
            endedAt: "Apr 5, 10:01 AM",
            status: "Completed",
            totalTokens: 150,
            tokenSummary: "Total 150",
            commandCount: "23",
            toolCount: "60",
            reasoningCount: "56"
          },
          {
            turnId: "turn_new",
            turnSequence: 2,
            href: "/issues/COL-184/runs/run_123/turns/turn_new",
            startedAtIso: "2026-04-05T10:02:00.000Z",
            startedAt: "Apr 5, 10:02 AM",
            endedAtIso: "2026-04-05T10:03:00.000Z",
            endedAt: "Apr 5, 10:03 AM",
            status: "Completed",
            totalTokens: 240,
            tokenSummary: "Total 240",
            commandCount: "23",
            toolCount: "60",
            reasoningCount: "56"
          }
        ]}
      />
    );

    expect(html).toContain("Turns");
    expect(html).toContain("/issues/COL-184/runs/run_123/turns/turn_new");
    expect(html).toContain("Total tokens");
    expect(html).toContain("60");
    expect(html.indexOf("Turn 2")).toBeLessThan(html.indexOf("Turn 1"));
  });

  it("renders the empty state when no turns are present", () => {
    const html = renderToStaticMarkup(
      <RunTurnsCard title="Turns" description="Run turn breakdown." rows={[]} />
    );

    expect(html).toContain("No turns were recorded for this run.");
  });
});
