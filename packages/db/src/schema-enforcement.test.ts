import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { initializeSymphonyDb } from "./client.js";
import { createSymphonyIssueStore } from "./issues.js";
import { createSqliteSymphonyRuntimeRunStore } from "./runtime-run-store.js";
import type { SymphonyRuntimeRunStartAttrs } from "./runtime-run-types.js";

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

async function recordSeededRunStarted(
  db: ReturnType<typeof initializeSymphonyDb>["db"],
  runStore: ReturnType<typeof createSqliteSymphonyRuntimeRunStore>,
  attrs: SymphonyRuntimeRunStartAttrs
): Promise<string> {
  const issueStore = createSymphonyIssueStore(db);
  await issueStore.upsert({
    issueIdentifier: attrs.issueIdentifier,
    trackerIssueId: attrs.trackerIssueId,
    repositoryKey: attrs.repositoryKey,
    latestRunStartedAt: null,
    recordedAt: new Date(attrs.startedAt).toISOString()
  });

  return await runStore.recordRunStarted(attrs);
}

describe("db schema enforcement", () => {
  it("rejects runs with non-canonical outcomes at the DB layer", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-schema-run-outcome-"));
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
        "COL-699",
        "tracker-699",
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
            run_mode,
            status,
            outcome,
            started_at,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          "run-699",
          "openai/symphony",
          "COL-699",
          "implementation",
          "finished",
          "delivered",
          "2026-04-09T12:01:00.000Z",
          "2026-04-09T12:01:00.000Z",
          "2026-04-09T12:01:00.000Z"
        )
      ).toThrow(/CHECK constraint failed/);
    } finally {
      database.close();
    }
  });

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
            run_mode,
            status,
            started_at,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          "run-700",
          "other/repo",
          "COL-700",
          "implementation",
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
      const runId = await recordSeededRunStarted(database.db, runStore, {
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

  it("rejects delivery reports whose run does not belong to the referenced issue", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-schema-delivery-issue-run-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const runStore = createSqliteSymphonyRuntimeRunStore({
      db: database.db
    });

    try {
      const runId = await recordSeededRunStarted(database.db, runStore, {
        runId: "run-701A",
        repositoryKey: "openai/symphony",
        trackerIssueId: "tracker-701A",
        issueIdentifier: "COL-701A",
        runMode: "implementation",
        startedAt: "2026-04-09T12:03:00.000Z",
        status: "running"
      });

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
        "COL-701B",
        "tracker-701B",
        "openai/symphony",
        "2026-04-09T12:03:30.000Z",
        "2026-04-09T12:03:30.000Z",
        "2026-04-09T12:03:30.000Z"
      );

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
          "report-701A",
          "COL-701B",
          runId,
          null,
          "partial",
          "Wrong issue binding.",
          null,
          null,
          null,
          null,
          null,
          "runtime",
          null,
          "2026-04-09T12:04:00.000Z",
          "2026-04-09T12:04:00.000Z"
        )
      ).toThrow(/FOREIGN KEY constraint failed/);
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
      await recordSeededRunStarted(database.db, runStore, {
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
            run_mode,
            status,
            started_at,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          "run-703",
          "openai/symphony",
          "COL-702",
          "implementation",
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

  it("rejects runs with an invalid run mode at the DB layer", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-schema-run-mode-"));
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
        "COL-702A",
        "tracker-702A",
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
            run_mode,
            status,
            started_at,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          "run-702A",
          "openai/symphony",
          "COL-702A",
          "deploy",
          "running",
          "2026-04-09T12:01:00.000Z",
          "2026-04-09T12:01:00.000Z",
          "2026-04-09T12:01:00.000Z"
        )
      ).toThrow(/CHECK constraint failed/);
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
          tracker_issue_id,
          router_preset_id,
          router_name,
          router_version,
          archived_at,
          inserted_at,
          updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "workflow-703-a",
        "tracker-703",
        "intelligent-flow",
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
            tracker_issue_id,
            router_preset_id,
            router_name,
            router_version,
            archived_at,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          "workflow-703-b",
          "tracker-703",
          "alternate-flow",
          "router-b",
          "1",
          null,
          "2026-04-09T12:02:00.000Z",
          "2026-04-09T12:02:00.000Z"
        )
      ).toThrow(
        /route_workflows_live_tracker_issue_idx|UNIQUE constraint failed: route_workflows.tracker_issue_id/
      );
    } finally {
      database.close();
    }
  });

  it("rejects orphaned issue timeline rows at the DB layer", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-schema-issue-timeline-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });

    try {
      expect(() =>
        database.client.prepare(`
          insert into symphony_issue_timeline_entries (
            entry_id,
            issue_identifier,
            run_id,
            turn_id,
            source,
            event_type,
            message,
            payload,
            recorded_at,
            inserted_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          "timeline-705",
          "COL-705",
          null,
          null,
          "runtime",
          "runtime_session_started",
          "Started session.",
          null,
          "2026-04-09T12:05:00.000Z",
          "2026-04-09T12:05:00.000Z"
        )
      ).toThrow(/FOREIGN KEY constraint failed/);
    } finally {
      database.close();
    }
  });

  it("rejects runtime log rows whose repository binding does not match the canonical issue", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-schema-runtime-log-"));
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
        "COL-706",
        "tracker-706",
        "openai/symphony",
        null,
        "2026-04-09T12:06:00.000Z",
        "2026-04-09T12:06:00.000Z"
      );

      expect(() =>
        database.client.prepare(`
          insert into symphony_runtime_logs (
            entry_id,
            repository_key,
            level,
            source,
            event_type,
            message,
            issue_identifier,
            run_id,
            payload,
            recorded_at,
            inserted_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          "runtime-log-706",
          "other/repo",
          "info",
          "runtime",
          "runtime_session_started",
          "Started session.",
          "COL-706",
          null,
          null,
          "2026-04-09T12:06:30.000Z",
          "2026-04-09T12:06:30.000Z"
        )
      ).toThrow(/FOREIGN KEY constraint failed/);
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
            tracker_issue_id,
            router_name,
            router_version,
            archived_at,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?)
        `).run(
          "workflow-703P",
          "tracker-703P",
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
          tracker_issue_id,
          router_preset_id,
          router_name,
          router_version,
          archived_at,
          inserted_at,
          updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "workflow-704",
        "tracker-704",
        "intelligent-flow",
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

  it("rejects runtime context rows whose run does not exist", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-schema-runtime-context-"));
    tempDirectories.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });

    try {
      expect(() =>
        database.client.prepare(`
          insert into symphony_run_runtime_context (
            run_id,
            harness_kind,
            thread_id,
            process_id,
            model,
            reasoning_effort,
            profile,
            provider_id,
            provider_name,
            auth_mode,
            provider_env_key,
            launch_target_json,
            inserted_at,
            updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          "run-missing",
          "pi",
          "thread-705",
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          "2026-04-09T12:05:00.000Z",
          "2026-04-09T12:05:00.000Z"
        )
      ).toThrow(/FOREIGN KEY constraint failed/);
    } finally {
      database.close();
    }
  });

  it("rejects signal history rows that do not satisfy the signal_recorded contract", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-schema-route-signal-shape-"));
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
        "COL-705",
        "tracker-705",
        "openai/symphony",
        "2026-04-09T12:00:00.000Z",
        "2026-04-09T12:00:00.000Z",
        "2026-04-09T12:00:00.000Z"
      );

      database.client.prepare(`
        insert into route_workflows (
          workflow_id,
          tracker_issue_id,
          router_preset_id,
          router_name,
          router_version,
          archived_at,
          inserted_at,
          updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "workflow-705",
        "tracker-705",
        "intelligent-flow",
        "router-a",
        "1",
        null,
        "2026-04-09T12:01:00.000Z",
        "2026-04-09T12:01:00.000Z"
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
          "event-705-a",
          "workflow-705",
          1,
          "signal_recorded",
          "2026-04-09T12:02:00.000Z",
          null,
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
              id: null,
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
        )
      ).toThrow(
        /route_history_events_signal_recorded_shape_check|CHECK constraint failed/
      );
    } finally {
      database.close();
    }
  });

  it("rejects duplicate command settlements within the same workflow", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-schema-route-command-settlement-"));
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
        "COL-706",
        "tracker-706",
        "openai/symphony",
        "2026-04-09T12:00:00.000Z",
        "2026-04-09T12:00:00.000Z",
        "2026-04-09T12:00:00.000Z"
      );

      database.client.prepare(`
        insert into route_workflows (
          workflow_id,
          tracker_issue_id,
          router_preset_id,
          router_name,
          router_version,
          archived_at,
          inserted_at,
          updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "workflow-706",
        "tracker-706",
        "intelligent-flow",
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
        "event-706-a",
        "workflow-706",
        1,
        "command_settled",
        "2026-04-09T12:02:00.000Z",
        null,
        null,
        null,
        null,
        "command-706",
        null,
        null,
        null,
        null,
        JSON.stringify({
          kind: "command_settled",
          commandId: "command-706",
          status: "succeeded",
          payload: {},
          recordedAt: "2026-04-09T12:02:00.000Z"
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
          "event-706-b",
          "workflow-706",
          2,
          "command_settled",
          "2026-04-09T12:03:00.000Z",
          null,
          null,
          null,
          null,
          "command-706",
          null,
          null,
          null,
          null,
          JSON.stringify({
            kind: "command_settled",
            commandId: "command-706",
            status: "failed",
            payload: {
              reason: "duplicate"
            },
            recordedAt: "2026-04-09T12:03:00.000Z"
          }),
          "2026-04-09T12:03:00.000Z"
        )
      ).toThrow(
        /route_history_events_workflow_command_settlement_id_idx|UNIQUE constraint failed: route_history_events.workflow_id, route_history_events.command_id/
      );
    } finally {
      database.close();
    }
  });
});
