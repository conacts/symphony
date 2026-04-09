import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSymphonyIssueTimelineStore,
  createSymphonyIssueDeliveryReportStore,
  initializeSymphonyDb
} from "@symphony/db";
import {
  createMemorySymphonyTracker,
  type SymphonyTrackerIssue
} from "@symphony/tracker";
import {
  executeCancelTool,
  executeDeliveryReportTool,
  executeMergeResultTool,
  executeSpikeResultTool
} from "./index.js";

const tempRoots: string[] = [];
const testRepositoryKey = "openai/symphony";

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

describe("runtime tools", () => {
  it("records completed delivery reports against the active run and turn", async () => {
    const { database, deliveryReports } = await createRuntimeToolsTestContext();
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
        teamKey: null,
        assigneeId: null,
        blockedBy: [],
        labels: [],
        assignedToWorker: true,
        createdAt: null,
        updatedAt: null
      }
    ]);

    const result = await executeDeliveryReportTool(
      {
        tracker,
        deliveryReports,
        issue: {
          id: "issue-123",
          identifier: "COL-123",
          state: "In Progress"
        },
        runId: "run-123",
        turnId: "turn-123",
        onDeliveryReportRecorded(report) {
          recorded.push({
            status: report.status,
            prUrl: report.prUrl
          });
        }
      },
      {
        status: "completed",
        summary: "Opened the PR and finished the requested work.",
        prUrl: "https://github.com/openai/symphony/pull/123",
        branchName: "codex/col-123"
      }
    );

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
    const { database, deliveryReports } = await createRuntimeToolsTestContext();

    const result = await executeDeliveryReportTool(
      {
        tracker: createMemorySymphonyTracker(),
        deliveryReports,
        issue: {
          id: "issue-123",
          identifier: "COL-123"
        },
        runId: "run-123",
        turnId: "turn-123"
      },
      {
        status: "completed",
        summary: "Finished the work without a PR."
      }
    );

    expect(result.success).toBe(false);
    expect(String(result.output)).toContain("requires `prUrl`");
    expect(await deliveryReports.listForRun("run-123")).toEqual([]);

    database.close();
  });

  it("records delivery even when the In Review transition fails", async () => {
    const { database, deliveryReports } = await createRuntimeToolsTestContext();

    const result = await executeDeliveryReportTool(
      {
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
        turnId: "turn-123"
      },
      {
        status: "completed",
        summary: "Opened the PR and finished the requested work.",
        prUrl: "https://github.com/openai/symphony/pull/123"
      }
    );

    expect(result.success).toBe(false);
    expect(String(result.output)).toContain('"success": false');
    expect(await deliveryReports.listForRun("run-123")).toHaveLength(1);

    database.close();
  });

  it("records blocked delivery reports and moves the issue to Blocked", async () => {
    const { database, deliveryReports } = await createRuntimeToolsTestContext();
    const tracker = createMemorySymphonyTracker([
      buildRuntimeToolIssue({
        id: "issue-124",
        identifier: "COL-124",
        title: "Unblock the workspace integration",
        state: "In Progress"
      })
    ]);

    const result = await executeDeliveryReportTool(
      {
        tracker,
        deliveryReports,
        issue: {
          id: "issue-124",
          identifier: "COL-124",
          state: "In Progress"
        },
        runId: "run-124",
        turnId: "turn-124",
        blockedTargetState: "Blocked"
      },
      {
        status: "blocked",
        summary: "Workspace bootstrap exposed a repository-owned blocker.",
        blockingReason: "Missing required repo credentials for integration tests."
      }
    );

    expect(result.success).toBe(true);
    expect(String(result.output)).toContain('"targetState": "Blocked"');
    expect(tracker.getIssue("issue-124")?.state).toBe("Blocked");
    expect(await deliveryReports.listForRun("run-124")).toEqual([
      expect.objectContaining({
        status: "blocked",
        blockingReason: "Missing required repo credentials for integration tests."
      })
    ]);

    database.close();
  });

  it("posts the spike result comment and moves the issue to the configured pause state", async () => {
    const tracker = createMemorySymphonyTracker([
      buildRuntimeToolIssue({
        id: "issue-456",
        identifier: "SYM-456",
        title: "Investigate the runtime architecture"
      })
    ]);

    const result = await executeSpikeResultTool(
      {
        tracker,
        issue: {
          id: "issue-456",
          identifier: "SYM-456",
          state: "In Progress"
        },
        defaultTargetState: "Paused"
      },
      {
        summary: "Recommended the Agent OS spike.",
        details: "- Findings\n- Recommendation"
      }
    );

    expect(result.success).toBe(true);
    expect(String(result.output)).toContain('"commentPosted": true');
    expect(String(result.output)).toContain('"targetState": "Paused"');
    expect(tracker.getIssue("issue-456")?.state).toBe("Paused");
    expect(tracker.listOperations()).toEqual([
      expect.objectContaining({
        kind: "comment",
        issueId: "issue-456"
      }),
      {
        kind: "update_state",
        issueId: "issue-456",
        stateName: "Paused"
      }
    ]);
  });

  it("posts a cancellation comment and moves the issue to Canceled", async () => {
    const tracker = createMemorySymphonyTracker([
      buildRuntimeToolIssue({
        id: "issue-789",
        identifier: "SYM-789",
        title: "Abort the stale work"
      })
    ]);

    const result = await executeCancelTool(
      {
        tracker,
        issue: {
          id: "issue-789",
          identifier: "SYM-789",
          state: "In Progress"
        },
        defaultTargetState: "Canceled"
      },
      {
        reason: "Canceling this run because the requirements changed."
      }
    );

    expect(result.success).toBe(true);
    expect(String(result.output)).toContain('"canceled": true');
    expect(String(result.output)).toContain('"targetState": "Canceled"');
    expect(tracker.getIssue("issue-789")?.state).toBe("Canceled");
    expect(tracker.listOperations()).toEqual([
      expect.objectContaining({
        kind: "comment",
        issueId: "issue-789",
        body: expect.stringContaining("Cancellation")
      }),
      {
        kind: "update_state",
        issueId: "issue-789",
        stateName: "Canceled"
      }
    ]);
  });

  it("records a merged result for the active approved run", async () => {
    const { issueTimelineStore } = await createRuntimeToolsTestContext();
    const tracker = createMemorySymphonyTracker([
      buildRuntimeToolIssue({
        id: "issue-321",
        identifier: "SYM-321",
        title: "Finish the approved merge"
      })
    ]);
    const recorded: string[] = [];

    const result = await executeMergeResultTool(
      {
        tracker,
        issueTimelineStore,
        issue: {
          id: "issue-321",
          identifier: "SYM-321",
          state: "In Progress"
        },
        runId: "run-321",
        turnId: "turn-321",
        onMergeResultRecorded(mergeResult) {
          recorded.push(mergeResult.status);
        }
      },
      {
        status: "merged",
        summary: "Merged the PR after syncing with main.",
        prUrl: "https://github.com/openai/symphony/pull/321",
        mergeCommitSha: "abc123",
        testsSummary: "pnpm test"
      }
    );

    expect(result.success).toBe(true);
    expect(recorded).toEqual(["merged"]);
    expect(tracker.listOperations()).toEqual([
      expect.objectContaining({
        kind: "comment",
        issueId: "issue-321",
        body: expect.stringContaining("Merge Result")
      })
    ]);

    const entries = await issueTimelineStore.listIssueTimeline("SYM-321");
    expect(entries[0]).toEqual(
      expect.objectContaining({
        runId: "run-321",
        turnId: "turn-321",
        source: "runtime",
        eventType: "merge_result_reported"
      })
    );
  });

  it("rejects blocked merge results that omit the blocking reason", async () => {
    const { issueTimelineStore } = await createRuntimeToolsTestContext();

    const result = await executeMergeResultTool(
      {
        tracker: createMemorySymphonyTracker(),
        issueTimelineStore,
        issue: {
          id: "issue-654",
          identifier: "SYM-654"
        },
        runId: "run-654",
        turnId: "turn-654"
      },
      {
        status: "blocked",
        summary: "Conflicts remain unresolved."
      }
    );

    expect(result.success).toBe(false);
    expect(String(result.output)).toContain("requires `blockingReason`");
  });
});

async function createRuntimeToolsTestContext() {
  const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-tools-"));
  tempRoots.push(root);

  const database = initializeSymphonyDb({
    dbFile: path.join(root, "symphony.db")
  });
  const issueTimelineStore = createSymphonyIssueTimelineStore(database.db, {
    repositoryKey: testRepositoryKey
  });
  const deliveryReports = createSymphonyIssueDeliveryReportStore({
    db: database.db,
    timelineStore: issueTimelineStore,
    repositoryKey: testRepositoryKey
  });

  return {
    database,
    deliveryReports,
    issueTimelineStore
  };
}

function buildRuntimeToolIssue(overrides: Partial<SymphonyTrackerIssue> = {}) {
  return {
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
    teamKey: null,
    assigneeId: null,
    blockedBy: [],
    labels: [],
    assignedToWorker: true,
    createdAt: null,
    updatedAt: null,
    ...overrides
  };
}
