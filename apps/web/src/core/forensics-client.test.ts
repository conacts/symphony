import { describe, expect, it, vi } from "vitest";
import {
  fetchIssueDetail,
  fetchIssueForensicsBundle,
  fetchIssueIndex,
  fetchRunDetail,
  shouldRefreshIssueDetail,
  shouldRefreshIssueIndex,
  shouldRefreshRunDetail
} from "./forensics-client.js";

describe("forensics client", () => {
  it("parses the issue index envelope", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: "1",
        ok: true,
        data: {
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
            limit: 200,
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
        },
        meta: {
          durationMs: 1,
          generatedAt: "2026-03-31T18:05:00.000Z"
        }
      })
    });

    const issueIndex = await fetchIssueIndex(
      "http://127.0.0.1:4400",
      {},
      fetchImpl as typeof fetch
    );

    expect(issueIndex.issues[0]?.issueIdentifier).toBe("COL-165");
    expect(issueIndex.totals.problemRunCount).toBe(2);
  });

  it("parses the issue detail and run detail envelopes", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          schemaVersion: "1",
          ok: true,
          data: {
            issueIdentifier: "COL-165",
            runs: [],
            summary: {
              runCount: 3,
              latestProblemOutcome: "max_turns",
              lastCompletedOutcome: "completed"
            },
            filters: {
              limit: 200
            }
          },
          meta: {
            durationMs: 1,
            generatedAt: "2026-03-31T18:05:00.000Z"
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          schemaVersion: "1",
          ok: true,
          data: {
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
              repoStart: {},
              repoEnd: {},
              metadata: {},
              errorClass: null,
              errorMessage: null,
              insertedAt: "2026-03-31T18:00:00.000Z",
              updatedAt: "2026-03-31T18:02:00.000Z"
            },
            turns: []
          },
          meta: {
            durationMs: 1,
            generatedAt: "2026-03-31T18:05:00.000Z"
          }
        })
      });

    const issueDetail = await fetchIssueDetail(
      "http://127.0.0.1:4400",
      "COL-165",
      {},
      fetchImpl as typeof fetch
    );
    const runDetail = await fetchRunDetail(
      "http://127.0.0.1:4400",
      "run_123",
      fetchImpl as typeof fetch
    );

    expect(issueDetail.summary.runCount).toBe(3);
    expect(runDetail.run.runId).toBe("run_123");
  });

  it("parses the issue forensic bundle envelope", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: "1",
        ok: true,
        data: {
          issue: {
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
          },
          recentRuns: [],
          distributions: {
            outcomes: {},
            errorClasses: {},
            timelineEvents: {}
          },
          latestFailure: null,
          timeline: [],
          runtimeLogs: [],
          filters: {
            limit: 200,
            timeRange: "all",
            startedAfter: null,
            startedBefore: null,
            outcome: null,
            errorClass: null,
            hasFlags: [],
            sortBy: "lastActive",
            sortDirection: "desc"
          }
        },
        meta: {
          durationMs: 1,
          generatedAt: "2026-03-31T18:05:00.000Z"
        }
      })
    });

    const bundle = await fetchIssueForensicsBundle(
      "http://127.0.0.1:4400",
      "COL-165",
      {},
      fetchImpl as typeof fetch
    );

    expect(bundle.issue.issueIdentifier).toBe("COL-165");
    expect(bundle.filters.timeRange).toBe("all");
  });

  it("matches websocket invalidation to drilldown surfaces", () => {
    expect(
      shouldRefreshIssueIndex({
        type: "issue.updated",
        channel: "issues",
        issueIdentifier: "COL-165",
        generatedAt: "2026-03-31T18:00:00.000Z",
        invalidate: ["/api/v1/issues"]
      })
    ).toBe(true);
    expect(
      shouldRefreshIssueDetail(
        {
          type: "run.updated",
          channel: "runs",
          runId: "run_123",
          issueIdentifier: "COL-165",
          generatedAt: "2026-03-31T18:00:00.000Z",
          invalidate: ["/api/v1/runs/run_123", "/api/v1/issues/COL-165"]
        },
        "COL-165"
      )
    ).toBe(true);
    expect(
      shouldRefreshRunDetail(
        {
          type: "run.updated",
          channel: "runs",
          runId: "run_123",
          issueIdentifier: "COL-165",
          generatedAt: "2026-03-31T18:00:00.000Z",
          invalidate: ["/api/v1/runs/run_123"]
        },
        "run_123"
      )
    ).toBe(true);
  });
});
