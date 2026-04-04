import { describe, expect, it } from "vitest";
import type {
  SymphonyForensicsRunDetailResult,
  SymphonyForensicsRunSummary
} from "@symphony/contracts";
import {
  createSymphonyForensicsReadModel,
  type SymphonyForensicsIssueDetailQuery,
  type SymphonyForensicsProblemRunsQuery,
  type SymphonyForensicsRunStore,
  type SymphonyForensicsRunsQuery
} from "./symphony-forensics-read-model.js";

describe("symphony forensics read model", () => {
  it("builds issues, issue detail, run detail, and problem-run views from the read-store boundary", async () => {
    const run = createRunSummary();
    const runDetail = createRunDetail(run);
    const readModel = createSymphonyForensicsReadModel(
      createRunStore({
        runs: [run],
        runDetails: [runDetail]
      })
    );

    const issues = await readModel.issues({
      limit: 200
    });
    const issueDetail = await readModel.issueDetail("COL-157", {
      limit: 200
    });
    const issueBundle = await readModel.issueForensicsBundle("COL-157", {
      recentRunLimit: 5,
      timelineLimit: 20,
      runtimeLogLimit: 20
    });
    const resolvedRunDetail = await readModel.runDetail(run.runId);
    const problemRuns = await readModel.problemRuns({
      limit: 200
    });

    expect(issues.issues[0]?.issueIdentifier).toBe("COL-157");
    expect(issues.totals.issueCount).toBe(1);
    expect(issueDetail?.summary.runCount).toBe(1);
    expect(issueBundle?.issue.issueIdentifier).toBe("COL-157");
    expect(resolvedRunDetail?.run.runId).toBe(run.runId);
    expect(problemRuns.problemRuns[0]?.runId).toBe(run.runId);
    expect(problemRuns.problemSummary.paused_max_turns).toBe(1);
  });

  it("returns null for missing issue detail and run detail", async () => {
    const readModel = createSymphonyForensicsReadModel(createRunStore());

    expect(await readModel.issueDetail("COL-MISSING")).toBeNull();
    expect(await readModel.issueForensicsBundle("COL-MISSING")).toBeNull();
    expect(await readModel.runDetail("run-missing")).toBeNull();
  });

  it("uses any compatible read store boundary, not just a legacy journal", async () => {
    const run = createRunSummary({
      runId: "run-codex"
    });
    const expected = createRunDetail(run);
    const readModel = createSymphonyForensicsReadModel({
      journal: createRunStore({
        runs: [run],
        runDetails: [expected]
      })
    });

    expect(await readModel.runDetail(run.runId)).toEqual(expected);
  });

  it("derives issue aggregates directly from runs without requiring issue summary records", async () => {
    const readModel = createSymphonyForensicsReadModel(
      createRunStore({
        runs: [
          createRunSummary({
            runId: "run-1",
            outcome: "completed",
            errorClass: null,
            errorMessage: null
          }),
          createRunSummary({
            runId: "run-2",
            attempt: 2,
            status: "failed",
            outcome: "rate_limit",
            startedAt: "2026-03-31T00:02:00.000Z",
            endedAt: "2026-03-31T00:03:00.000Z",
            lastEventAt: "2026-03-31T00:03:00.000Z",
            errorClass: "rate_limit",
            errorMessage: "Rate limited."
          })
        ]
      })
    );

    const issues = await readModel.issues();
    const bundle = await readModel.issueForensicsBundle("COL-157");

    expect(issues.issues[0]?.issueIdentifier).toBe("COL-157");
    expect(issues.issues[0]?.runCount).toBe(2);
    expect(issues.issues[0]?.flags).toContain("rate_limited");
    expect(bundle?.issue.runCount).toBe(2);
    expect(bundle?.recentRuns).toHaveLength(2);
  });
});

function createRunStore(input: {
  runs?: SymphonyForensicsRunSummary[];
  runDetails?: SymphonyForensicsRunDetailResult[];
} = {}): SymphonyForensicsRunStore {
  const runs = [...(input.runs ?? [])].sort((left, right) =>
    right.startedAt.localeCompare(left.startedAt)
  );
  const runDetailMap = new Map(
    (input.runDetails ?? []).map((detail) => [detail.run.runId, detail] as const)
  );

  return {
    async listRuns(opts: SymphonyForensicsRunsQuery = {}) {
      return runs
        .filter((run) => {
          if (opts.issueIdentifier && run.issueIdentifier !== opts.issueIdentifier) {
            return false;
          }

          if (opts.outcome && run.outcome !== opts.outcome) {
            return false;
          }

          if (opts.errorClass && run.errorClass !== opts.errorClass) {
            return false;
          }

          if (opts.problemOnly && run.outcome === "completed") {
            return false;
          }

          if (opts.startedAfter && run.startedAt < opts.startedAfter) {
            return false;
          }

          if (opts.startedBefore && run.startedAt > opts.startedBefore) {
            return false;
          }

          return true;
        })
        .slice(0, opts.limit ?? runs.length);
    },

    async listRunsForIssue(issueIdentifier: string, opts: SymphonyForensicsIssueDetailQuery = {}) {
      return runs
        .filter((run) => run.issueIdentifier === issueIdentifier)
        .slice(0, opts.limit ?? runs.length);
    },

    async listProblemRuns(opts: SymphonyForensicsProblemRunsQuery = {}) {
      return runs
        .filter((run) => run.outcome !== "completed")
        .filter((run) => (opts.issueIdentifier ? run.issueIdentifier === opts.issueIdentifier : true))
        .filter((run) => (opts.outcome ? run.outcome === opts.outcome : true))
        .slice(0, opts.limit ?? runs.length);
    },

    async fetchRunDetail(runId: string) {
      return runDetailMap.get(runId) ?? null;
    }
  };
}

function createRunSummary(
  overrides: Partial<SymphonyForensicsRunSummary> = {}
): SymphonyForensicsRunSummary {
  return {
    runId: "run-1",
    issueId: "issue-1",
    issueIdentifier: "COL-157",
    attempt: 1,
    status: "finished",
    outcome: "paused_max_turns",
    workerHost: "docker-host",
    workspacePath: "/tmp/COL-157",
    startedAt: "2026-03-31T00:00:00.000Z",
    endedAt: "2026-03-31T00:01:00.000Z",
    commitHashStart: "commit-start",
    commitHashEnd: "commit-end",
    turnCount: 1,
    eventCount: 1,
    lastEventType: "turn.completed",
    lastEventAt: "2026-03-31T00:01:00.000Z",
    durationSeconds: 60,
    errorClass: "max_turns_reached",
    errorMessage: "Reached the configured max turns.",
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    ...overrides
  };
}

function createRunDetail(
  run: SymphonyForensicsRunSummary
): SymphonyForensicsRunDetailResult {
  return {
    issue: {
      issueId: run.issueId,
      issueIdentifier: run.issueIdentifier,
      latestRunStartedAt: run.startedAt,
      latestRunId: run.runId,
      latestRunStatus: run.status,
      latestRunOutcome: run.outcome,
      runCount: 1,
      latestProblemOutcome: run.outcome,
      lastCompletedOutcome: null,
      insertedAt: null,
      updatedAt: null
    },
    run: {
      ...run,
      repoStart: {
        dirty: true
      },
      repoEnd: {
        dirty: true
      },
      metadata: {
        source: "test"
      },
      insertedAt: "2026-03-31T00:00:00.000Z",
      updatedAt: "2026-03-31T00:01:00.000Z"
    },
    turns: [
      {
        turnId: "turn-1",
        runId: run.runId,
        turnSequence: 1,
        codexThreadId: "thread-1",
        codexTurnId: "turn-1",
        codexSessionId: "session-1",
        promptText: "Implement the requested change.",
        status: "completed",
        startedAt: "2026-03-31T00:00:00.000Z",
        endedAt: "2026-03-31T00:00:10.000Z",
        usage: {
          input_tokens: 11,
          cached_input_tokens: 0,
          output_tokens: 7
        },
        metadata: {
          source: "test"
        },
        insertedAt: "2026-03-31T00:00:00.000Z",
        updatedAt: "2026-03-31T00:00:10.000Z",
        eventCount: 1,
        events: [
          {
            eventId: "event-1",
            turnId: "turn-1",
            runId: run.runId,
            eventSequence: 1,
            eventType: "turn.completed",
            itemType: null,
            itemStatus: null,
            recordedAt: "2026-03-31T00:00:10.000Z",
            payload: {
              type: "turn.completed",
              usage: {
                input_tokens: 11,
                cached_input_tokens: 0,
                output_tokens: 7
              }
            },
            payloadTruncated: false,
            payloadBytes: 80,
            summary: "input=11 output=7",
            codexThreadId: "thread-1",
            codexTurnId: "turn-1",
            codexSessionId: "session-1",
            insertedAt: "2026-03-31T00:00:10.000Z"
          }
        ]
      }
    ]
  };
}
