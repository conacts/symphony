import { describe, expect, it } from "vitest";
import {
  buildIssueDetailViewModel,
  buildIssueIndexViewModel,
  buildRunDetailViewModel
} from "./forensics-view-model.js";

describe("forensics view model", () => {
  it("formats the issue index summary", () => {
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
          completedRunCount: 1,
          problemRunCount: 2,
          problemRate: 2 / 3,
          latestProblemOutcome: "max_turns",
          lastCompletedOutcome: "completed",
          retryCount: 2,
          latestRetryAttempt: 3,
          rateLimitedCount: 1,
          maxTurnsCount: 1,
          startupFailureCount: 0,
          totalInputTokens: 6000,
          totalOutputTokens: 2500,
          totalTokens: 8500,
          avgDurationSeconds: 420,
          avgTurns: 5,
          avgEvents: 10,
          latestErrorClass: "max_turns",
          latestErrorMessage: "Reached max turns.",
          latestActivityAt: "2026-03-31T18:05:00.000Z",
          flags: ["max_turns", "many_retries"],
          insertedAt: "2026-03-31T18:00:00.000Z",
          updatedAt: "2026-03-31T18:05:00.000Z"
        }
      ],
      totals: {
        issueCount: 1,
        runCount: 3,
        completedRunCount: 1,
        problemRunCount: 2,
        rateLimitedCount: 1,
        maxTurnsCount: 1,
        startupFailureCount: 0,
        inputTokens: 6000,
        outputTokens: 2500,
        totalTokens: 8500
      },
      filters: {
        limit: null,
        timeRange: "all",
        startedAfter: null,
        startedBefore: null,
        outcome: null,
        errorClass: null,
        hasFlags: [],
        sortBy: "lastActive",
        sortDirection: "desc"
      },
      facets: {
        outcomes: ["completed", "max_turns"],
        errorClasses: ["max_turns"]
      }
    });

    expect(issueIndex.summaryCards[0]?.label).toBe("Total issues");
    expect(issueIndex.summaryCards[3]?.value).toBe("33.3%");
    expect(issueIndex.rows[0]?.issueHref).toBe("/issues/COL-165");
    expect(issueIndex.rows[0]?.problemRate).toBe("66.7%");
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
          durationSeconds: 120,
          errorClass: null,
          errorMessage: null,
          inputTokens: 120,
          outputTokens: 80,
          totalTokens: 200
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
        inputTokens: 120,
        outputTokens: 80,
        totalTokens: 200,
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
