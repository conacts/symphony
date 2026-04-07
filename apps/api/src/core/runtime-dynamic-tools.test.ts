import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSymphonyIssueDeliveryReportStore,
  initializeSymphonyDb
} from "@symphony/db";
import { createSilentSymphonyLogger } from "@symphony/logger";
import { buildSymphonyRuntimePolicy } from "@symphony/test-support";
import { createMemorySymphonyTracker } from "@symphony/tracker";
import { buildRuntimeDynamicToolExecutor } from "./runtime-dynamic-tools.js";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      rm(root, {
        recursive: true,
        force: true
      })
    )
  );
});

describe("runtime dynamic tools", () => {
  it("records completed delivery reports against the active run and turn", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-dynamic-tools-"));
    tempRoots.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const deliveryReports = createSymphonyIssueDeliveryReportStore({
      db: database.db
    });
    const recorded: Array<{ status: string; prUrl: string | null }> = [];
    const tracker = createMemorySymphonyTracker([
      {
        id: "issue-123",
        identifier: "COL-123",
        title: "Ship the feature",
        description: null,
        priority: null,
        state: "In Progress",
        branchName: "codex/col-123",
        url: null,
        projectId: null,
        projectName: null,
        projectSlug: null,
        teamKey: null,
        assigneeId: null,
        blockedBy: [],
        labels: [],
        assignedToWorker: true,
        createdAt: null,
        updatedAt: null
      }
    ]);
    const executor = buildRuntimeDynamicToolExecutor({
      runtimePolicy: buildSymphonyRuntimePolicy(),
      logger: createSilentSymphonyLogger("@symphony/api.test.dynamic-tools"),
      tracker,
      deliveryReports,
      issue: {
        id: "issue-123",
        identifier: "COL-123",
        state: "In Progress"
      },
      runId: "run-123",
      readTurnId: () => "turn-123",
      onDeliveryReportRecorded(report) {
        recorded.push({
          status: report.status,
          prUrl: report.prUrl
        });
      }
    });

    const result = await executor("finish_and_send_to_review", {
      status: "completed",
      summary: "Opened the PR and finished the requested work.",
      prUrl: "https://github.com/openai/symphony/pull/123",
      branchName: "codex/col-123"
    });

    expect(result.success).toBe(true);
    expect(String(result.output)).toContain('"targetState": "In Review"');
    expect(recorded).toEqual([
      {
        status: "completed",
        prUrl: "https://github.com/openai/symphony/pull/123"
      }
    ]);

    const reports = await deliveryReports.listForRun("run-123");
    expect(reports).toHaveLength(1);
    expect(reports[0]).toEqual(
      expect.objectContaining({
        issueIdentifier: "COL-123",
        runId: "run-123",
        turnId: "turn-123",
        status: "completed",
        prUrl: "https://github.com/openai/symphony/pull/123",
        branchName: "codex/col-123"
      })
    );
    expect(tracker.getIssue("issue-123")?.state).toBe("In Review");

    database.close();
  });

  it("rejects completed delivery reports that omit the PR url", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-dynamic-tools-"));
    tempRoots.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const deliveryReports = createSymphonyIssueDeliveryReportStore({
      db: database.db
    });
    const executor = buildRuntimeDynamicToolExecutor({
      runtimePolicy: buildSymphonyRuntimePolicy(),
      logger: createSilentSymphonyLogger("@symphony/api.test.dynamic-tools"),
      tracker: createMemorySymphonyTracker(),
      deliveryReports,
      issue: {
        id: "issue-123",
        identifier: "COL-123"
      },
      runId: "run-123",
      readTurnId: () => "turn-123"
    });

    const result = await executor("finish_and_send_to_review", {
      status: "completed",
      summary: "Finished the work without a PR."
    });

    expect(result.success).toBe(false);
    expect(String(result.output)).toContain("requires `prUrl`");
    expect(await deliveryReports.listForRun("run-123")).toEqual([]);

    database.close();
  });

  it("records delivery even when the In Review transition fails", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-dynamic-tools-"));
    tempRoots.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const deliveryReports = createSymphonyIssueDeliveryReportStore({
      db: database.db
    });
    const executor = buildRuntimeDynamicToolExecutor({
      runtimePolicy: buildSymphonyRuntimePolicy(),
      logger: createSilentSymphonyLogger("@symphony/api.test.dynamic-tools"),
      tracker: {
        async fetchCandidateIssues() {
          return [];
        },
        async fetchIssuesByStates() {
          return [];
        },
        async fetchIssueStatesByIds() {
          return [];
        },
        async fetchIssueByIdentifier() {
          return null;
        },
        async createComment() {
          return;
        },
        async updateIssueState() {
          throw new Error("tracker unavailable");
        }
      },
      deliveryReports,
      issue: {
        id: "issue-123",
        identifier: "COL-123",
        state: "In Progress"
      },
      runId: "run-123",
      readTurnId: () => "turn-123"
    });

    const result = await executor("finish_and_send_to_review", {
      status: "completed",
      summary: "Opened the PR and finished the requested work.",
      prUrl: "https://github.com/openai/symphony/pull/123"
    });

    expect(result.success).toBe(true);
    expect(String(result.output)).toContain('"success": false');
    expect(await deliveryReports.listForRun("run-123")).toHaveLength(1);

    database.close();
  });

  it("keeps accepting the legacy report_issue_delivery alias", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-dynamic-tools-"));
    tempRoots.push(root);

    const database = initializeSymphonyDb({
      dbFile: path.join(root, "symphony.db")
    });
    const deliveryReports = createSymphonyIssueDeliveryReportStore({
      db: database.db
    });
    const executor = buildRuntimeDynamicToolExecutor({
      runtimePolicy: buildSymphonyRuntimePolicy(),
      logger: createSilentSymphonyLogger("@symphony/api.test.dynamic-tools"),
      tracker: createMemorySymphonyTracker(),
      deliveryReports,
      issue: {
        id: "issue-123",
        identifier: "COL-123"
      },
      runId: "run-123",
      readTurnId: () => "turn-123"
    });

    const result = await executor("report_issue_delivery", {
      status: "partial",
      summary: "Partially delivered work while using the legacy alias."
    });

    expect(result.success).toBe(true);
    expect(await deliveryReports.listForRun("run-123")).toHaveLength(1);

    database.close();
  });
});
