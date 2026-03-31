import { describe, expect, it, vi } from "vitest";
import {
  fetchIssueDetail,
  fetchIssueIndex,
  fetchProblemRuns,
  fetchRunDetail,
  shouldRefreshIssueDetail,
  shouldRefreshIssueIndex,
  shouldRefreshProblemRuns,
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
              latestProblemOutcome: "max_turns",
              lastCompletedOutcome: "completed",
              insertedAt: "2026-03-31T18:00:00.000Z",
              updatedAt: "2026-03-31T18:05:00.000Z"
            }
          ],
          problemRuns: [],
          problemSummary: {
            max_turns: 1
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
    expect(issueIndex.problemSummary.max_turns).toBe(1);
  });

  it("parses the issue detail, run detail, and problem-runs envelopes", async () => {
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
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          schemaVersion: "1",
          ok: true,
          data: {
            problemRuns: [],
            problemSummary: {
              max_turns: 2
            },
            filters: {
              outcome: "max_turns",
              issueIdentifier: null,
              limit: 200
            }
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
    const problemRuns = await fetchProblemRuns(
      "http://127.0.0.1:4400",
      {
        limit: 200,
        outcome: "max_turns"
      },
      fetchImpl as typeof fetch
    );

    expect(issueDetail.summary.runCount).toBe(3);
    expect(runDetail.run.runId).toBe("run_123");
    expect(problemRuns.filters.outcome).toBe("max_turns");
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
    expect(
      shouldRefreshProblemRuns({
        type: "problem-runs.updated",
        channel: "problem-runs",
        generatedAt: "2026-03-31T18:00:00.000Z",
        invalidate: ["/api/v1/problem-runs"]
      })
    ).toBe(true);
  });
});
