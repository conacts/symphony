import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IssueIndexView } from "./issue-index-view.js";

describe("issue index view", () => {
  it("renders the issue drilldown table", () => {
    const html = renderToStaticMarkup(
      <IssueIndexView
        connection={{
          kind: "connected",
          label: "Live updates connected",
          detail: "Runtime snapshot and websocket updates are active."
        }}
        error={null}
        issueIndex={{
          issues: [
            {
              issueId: "issue_123",
              issueIdentifier: "COL-165",
              latestRunStartedAt: "2026-03-31T18:00:00.000Z",
              latestRunId: "run_123",
              latestRunStatus: "finished",
              latestRunOutcome: "completed",
              runCount: 3,
              latestProblemOutcome: "max_turns",
              lastCompletedOutcome: "completed",
              insertedAt: "2026-03-31T18:00:00.000Z",
              updatedAt: "2026-03-31T18:05:00.000Z"
            }
          ],
          problemRuns: [],
          problemSummary: {
            max_turns: 2
          }
        }}
        loading={false}
      />
    );

    expect(html).toContain("Issue index");
    expect(html).toContain("COL-165");
    expect(html).toContain("Issue detail");
    expect(html).toContain("max_turns");
  });
});
