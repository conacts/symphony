import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IssueRunHistoryCard } from "@/features/issues/components/issue-run-history-card";

describe("issue run history card", () => {
  it("renders rows when run history exists", () => {
    const html = renderToStaticMarkup(
      <IssueRunHistoryCard
        rows={[
          {
            runId: "09cacfc1-1234",
            runHref: "/issues/COL-184/runs/09cacfc1-1234",
            startedAtIso: "2026-04-05T15:00:00.000Z",
            startedAt: "Apr 5, 10:00 AM",
            durationSeconds: "45s",
            totalTokens: "1,240",
            turnsAndEvents: "3 / 12",
            model: "gpt-5.4",
            status: "Completed",
            outcome: "Success"
          }
        ]}
      />
    );

    expect(html).toContain("Run history");
    expect(html).toContain("Status filter");
    expect(html).toContain("Outcome filter");
    expect(html).toContain("Model filter");
    expect(html).toContain("/issues/COL-184/runs/09cacfc1-1234");
    expect(html).toContain("1,240");
  });

  it("renders the empty state when no runs are present", () => {
    const html = renderToStaticMarkup(<IssueRunHistoryCard rows={[]} />);

    expect(html).toContain("No recorded runs for this issue yet.");
  });
});
