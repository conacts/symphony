import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSymphonyDb } from "./client.js";
import { createSymphonyIssueStore } from "./issues.js";
import { createSymphonyIssueTimelineStore } from "./issue-timeline.js";
import { createSqliteSymphonyRuntimeRunLedger } from "./sqlite-runtime-run-ledger.js";

const tempDirectories: string[] = [];
const testRepositoryKey = "openai/symphony";

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

async function seedIssueBinding(
  db: ReturnType<typeof initializeSymphonyDb>["db"],
  input: {
    issueIdentifier: string;
    trackerIssueId: string;
    repositoryKey: string;
    recordedAt: string;
  }
): Promise<void> {
  const issueStore = createSymphonyIssueStore(db);
  await issueStore.upsert({
    trackerIssueKey: input.issueIdentifier,
    trackerIssueId: input.trackerIssueId,
    repositoryKey: input.repositoryKey,
    latestRunStartedAt: null,
    recordedAt: input.recordedAt
  });
}

describe("sqlite symphony runtime run ledger", () => {
  it("merges run metadata updates instead of overwriting earlier fields", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-sqlite-journal-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const journal = createSqliteSymphonyRuntimeRunLedger({
      db: database.db,
      dbFile: path.join(root, "symphony.db"),
      timelineStore: createSymphonyIssueTimelineStore(database.db, {
        repositoryKey: testRepositoryKey
      })
    });

    try {
      await seedIssueBinding(database.db, {
        issueIdentifier: "COL-META",
        trackerIssueId: "issue-metadata",
        repositoryKey: testRepositoryKey,
        recordedAt: "2026-03-31T00:00:00.000Z"
      });

      const runId = await journal.recordRunStarted(
        {
          trackerIssueId: "issue-metadata",
          issueIdentifier: "COL-META",
          repositoryKey: testRepositoryKey,
          runMode: "implementation",
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
          threadId: "thread-123"
        }
      });

      const exportPayload = await journal.fetchRunExport(runId);

      expect(exportPayload?.run.metadata).toEqual({
        runtime: "typescript",
        threadId: "thread-123"
      });
    } finally {
      database.close();
    }
  });

  it("includes cached input tokens in runtime ledger run summaries", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-sqlite-runtime-ledger-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const ledger = createSqliteSymphonyRuntimeRunLedger({
      db: database.db,
      dbFile: path.join(root, "symphony.db"),
      timelineStore: createSymphonyIssueTimelineStore(database.db, {
        repositoryKey: testRepositoryKey
      })
    });

    try {
      await seedIssueBinding(database.db, {
        issueIdentifier: "COL-TOKENS",
        trackerIssueId: "issue-tokens",
        repositoryKey: testRepositoryKey,
        recordedAt: "2026-03-31T00:00:00.000Z"
      });

      const runId = await ledger.recordRunStarted({
        trackerIssueId: "issue-tokens",
        issueIdentifier: "COL-TOKENS",
        repositoryKey: testRepositoryKey,
        runMode: "implementation",
        runId: "run-tokens",
        status: "running",
        startedAt: "2026-03-31T00:00:00.000Z"
      });
      const turnId = await ledger.recordTurnStarted(runId, {
        turnId: "turn-tokens",
        turnSequence: 1,
        threadId: "thread-tokens",
        promptText: "Measure token totals",
        status: "running",
        startedAt: "2026-03-31T00:00:01.000Z"
      });

      await ledger.finalizeTurn(turnId, {
        status: "completed",
        endedAt: "2026-03-31T00:00:05.000Z",
        usage: {
          input_tokens: 12,
          cached_input_tokens: 5,
          output_tokens: 8
        }
      });
      await ledger.finalizeRun(runId, {
        status: "finished",
        outcome: "completed",
        endedAt: "2026-03-31T00:00:06.000Z"
      });

      const runs = await ledger.listRuns({
        issueIdentifier: "COL-TOKENS"
      });

      expect(runs[0]).toMatchObject({
        inputTokens: 12,
        outputTokens: 8,
        totalTokens: 25
      });
    } finally {
      database.close();
    }
  });
});
