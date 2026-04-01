import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSymphonyDb } from "./client.js";
import { createSymphonyIssueTimelineStore } from "./issue-timeline.js";
import { createSqliteSymphonyRunJournal } from "./sqlite-symphony-run-journal.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true
      })
    )
  );
});

describe("sqlite symphony run journal", () => {
  it("merges run metadata updates instead of overwriting earlier fields", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-sqlite-journal-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const journal = createSqliteSymphonyRunJournal({
      db: database.db,
      dbFile: path.join(root, "symphony.db"),
      timelineStore: createSymphonyIssueTimelineStore(database.db)
    });

    try {
      const runId = await journal.recordRunStarted(
        {
          issueId: "issue-metadata",
          issueIdentifier: "COL-META",
          runId: "run-meta",
          attempt: 1,
          status: "running",
          workerHost: null,
          workspacePath: null,
          startedAt: "2026-03-31T00:00:00.000Z",
          commitHashStart: null,
          repoStart: null,
          metadata: {
            runtime: "typescript"
          }
        }
      );

      await journal.updateRun(runId, {
        metadata: {
          sessionId: "session-123"
        }
      });

      const exportPayload = await journal.fetchRunExport(runId);

      expect(exportPayload?.run.metadata).toEqual({
        runtime: "typescript",
        sessionId: "session-123"
      });
    } finally {
      database.close();
    }
  });
});
