import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RunDetailView } from "./run-detail-view.js";

describe("run detail view", () => {
  it("renders the run metrics and turn drilldown", () => {
    const html = renderToStaticMarkup(
      <RunDetailView
        connection={{
          kind: "connected",
          label: "Live updates connected",
          detail: "Runtime snapshot and websocket updates are active."
        }}
        error={null}
        loading={false}
        runDetail={{
          issue: {
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
          },
          run: {
            runId: "run_123",
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
            durationSeconds: 120,
            repoStart: {},
            repoEnd: {},
            metadata: {},
            errorClass: null,
            errorMessage: null,
            insertedAt: "2026-03-31T18:00:00.000Z",
            updatedAt: "2026-03-31T18:02:00.000Z"
          },
          turns: [
            {
              turnId: "turn_123",
              runId: "run_123",
              turnSequence: 1,
              codexThreadId: null,
              codexTurnId: null,
              codexSessionId: "session_123",
              promptText: "Solve the task",
              status: "completed",
              startedAt: "2026-03-31T18:00:00.000Z",
              endedAt: "2026-03-31T18:01:00.000Z",
              tokens: {},
              metadata: {},
              insertedAt: "2026-03-31T18:00:00.000Z",
              updatedAt: "2026-03-31T18:01:00.000Z",
              eventCount: 1,
              events: [
                {
                  eventId: "event_123",
                  turnId: "turn_123",
                  runId: "run_123",
                  eventSequence: 1,
                  eventType: "message.output",
                  recordedAt: "2026-03-31T18:01:00.000Z",
                  payload: {
                    text: "done"
                  },
                  payloadTruncated: false,
                  payloadBytes: 12,
                  summary: "Produced output",
                  codexThreadId: null,
                  codexTurnId: null,
                  codexSessionId: "session_123",
                  insertedAt: "2026-03-31T18:01:00.000Z"
                }
              ]
            }
          ]
        }}
      />
    );

    expect(html).toContain("Repo start");
    expect(html).toContain("Turns");
    expect(html).toContain("Solve the task");
    expect(html).toContain("Show payload");
  });
});
