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

  it("rejects a second active run for the same issue at the DB layer", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-schema-active-run-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });

    try {
      await runStore.recordRunStarted({
        runId: "run-702",
        repositoryKey: "openai/symphony",
        trackerIssueId: "tracker-702",
        issueIdentifier: "COL-702",
        runMode: "implementation",
        startedAt: "2026-04-09T12:03:00.000Z",
        status: "running"
      });

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
          "run-703",
          "openai/symphony",
          "COL-702",
          "dispatching",
          "2026-04-09T12:04:00.000Z",
          "2026-04-09T12:04:00.000Z",
          "2026-04-09T12:04:00.000Z"
        )
      ).toThrow(
        /symphony_runs_one_active_run_per_issue_idx|UNIQUE constraint failed: symphony_runs.issue_identifier/
      );
    } finally {
      database.close();
    }
  });

  it("rejects a second active route workflow for the same issue at the DB layer", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-schema-route-workflow-"));
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
        "COL-703",
        "tracker-703",
        "openai/symphony",
        "2026-04-09T12:00:00.000Z",
        "2026-04-09T12:00:00.000Z",
        "2026-04-09T12:00:00.000Z"
      );

      database.client.prepare(`
        insert into route_workflows (
          workflow_id,
          repository_key,
          issue_identifier,
          router_preset_id,
          router_name,
          router_version,
          archived_at,
          inserted_at,
          updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "workflow-703-a",
        "openai/symphony",
        "COL-703",
        "current-flow",
        "router-a",
        "1",
        null,
        "2026-04-09T12:01:00.000Z",
        "2026-04-09T12:01:00.000Z"
      );

      expect(() =>
        database.client.prepare(`
          insert into route_workflows (
            workflow_id,
            repository_key,
            issue_identifier,
            router_preset_id,
            router_name,
            router_version,
            archived_at,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          "workflow-703-b",
          "openai/symphony",
          "COL-703",
          "alternate-flow",
          "router-b",
          "1",
          null,
          "2026-04-09T12:02:00.000Z",
          "2026-04-09T12:02:00.000Z"
        )
      ).toThrow(
        /route_workflows_live_issue_idx|UNIQUE constraint failed: route_workflows.issue_identifier/
      );
    } finally {
      database.close();
    }
  });

  it("requires router preset identity on persisted route workflows", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-schema-route-preset-"));
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
        "COL-703P",
        "tracker-703P",
        "openai/symphony",
        "2026-04-09T12:00:00.000Z",
        "2026-04-09T12:00:00.000Z",
        "2026-04-09T12:00:00.000Z"
      );

      expect(() =>
        database.client.prepare(`
          insert into route_workflows (
            workflow_id,
            repository_key,
            issue_identifier,
            router_name,
            router_version,
            archived_at,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          "workflow-703P",
          "openai/symphony",
          "COL-703P",
          "router-a",
          "1",
          null,
          "2026-04-09T12:01:00.000Z",
          "2026-04-09T12:01:00.000Z"
        )
      ).toThrow(/NOT NULL constraint failed: route_workflows\.router_preset_id/);
    } finally {
      database.close();
    }
  });

  it("rejects duplicate signal ids within the same route workflow at the DB layer", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-schema-route-signal-"));
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
        "COL-704",
        "tracker-704",
        "openai/symphony",
        "2026-04-09T12:00:00.000Z",
        "2026-04-09T12:00:00.000Z",
        "2026-04-09T12:00:00.000Z"
      );

      database.client.prepare(`
        insert into route_workflows (
          workflow_id,
          repository_key,
          issue_identifier,
          router_preset_id,
          router_name,
          router_version,
          archived_at,
          inserted_at,
          updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "workflow-704",
        "openai/symphony",
        "COL-704",
        "current-flow",
        "router-a",
        "1",
        null,
        "2026-04-09T12:01:00.000Z",
        "2026-04-09T12:01:00.000Z"
      );

      database.client.prepare(`
        insert into route_history_events (
          event_id,
          workflow_id,
          event_sequence,
          kind,
          recorded_at,
          signal_id,
          signal_type,
          signal_source,
          decision_id,
          command_id,
          from_node,
          to_node,
          edge_id,
          reason_code,
          event_json,
          inserted_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, json(?), ?)
      `).run(
        "event-704-a",
        "workflow-704",
        1,
        "signal_recorded",
        "2026-04-09T12:02:00.000Z",
        "signal-704",
        "tracker.state_observed",
        "tracker",
        null,
        null,
        null,
        null,
        null,
        null,
        JSON.stringify({
          kind: "signal_recorded",
          recordedAt: "2026-04-09T12:02:00.000Z",
          signal: {
            id: "signal-704",
            type: "tracker.state_observed",
            source: "tracker",
            occurredAt: "2026-04-09T12:02:00.000Z",
            causationId: null,
            correlationId: null,
            payload: {
              state: "Todo"
            }
          }
        }),
        "2026-04-09T12:02:00.000Z"
      );

      expect(() =>
        database.client.prepare(`
          insert into route_history_events (
            event_id,
            workflow_id,
            event_sequence,
            kind,
            recorded_at,
            signal_id,
            signal_type,
            signal_source,
            decision_id,
            command_id,
            from_node,
            to_node,
            edge_id,
            reason_code,
            event_json,
            inserted_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, json(?), ?)
        `).run(
          "event-704-b",
          "workflow-704",
          2,
          "signal_recorded",
          "2026-04-09T12:03:00.000Z",
          "signal-704",
          "tracker.state_observed",
          "tracker",
          null,
          null,
          null,
          null,
          null,
          null,
          JSON.stringify({
            kind: "signal_recorded",
            recordedAt: "2026-04-09T12:03:00.000Z",
            signal: {
              id: "signal-704",
              type: "tracker.state_observed",
              source: "tracker",
              occurredAt: "2026-04-09T12:03:00.000Z",
              causationId: null,
              correlationId: null,
              payload: {
                state: "Rework"
              }
            }
          }),
          "2026-04-09T12:03:00.000Z"
        )
      ).toThrow(
        /route_history_events_workflow_signal_id_idx|UNIQUE constraint failed: route_history_events.workflow_id, route_history_events.signal_id/
      );
    } finally {
      database.close();
    }
  });
});
