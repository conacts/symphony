import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRouteWorkflowStore,
  createSymphonyIssueStore,
  initializeSymphonyDb
} from "@symphony/db";
import type { WorkflowSignal } from "@symphony/router";
import {
  buildSymphonyReworkHandoff,
  buildSymphonyRuntimePolicy,
  buildSymphonyTrackerIssue
} from "@symphony/test-support";
import { createRuntimeWorkflowLifecycleReadPort } from "./runtime-workflow-lifecycle-read-port.js";
import { createRuntimeCurrentFlowRouting } from "./runtime-workflow-presets.js";
import { createRuntimeWorkflowSessionLoader } from "./runtime-workflow-session-loader.js";
import { createRouteWorkflowPort } from "./runtime-route-workflows.js";

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

describe("runtime workflow lifecycle read port", () => {
  it("reads tracker state and latest rework handoff from persisted workflow history", async () => {
    const harness = await createHarness();

    try {
      await harness.ensureWorkflow();
      await harness.recordTrackerObserved({
        trackerState: "In Review",
        recordedAt: "2026-04-10T17:00:00.000Z"
      });

      expect(
        await harness.lifecycleRead.loadCurrentTrackerState({
          issueIdentifier: harness.issue.identifier
        })
      ).toBe("In Review");

      const handoff = buildSymphonyReworkHandoff({
        triggerKind: "changes_requested_review",
        recordedAt: "2026-04-10T17:00:05.000Z"
      });
      await harness.recordReviewReworkRequested({
        handoff
      });

      expect(
        await harness.lifecycleRead.loadLatestReworkHandoff({
          issueIdentifier: harness.issue.identifier
        })
      ).toEqual(handoff);
    } finally {
      harness.close();
    }
  });

  it("reads persisted merge results only for the matching run id", async () => {
    const harness = await createHarness();

    try {
      await harness.ensureWorkflow();
      await harness.recordTrackerObserved({
        trackerState: "Approved",
        recordedAt: "2026-04-10T17:05:00.000Z"
      });
      await harness.recordRunStarted({
        runId: "run-approved-1",
        runMode: "approved_merge",
        recordedAt: "2026-04-10T17:05:01.000Z"
      });
      await harness.recordMergeResult({
        runId: "run-approved-1",
        recordedAt: "2026-04-10T17:05:02.000Z",
        mergeResult: {
          status: "merged",
          summary: "Merged successfully",
          prUrl: "https://github.com/openai/symphony/pull/1",
          mergeCommitSha: "abc123",
          blockingReason: null,
          testsSummary: "green"
        }
      });

      expect(
        await harness.lifecycleRead.loadLatestMergeResult({
          issueIdentifier: harness.issue.identifier,
          runId: "run-approved-1"
        })
      ).toEqual({
        status: "merged",
        summary: "Merged successfully",
        prUrl: "https://github.com/openai/symphony/pull/1",
        mergeCommitSha: "abc123",
        blockingReason: null,
        testsSummary: "green"
      });
      expect(
        await harness.lifecycleRead.loadLatestMergeResult({
          issueIdentifier: harness.issue.identifier,
          runId: "run-approved-2"
        })
      ).toBeNull();
    } finally {
      harness.close();
    }
  });
});

async function createHarness() {
  const root = await mkdtemp(
    path.join(tmpdir(), "symphony-runtime-workflow-lifecycle-read-port-")
  );
  tempDirectories.push(root);

  const database = initializeSymphonyDb({
    dbFile: path.join(root, "symphony.db")
  });
  const issueStore = createSymphonyIssueStore(database.db);
  const routeWorkflowStore = createRouteWorkflowStore(database.db);
  const routeWorkflows = createRouteWorkflowPort({
    routeWorkflowStore
  });
  const runtimePolicy = buildSymphonyRuntimePolicy();
  const issue = buildSymphonyTrackerIssue({
    state: "Todo"
  });
  const routing = await createRuntimeCurrentFlowRouting({
    trackerConfig: runtimePolicy.tracker,
    now: () => new Date("2026-04-10T17:00:00.000Z")
  });
  const sessionLoader = await createRuntimeWorkflowSessionLoader({
    routeWorkflows,
    trackerConfig: runtimePolicy.tracker,
    now: () => new Date("2026-04-10T17:00:00.000Z")
  });
  const lifecycleRead = createRuntimeWorkflowLifecycleReadPort({
    sessionLoader
  });

  await issueStore.upsert({
    issueIdentifier: issue.identifier,
    trackerIssueId: issue.id,
    repositoryKey: "openai/symphony"
  });

  async function ensureWorkflow() {
    await routeWorkflows.ensureWorkflowForIssue({
      issueIdentifier: issue.identifier,
      repositoryKey: "openai/symphony",
      routerPresetId: routing.presetId,
      router: routing.router,
      createdAt: "2026-04-10T17:00:00.000Z"
    });
  }

  async function recordTrackerObserved(input: {
    trackerState: string;
    recordedAt: string;
  }) {
    await recordSignal(
      routing.module.runtimeAdapter.createTrackerStateObservedSignal({
        id: `signal_tracker_state_observed_${input.recordedAt}`,
        occurredAt: input.recordedAt,
        trackerState: input.trackerState,
        runId: null,
        runMode: null,
        causationId: null,
        correlationId: issue.identifier
      })
    );
  }

  async function recordReviewReworkRequested(input: {
    handoff: ReturnType<typeof buildSymphonyReworkHandoff>;
  }) {
    await recordSignal(
      routing.module.runtimeAdapter.createReviewReworkRequestedSignal({
        id: `signal_review_rework_requested_${input.handoff.recordedAt}`,
        occurredAt: input.handoff.recordedAt,
        handoff: input.handoff,
        causationId: issue.identifier,
        correlationId: issue.identifier
      })
    );
  }

  async function recordRunStarted(input: {
    runId: string;
    runMode: "implementation" | "rework" | "approved_merge";
    recordedAt: string;
  }) {
    await recordSignal(
      routing.module.runtimeAdapter.createRunStartedSignal({
        id: `signal_run_started_${input.recordedAt}`,
        occurredAt: input.recordedAt,
        runId: input.runId,
        runMode: input.runMode,
        causationId: input.runId,
        correlationId: issue.identifier
      })
    );
  }

  async function recordMergeResult(input: {
    runId: string;
    recordedAt: string;
    mergeResult: {
      status: "merged" | "blocked";
      summary: string;
      prUrl: string | null;
      mergeCommitSha: string | null;
      blockingReason: string | null;
      testsSummary: string | null;
    };
  }) {
    await recordSignal(
      routing.module.runtimeAdapter.createMergeResultReportedSignal({
        id: `signal_merge_result_${input.recordedAt}`,
        occurredAt: input.recordedAt,
        runId: input.runId,
        mergeResult: input.mergeResult,
        causationId: input.runId,
        correlationId: issue.identifier
      })
    );
  }

  async function recordSignal(signal: WorkflowSignal) {
    const loaded = await sessionLoader.resumeByIssueIdentifier({
      issueIdentifier: issue.identifier
    });
    if (!loaded) {
      throw new TypeError(
        `Route workflow could not be resumed for ${issue.identifier} while seeding lifecycle read-port tests.`
      );
    }

    const result = await loaded.resumed.session.receiveAsync(signal);
    await routeWorkflows.recordRouteResult({
      workflowId: loaded.resumed.hydrationState.workflow.workflowId,
      policy: loaded.routing.policy,
      result
    });
  }

  return {
    issue,
    lifecycleRead,
    ensureWorkflow,
    recordTrackerObserved,
    recordReviewReworkRequested,
    recordRunStarted,
    recordMergeResult,
    close() {
      database.close();
    }
  };
}
