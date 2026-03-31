import { describe, expect, it } from "vitest";
import {
  symphonyForensicsIssueListResponseSchema,
  symphonyForensicsIssueDetailResponseSchema,
  symphonyForensicsRunDetailResponseSchema,
  symphonyForensicsProblemRunsQuerySchema,
  symphonyForensicsProblemRunsResponseSchema
} from "./index.js";

describe("symphony forensics contracts", () => {
  it("parses the issue list envelope", () => {
    const parsed = symphonyForensicsIssueListResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      meta: {
        durationMs: 1,
        generatedAt: "2026-03-31T00:00:00.000Z",
        count: 1
      },
      data: {
        issues: [
          {
            issueId: "issue-1",
            issueIdentifier: "COL-157",
            latestRunStartedAt: "2026-03-31T00:00:00.000Z",
            latestRunId: "run-1",
            latestRunStatus: "completed",
            latestRunOutcome: "done",
            runCount: 2,
            latestProblemOutcome: null,
            lastCompletedOutcome: "done",
            insertedAt: "2026-03-31T00:00:00.000Z",
            updatedAt: "2026-03-31T00:00:00.000Z"
          }
        ],
        problemRuns: [],
        problemSummary: {}
      }
    });

    expect(parsed.ok).toBe(true);
  });

  it("parses the issue detail envelope", () => {
    const parsed = symphonyForensicsIssueDetailResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      meta: {
        durationMs: 1,
        generatedAt: "2026-03-31T00:00:00.000Z"
      },
      data: {
        issueIdentifier: "COL-157",
        runs: [],
        summary: {
          runCount: 0,
          latestProblemOutcome: null,
          lastCompletedOutcome: null
        },
        filters: {
          limit: 200
        }
      }
    });

    expect(parsed.ok).toBe(true);
  });

  it("parses the run detail envelope", () => {
    const parsed = symphonyForensicsRunDetailResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      meta: {
        durationMs: 1,
        generatedAt: "2026-03-31T00:00:00.000Z"
      },
      data: {
        issue: {
          issueId: "issue-1",
          issueIdentifier: "COL-157",
          latestRunStartedAt: "2026-03-31T00:00:00.000Z",
          latestRunId: "run-1",
          latestRunStatus: "completed",
          latestRunOutcome: "done",
          runCount: 1,
          latestProblemOutcome: null,
          lastCompletedOutcome: "done",
          insertedAt: "2026-03-31T00:00:00.000Z",
          updatedAt: "2026-03-31T00:00:00.000Z"
        },
        run: {
          runId: "run-1",
          issueId: "issue-1",
          issueIdentifier: "COL-157",
          attempt: 1,
          status: "completed",
          outcome: "done",
          workerHost: "local",
          workspacePath: "/tmp/COL-157",
          startedAt: "2026-03-31T00:00:00.000Z",
          endedAt: "2026-03-31T00:01:00.000Z",
          commitHashStart: null,
          commitHashEnd: null,
          turnCount: 1,
          eventCount: 1,
          lastEventType: "turn_completed",
          lastEventAt: "2026-03-31T00:01:00.000Z",
          durationSeconds: 60,
          repoStart: {},
          repoEnd: {},
          metadata: {},
          errorClass: null,
          errorMessage: null,
          insertedAt: "2026-03-31T00:00:00.000Z",
          updatedAt: "2026-03-31T00:01:00.000Z"
        },
        turns: [
          {
            turnId: "turn-1",
            runId: "run-1",
            turnSequence: 1,
            codexThreadId: null,
            codexTurnId: null,
            codexSessionId: null,
            promptText: "Implement the fix",
            status: "completed",
            startedAt: "2026-03-31T00:00:00.000Z",
            endedAt: "2026-03-31T00:01:00.000Z",
            tokens: {},
            metadata: {},
            insertedAt: "2026-03-31T00:00:00.000Z",
            updatedAt: "2026-03-31T00:01:00.000Z",
            eventCount: 1,
            events: [
              {
                eventId: "event-1",
                turnId: "turn-1",
                runId: "run-1",
                eventSequence: 1,
                eventType: "turn_completed",
                recordedAt: "2026-03-31T00:01:00.000Z",
                payload: {},
                payloadTruncated: false,
                payloadBytes: 10,
                summary: "turn completed",
                codexThreadId: null,
                codexTurnId: null,
                codexSessionId: null,
                insertedAt: "2026-03-31T00:01:00.000Z"
              }
            ]
          }
        ]
      }
    });

    expect(parsed.ok).toBe(true);
  });

  it("parses problem-run filters and envelopes", () => {
    const query = symphonyForensicsProblemRunsQuerySchema.parse({
      limit: "25",
      outcome: "failed",
      issueIdentifier: "COL-157"
    });

    const response = symphonyForensicsProblemRunsResponseSchema.parse({
      schemaVersion: "1",
      ok: true,
      meta: {
        durationMs: 1,
        generatedAt: "2026-03-31T00:00:00.000Z"
      },
      data: {
        problemRuns: [],
        problemSummary: {},
        filters: {
          outcome: "failed",
          issueIdentifier: "COL-157",
          limit: 25
        }
      }
    });

    expect(query.limit).toBe(25);
    expect(response.ok).toBe(true);
  });
});
