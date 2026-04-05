import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IssueFailureSignalsCard } from "@/features/issues/components/issue-failure-signals-card";

describe("issue failure signals card", () => {
  it("renders failure rows", () => {
    const html = renderToStaticMarkup(
      <IssueFailureSignalsCard
        rows={[
          {
            runId: "run_123",
            runHref: "/issues/COL-184/runs/run_123",
            outcome: "Error",
            startedAt: "Apr 5, 10:00 AM",
            errorClass: "worker_crash",
            message: "Worker disconnected mid-run."
          }
        ]}
      />
    );

    expect(html).toContain("Recent failure signals");
    expect(html).toContain("worker_crash");
    expect(html).toContain("/issues/COL-184/runs/run_123");
  });

  it("renders the empty state when no failures are present", () => {
    const html = renderToStaticMarkup(<IssueFailureSignalsCard rows={[]} />);

    expect(html).toContain("No non-success runs have been recorded for this issue.");
  });
});
