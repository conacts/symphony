import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createFileBackedSymphonyRunJournal,
  defaultSymphonyRunJournalFile
} from "./file-backed-symphony-run-journal.js";
import {
  buildSymphonyEventAttrs,
  buildSymphonyRunFinishAttrs,
  buildSymphonyRunStartAttrs,
  buildSymphonyTurnFinishAttrs,
  buildSymphonyTurnStartAttrs
} from "../test-support/build-symphony-run-journal-fixture.js";

const tempDirectories: string[] = [];

async function createJournal(options: {
  retentionDays?: number;
  payloadMaxBytes?: number;
} = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "symphony-run-journal-"));
  tempDirectories.push(root);

  return createFileBackedSymphonyRunJournal({
    dbFile: defaultSymphonyRunJournalFile(root),
    ...options
  });
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("file-backed symphony run journal", () => {
  it("records nested runs, turns, and events for export and issue views", async () => {
    const journal = await createJournal();

    const runStart = buildSymphonyRunStartAttrs({
      issueId: "issue-123",
      issueIdentifier: "COL-123",
      commitHashStart: "abc123"
    });

    const runId = await journal.recordRunStarted(runStart);
    const turnId = await journal.recordTurnStarted(runId, buildSymphonyTurnStartAttrs());
    await journal.recordEvent(runId, turnId, buildSymphonyEventAttrs());
    await journal.finalizeTurn(turnId, buildSymphonyTurnFinishAttrs());
    await journal.finalizeRun(
      runId,
      buildSymphonyRunFinishAttrs({
        commitHashEnd: "def456"
      })
    );

    const issues = await journal.listIssues();
    const runs = await journal.listRunsForIssue("COL-123");
    const problemRuns = await journal.listProblemRuns();
    const exportPayload = await journal.fetchRunExport(runId);

    expect(issues[0]?.issueIdentifier).toBe("COL-123");
    expect(runs[0]?.runId).toBe(runId);
    expect(problemRuns[0]?.outcome).toBe("paused_max_turns");
    expect(exportPayload?.issue.issueIdentifier).toBe("COL-123");
    expect(exportPayload?.run.commitHashStart).toBe("abc123");
    expect(exportPayload?.run.commitHashEnd).toBe("def456");
    expect(exportPayload?.turns).toHaveLength(1);
    expect(exportPayload?.turns[0]?.events).toHaveLength(1);
  });

  it("truncates oversized payloads while preserving byte count", async () => {
    const journal = await createJournal({
      payloadMaxBytes: 48
    });

    const runId = await journal.recordRunStarted(
      buildSymphonyRunStartAttrs({
        issueId: "issue-truncated",
        issueIdentifier: "COL-TRUNC"
      })
    );
    const turnId = await journal.recordTurnStarted(
      runId,
      buildSymphonyTurnStartAttrs({
        promptText: "Capture the giant payload."
      })
    );

    await journal.recordEvent(
      runId,
      turnId,
      buildSymphonyEventAttrs({
        eventType: "stream_chunk",
        payload: {
          message: "payload-".repeat(40)
        }
      })
    );

    const exportPayload = await journal.fetchRunExport(runId);
    const event = exportPayload?.turns[0]?.events[0];

    expect(event?.payloadTruncated).toBe(true);
    expect(event?.payloadBytes).toBeGreaterThan(48);
    expect((event?.payload as { truncated: boolean }).truncated).toBe(true);
  });

  it("prunes runs older than the retention window and removes orphaned issues", async () => {
    const journal = await createJournal({
      retentionDays: 90
    });

    const runId = await journal.recordRunStarted(
      buildSymphonyRunStartAttrs({
        issueId: "issue-old",
        issueIdentifier: "COL-OLD",
        startedAt: new Date("2025-12-01T00:00:00.000Z")
      })
    );

    expect(await journal.listIssues()).toHaveLength(1);

    await journal.pruneRetention(new Date("2026-03-31T00:00:00.000Z"));

    expect(await journal.listIssues()).toHaveLength(0);
    expect(await journal.fetchRunExport(runId)).toBeNull();
  });

  it("redacts obvious secrets before persistence and export", async () => {
    const journal = await createJournal();

    const runId = await journal.recordRunStarted(
      buildSymphonyRunStartAttrs({
        issueId: "issue-redacted",
        issueIdentifier: "COL-REDACT",
        repoStart: {
          patch: "Authorization: Bearer top-secret-token\nOPENAI_API_KEY=sk-secret"
        }
      })
    );
    const turnId = await journal.recordTurnStarted(
      runId,
      buildSymphonyTurnStartAttrs({
        promptText: "Use Authorization: Bearer top-secret-token and api_key=abcdef"
      })
    );

    await journal.recordEvent(
      runId,
      turnId,
      buildSymphonyEventAttrs({
        eventType: "tool_call",
        summary: "cookie=session=abc123",
        payload: {
          headers: {
            Authorization: "Bearer top-secret-token",
            Cookie: "session=abc123"
          }
        }
      })
    );

    await journal.finalizeRun(
      runId,
      buildSymphonyRunFinishAttrs({
        errorClass: "token=oops",
        errorMessage: "password=very-secret"
      })
    );

    const exportPayload = await journal.fetchRunExport(runId);

    expect(exportPayload?.run.repoStart?.patch).toContain("[REDACTED]");
    expect(exportPayload?.turns[0]?.promptText).toContain("[REDACTED]");
    expect(exportPayload?.turns[0]?.events[0]?.summary).toContain("[REDACTED]");
    expect(
      (exportPayload?.turns[0]?.events[0]?.payload as { headers: { Authorization: string } }).headers
        .Authorization
    ).toBe("Bearer [REDACTED]");
    expect(exportPayload?.run.errorMessage).toContain("[REDACTED]");
  });

  it("merges run metadata updates instead of overwriting earlier fields", async () => {
    const journal = await createJournal();

    const runId = await journal.recordRunStarted(
      buildSymphonyRunStartAttrs({
        issueId: "issue-metadata",
        issueIdentifier: "COL-META",
        metadata: {
          runtime: "typescript"
        }
      })
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
  });
});
