import { describe, expect, it } from "vitest";
import {
  buildIssueDetailViewModel,
  buildIssueIndexViewModel
} from "@/features/issues/model/issue-view-model";

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
    expect(issueIndex.focusCards[0]?.label).toBe("Most active issue");
    expect(issueIndex.focusCards[0]?.href).toBe("/issues/COL-165");
    expect(issueIndex.outcomeChartRows[0]).toEqual({
      issueIdentifier: "COL-165",
      completedRunCount: 1,
      problemRunCount: 2
    });
    expect(issueIndex.pressureChartRows[0]).toEqual({
      issueIdentifier: "COL-165",
      retryCount: 2,
      rateLimitedCount: 1,
      maxTurnsCount: 1
    });
    expect(issueIndex.rows[0]?.issueHref).toBe("/issues/COL-165");
    expect(issueIndex.rows[0]?.problemRate).toBe("66.7%");
    expect(issueIndex.rows[0]?.avgDuration).toBe("7:00");
    expect(issueIndex.rows[0]?.flags).toEqual(["max_turns", "many_retries"]);
    expect(issueIndex.rows[0]?.lastActive).not.toBe("2026-03-31T18:05:00.000Z");
  });

  it("formats the issue drilldown rows", () => {
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
          codexStatus: "completed",
          codexFailureKind: null,
          codexFailureOrigin: null,
          codexFailureMessagePreview: null,
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

    expect(issueDetail.metrics[0]?.value).toBe("3");
    expect(issueDetail.outcomeChartRows[0]).toEqual({
      outcome: "completed",
      count: 1
    });
    expect(issueDetail.tokenChartRows[0]).toEqual({
      runLabel: "#1",
      inputTokens: 120,
      outputTokens: 80
    });
    expect(issueDetail.failureCards[0]?.value).toBe("0");
    expect(issueDetail.recentFailureRows).toEqual([]);
    expect(issueDetail.rows[0]?.runHref).toBe("/runs/run_123");
    expect(issueDetail.rows[0]?.durationSeconds).toBe("2:00");
    expect(issueDetail.rows[0]?.totalTokens).toBe("200");
  });

  it("falls back to unique run labels when attempts are missing", () => {
    const issueDetail = buildIssueDetailViewModel({
      issueIdentifier: "COL-165",
      runs: [
        {
          runId: "564d183f-24ed-4c4f-be2e-06b15d2782b0",
          issueId: "issue_123",
          issueIdentifier: "COL-165",
          attempt: 0,
          status: "stopped",
          outcome: "run_stopped_terminal",
          codexStatus: "failed",
          codexFailureKind: "run_stopped_terminal",
          codexFailureOrigin: "runtime",
          codexFailureMessagePreview: "Stopped by runtime.",
          workerHost: "worker-a",
          workspacePath: "/tmp/workspaces/col-165",
          startedAt: "2026-04-04T06:07:00.000Z",
          endedAt: "2026-04-04T06:19:00.000Z",
          commitHashStart: "abc",
          commitHashEnd: "def",
          turnCount: 5,
          eventCount: 147,
          lastEventType: "message.output",
          lastEventAt: "2026-04-04T06:19:00.000Z",
          durationSeconds: 720,
          errorClass: null,
          errorMessage: null,
          inputTokens: 10517907,
          outputTokens: 17501,
          totalTokens: 10535408
        },
        {
          runId: "b2122cb9-5748-4d41-92b3-29eb082ce99b",
          issueId: "issue_123",
          issueIdentifier: "COL-165",
          attempt: 0,
          status: "stopped",
          outcome: "run_stopped_inactive",
          codexStatus: "failed",
          codexFailureKind: "run_stopped_inactive",
          codexFailureOrigin: "runtime",
          codexFailureMessagePreview: "Stopped for inactivity.",
          workerHost: "worker-a",
          workspacePath: "/tmp/workspaces/col-165",
          startedAt: "2026-04-04T05:53:00.000Z",
          endedAt: "2026-04-04T06:07:27.000Z",
          commitHashStart: "ghi",
          commitHashEnd: "jkl",
          turnCount: 1,
          eventCount: 50,
          lastEventType: "agent.stopped",
          lastEventAt: "2026-04-04T06:07:27.000Z",
          durationSeconds: 867,
          errorClass: null,
          errorMessage: null,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0
        }
      ],
      summary: {
        runCount: 2,
        latestProblemOutcome: "run_stopped_terminal",
        lastCompletedOutcome: null
      },
      filters: {
        limit: 200
      }
    });

    expect(issueDetail.tokenChartRows).toEqual([
      {
        runLabel: "Run 2 · b2122c",
        inputTokens: 0,
        outputTokens: 0
      },
      {
        runLabel: "Run 1 · 564d18",
        inputTokens: 10517907,
        outputTokens: 17501
      }
    ]);
    expect(issueDetail.failureCards[0]?.value).toBe("2");
    expect(issueDetail.failureCards[1]?.value).toBe("run_stopped_inactive");
    expect(issueDetail.recentFailureRows[0]?.runHref).toBe(
      "/runs/564d183f-24ed-4c4f-be2e-06b15d2782b0"
    );
  });
});
