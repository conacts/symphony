import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSymphonyDb } from "./client.js";
import { createSqliteSymphonyRuntimeRunStore } from "./runtime-run-store.js";

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

describe("db schema enforcement", () => {
  it("rejects runs whose repository binding does not match the canonical issue", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-schema-run-fk-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });

    try {
      database.client.prepare(`
        insert into symphony_issues (
          issue_identifier,
          tracker_issue_id,
          repository_key,
          latest_run_started_at,
          inserted_at,
          updated_at
        ) values (?, ?, ?, ?, ?, ?)
      `).run(
        "COL-700",
        "tracker-700",
        "openai/symphony",
        "2026-04-09T12:00:00.000Z",
        "2026-04-09T12:00:00.000Z",
        "2026-04-09T12:00:00.000Z"
      );

      expect(() =>
        database.client.prepare(`
          insert into symphony_runs (
            run_id,
            repository_key,
            issue_identifier,
            status,
            started_at,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?)
        `).run(
          "run-700",
          "other/repo",
          "COL-700",
          "running",
          "2026-04-09T12:01:00.000Z",
          "2026-04-09T12:01:00.000Z",
          "2026-04-09T12:01:00.000Z"
        )
      ).toThrow(/FOREIGN KEY constraint failed/);
    } finally {
      database.close();
    }
  });

  it("rejects orphaned structured pi tool rows", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-schema-pi-tool-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });

    try {
      expect(() =>
        database.client.prepare(`
          insert into pi_reads (
            run_id,
            turn_id,
            item_id,
            path,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?)
        `).run(
          "run-missing",
          "turn-missing",
          "item-missing",
          "src/index.ts",
          "2026-04-09T12:02:00.000Z",
          "2026-04-09T12:02:00.000Z"
        )
      ).toThrow(/FOREIGN KEY constraint failed/);
    } finally {
      database.close();
    }
  });

  it("rejects completed delivery reports without a PR url at the DB layer", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-schema-delivery-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });

    try {
      const runId = await runStore.recordRunStarted({
        runId: "run-701",
        repositoryKey: "openai/symphony",
        trackerIssueId: "tracker-701",
        issueIdentifier: "COL-701",
        runMode: "implementation",
        startedAt: "2026-04-09T12:03:00.000Z",
        status: "running"
      });

      expect(() =>
        database.client.prepare(`
          insert into symphony_issue_delivery_reports (
            report_id,
            issue_identifier,
            run_id,
            turn_id,
            status,
            summary,
            pr_url,
            pr_number,
            branch_name,
            blocking_reason,
            tests_summary,
            source,
            payload_json,
            reported_at,
            inserted_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          "report-701",
          "COL-701",
          runId,
          null,
          "completed",
          "Opened the PR.",
          null,
          null,
          null,
          null,
          null,
          "pi",
          null,
          "2026-04-09T12:04:00.000Z",
          "2026-04-09T12:04:00.000Z"
        )
      ).toThrow(/CHECK constraint failed/);
    } finally {
      database.close();
    }
  });
});
