import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IssueDetailView } from "./issue-detail-view.js";

describe("issue detail view", () => {
  it("renders the issue run history drilldown", () => {
    const html = renderToStaticMarkup(
      <IssueDetailView
        connection={{
          kind: "connected",
          label: "Live updates connected",
          detail: "Runtime snapshot and websocket updates are active."
        }}
        error={null}
        issueDetail={{
          issueIdentifier: "COL-165",
          runs: [
            {
              runId: "run_12345678",
              issueId: "issue_123",
              issueIdentifier: "COL-165",
              attempt: 1,
              status: "finished",
              outcome: "completed",
              workerHost: "worker-a",
              workspacePath: "/tmp/workspaces/col-165",
              startedAt: "2026-03-31T18:00:00.000Z",
              endedAt: "2026-03-31T18:02:00.000Z",
              commitHashStart: "abc",
              commitHashEnd: "def",
              turnCount: 2,
              eventCount: 4,
              lastEventType: "message.output",
              lastEventAt: "2026-03-31T18:02:00.000Z",
              durationSeconds: 120
            }
          ],
          summary: {
            runCount: 3,
            latestProblemOutcome: "max_turns",
            lastCompletedOutcome: "completed"
          },
          filters: {
            limit: 200
          }
        }}
        loading={false}
      />
    );

    expect(html).toContain("Run history");
    expect(html).toContain("run_1234");
    expect(html).toContain("completed");
  });
});
