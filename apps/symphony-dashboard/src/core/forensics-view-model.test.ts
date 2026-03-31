import { describe, expect, it } from "vitest";
import {
  buildIssueDetailViewModel,
  buildIssueIndexViewModel,
  buildProblemRunsViewModel,
  buildRunDetailViewModel
} from "./forensics-view-model.js";

describe("forensics view model", () => {
  it("formats the issue index and problem-runs summaries", () => {
    const issueIndex = buildIssueIndexViewModel({
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
    });
    const problemRuns = buildProblemRunsViewModel({
      problemRuns: [
        {
          runId: "run_123",
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
        issueIdentifier: null,
        limit: 200
      }
    });

    expect(issueIndex.summaryCards[0]).toEqual({
      outcome: "max_turns",
      count: "2"
    });
    expect(issueIndex.rows[0]?.issueHref).toBe("/issues/COL-165");
    expect(problemRuns.filters.outcome).toBe("max_turns");
    expect(problemRuns.rows[0]?.runHref).toBe("/runs/run_123");
  });

  it("formats the issue and run drilldown surfaces", () => {
    const issueDetail = buildIssueDetailViewModel({
      issueIdentifier: "COL-165",
      runs: [
        {
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
    });
    const runDetail = buildRunDetailViewModel({
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
        repoStart: {
          branch: "main"
        },
        repoEnd: {
          branch: "main"
        },
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
    });

    expect(issueDetail.metrics[0]?.value).toBe("3");
    expect(issueDetail.rows[0]?.runHref).toBe("/runs/run_123");
    expect(runDetail.metrics[0]?.value).toBe("COL-165");
    expect(runDetail.turns[0]?.events[0]?.payloadText).toContain('"text": "done"');
  });
});
