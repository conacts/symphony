import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProblemRunsView } from "./problem-runs-view.js";

describe("problem-runs view", () => {
  it("renders the filter form and problem-runs table", () => {
    const html = renderToStaticMarkup(
      <ProblemRunsView
        connection={{
          kind: "connected",
          label: "Live updates connected",
          detail: "Runtime snapshot and websocket updates are active."
        }}
        error={null}
        loading={false}
        problemRuns={{
          problemRuns: [
            {
              runId: "run_12345678",
              issueId: "issue_123",
              issueIdentifier: "COL-165",
              attempt: 1,
              status: "finished",
              outcome: "max_turns",
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
          problemSummary: {
            max_turns: 2
          },
          filters: {
            outcome: "max_turns",
            issueIdentifier: "",
            limit: 200
          }
        }}
      />
    );

    expect(html).toContain("Apply");
    expect(html).toContain("Problem runs");
    expect(html).toContain("COL-165");
    expect(html).toContain("max_turns");
  });
});
