import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createSymphonyForensicsReadModel } from "./symphony-forensics-read-model.js";
import {
  createFileBackedSymphonyRunJournal,
  defaultSymphonyRunJournalFile
} from "../journal/file-backed-symphony-run-journal.js";
import {
  buildSymphonyEventAttrs,
  buildSymphonyRunFinishAttrs,
  buildSymphonyRunStartAttrs,
  buildSymphonyTurnFinishAttrs,
  buildSymphonyTurnStartAttrs
} from "../test-support/build-symphony-run-journal-fixture.js";

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
});
