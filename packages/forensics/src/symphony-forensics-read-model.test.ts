import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createSymphonyForensicsReadModel } from "./symphony-forensics-read-model.js";
import {
  createFileBackedSymphonyRunJournal,
  defaultSymphonyRunJournalFile
} from "@symphony/run-journal";
import type {
  SymphonyRunExport,
  SymphonyRunJournal,
  SymphonyRunSummary
} from "@symphony/run-journal";
import {
  buildSymphonyEventAttrs,
  buildSymphonyRunFinishAttrs,
  buildSymphonyRunStartAttrs,
  buildSymphonyTurnFinishAttrs,
  buildSymphonyTurnStartAttrs
} from "./build-symphony-run-journal-fixture.js";

const tempDirectories: string[] = [];

async function createJournal() {
  const root = await mkdtemp(path.join(tmpdir(), "symphony-forensics-"));
  tempDirectories.push(root);

  return createFileBackedSymphonyRunJournal({
    dbFile: defaultSymphonyRunJournalFile(root)
  });
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("symphony forensics read model", () => {
  it("builds issues, issue detail, run detail, and problem-run views from the journal boundary", async () => {
    const journal = await createJournal();
    const readModel = createSymphonyForensicsReadModel(journal);

    const runId = await journal.recordRunStarted(
      buildSymphonyRunStartAttrs({
        issueId: "issue-1",
        issueIdentifier: "COL-157"
      })
    );
    const turnId = await journal.recordTurnStarted(runId, buildSymphonyTurnStartAttrs());
    await journal.recordEvent(runId, turnId, buildSymphonyEventAttrs());
    await journal.finalizeTurn(turnId, buildSymphonyTurnFinishAttrs());
    await journal.finalizeRun(runId, buildSymphonyRunFinishAttrs());

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
    const runDetail = await readModel.runDetail(runId);
    const problemRuns = await readModel.problemRuns({
      limit: 200
    });

    expect(issues.issues[0]?.issueIdentifier).toBe("COL-157");
    expect(issues.totals.issueCount).toBe(1);
    expect(issueDetail?.summary.runCount).toBe(1);
    expect(issueBundle?.issue.issueIdentifier).toBe("COL-157");
    expect(runDetail?.run.runId).toBe(runId);
    expect(problemRuns.problemRuns[0]?.runId).toBe(runId);
    expect(problemRuns.problemSummary.paused_max_turns).toBe(1);
  });

  it("returns null for missing issue detail and run detail", async () => {
    const journal = await createJournal();
    const readModel = createSymphonyForensicsReadModel(journal);

    expect(await readModel.issueDetail("COL-MISSING")).toBeNull();
    expect(await readModel.issueForensicsBundle("COL-MISSING")).toBeNull();
    expect(await readModel.runDetail("run-missing")).toBeNull();
  });

  it("fails fast when a run exists without a matching issue summary", async () => {
    const readModel = createSymphonyForensicsReadModel({
      journal: createIncompleteJournal()
    });

    await expect(readModel.issues()).rejects.toThrow(
      "Missing issue summary for COL-157"
    );
    await expect(readModel.issueForensicsBundle("COL-157")).rejects.toThrow(
      "Missing issue summary for COL-157"
    );
  });
});

function createIncompleteJournal(): SymphonyRunJournal {
  const run: SymphonyRunSummary = {
    runId: "run-1",
    issueId: "issue-1",
    issueIdentifier: "COL-157",
    attempt: 1,
    status: "finished",
    outcome: "completed",
    workerHost: null,
    workspacePath: null,
    startedAt: "2026-03-31T00:00:00.000Z",
    endedAt: "2026-03-31T00:01:00.000Z",
    commitHashStart: null,
    commitHashEnd: null,
    turnCount: 1,
    eventCount: 1,
    lastEventType: "turn_completed",
    lastEventAt: "2026-03-31T00:01:00.000Z",
    durationSeconds: 60,
    errorClass: null,
    errorMessage: null,
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30
  };

  return {
    dbFile: "/tmp/incomplete-journal.json",
    retentionDays: 90,
    payloadMaxBytes: 64 * 1024,
    async recordRunStarted() {
      throw new Error("unused");
    },
    async recordTurnStarted() {
      throw new Error("unused");
    },
    async recordEvent() {
      throw new Error("unused");
    },
    async updateTurn() {
      throw new Error("unused");
    },
    async finalizeTurn() {
      throw new Error("unused");
    },
    async updateRun() {
      throw new Error("unused");
    },
    async finalizeRun() {
      throw new Error("unused");
    },
    async listIssues() {
      return [];
    },
    async listRuns() {
      return [run];
    },
    async listRunsForIssue(issueIdentifier) {
      return issueIdentifier === run.issueIdentifier ? [run] : [];
    },
    async listProblemRuns() {
      return [];
    },
    async fetchRunExport(): Promise<SymphonyRunExport | null> {
      return null;
    },
    async pruneRetention() {}
  };
}
