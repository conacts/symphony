import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRouteWorkflowStore,
  createSymphonyIssueStore,
  initializeSymphonyDb
} from "@symphony/db";
import {
  createSymphonyCurrentFlowDeliveryReportedSignal,
  createSymphonyCurrentFlowRunStartedSignal,
  createSymphonyCurrentFlowTrackerStateObservedSignal
} from "@symphony/router";
import {
  buildSymphonyRuntimePolicy,
  buildSymphonyTrackerIssue
} from "@symphony/test-support";
import { createRouteWorkflowPort } from "./runtime-route-workflows.js";
import { compareRuntimeWorkflowByWorkflowId } from "./runtime-workflow-comparison.js";
import { createRuntimeCurrentFlowRouting } from "./runtime-workflow-presets.js";

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

describe("runtime workflow comparison", () => {
  it("replays a persisted workflow across router presets and reports divergence", async () => {
    const harness = await createHarness();

    try {
      const comparison = await compareRuntimeWorkflowByWorkflowId({
        workflowId: harness.workflowId,
        routeWorkflows: harness.routeWorkflows,
        trackerConfig: harness.runtimePolicy.tracker,
        presetIds: ["current-flow", "auto-merge"]
      });

      expect(comparison?.replay.workflow.routerPresetId).toBe("current-flow");
      expect(comparison?.replay.signals.map((signal) => signal.id)).toEqual([
        "signal_todo_observed",
        "signal_implementation_started",
        "signal_delivery_completed"
      ]);
      expect(comparison?.comparedPresetIds).toEqual([
        "current-flow",
        "auto-merge"
      ]);
      expect(comparison?.comparison.summary.diverged).toBe(true);
      expect(comparison?.comparison.summary.finalNodeByCandidate).toEqual({
        "current-flow": "review",
        "auto-merge": "approved_merge"
      });
      expect(comparison?.comparison.summary.reasonCodesByCandidate).toEqual({
        "current-flow": [
          "todo_claimed_for_dispatch",
          "implementation_run_started",
          "delivery_reported"
        ],
        "auto-merge": [
          "todo_claimed_for_dispatch",
          "implementation_run_started",
          "delivery_reported_auto_approved"
        ]
      });
    } finally {
      harness.database.close();
    }
  });

  it("fails fast when a comparison preset is requested more than once", async () => {
    const harness = await createHarness();

    try {
      await expect(
        compareRuntimeWorkflowByWorkflowId({
          workflowId: harness.workflowId,
          routeWorkflows: harness.routeWorkflows,
          trackerConfig: harness.runtimePolicy.tracker,
          presetIds: ["current-flow", "current-flow"]
        })
      ).rejects.toThrow(/requested more than once/i);
    } finally {
      harness.database.close();
    }
  });
});

async function createHarness() {
  const root = await mkdtemp(path.join(tmpdir(), "symphony-runtime-comparison-"));
  tempDirectories.push(root);

  const database = initializeSymphonyDb({
    dbFile: path.join(root, "symphony.db")
  });
  const issueStore = createSymphonyIssueStore(database.db);
  const routeWorkflows = createRouteWorkflowPort({
    routeWorkflowStore: createRouteWorkflowStore(database.db)
  });
  const runtimePolicy = buildSymphonyRuntimePolicy();
  const repositoryKey = runtimePolicy.github.repo;
  if (!repositoryKey) {
    throw new TypeError("Runtime workflow comparison test requires github.repo.");
  }

  const issue = buildSymphonyTrackerIssue({
    id: "tracker-420",
    identifier: "SYM-420",
    state: "Todo"
  });
  await issueStore.upsert({
    trackerIssueKey: issue.identifier,
    trackerIssueId: issue.id,
    repositoryKey,
    latestRunStartedAt: null,
    recordedAt: "2026-04-11T12:00:00.000Z"
  });

  const routing = await createRuntimeCurrentFlowRouting({
    trackerConfig: runtimePolicy.tracker
  });
  const ensured = await routeWorkflows.ensureWorkflowForIssue({
    trackerIssueId: issue.id,
    repositoryKey,
    trackerIssueKey: issue.identifier,
    routerPresetId: routing.presetId,
    router: routing.router,
    createdAt: "2026-04-11T12:00:01.000Z"
  });
  const session = await routing.router.startSessionAsync({
    workflowId: ensured.workflow.workflowId,
    policy: routing.policy
  });

  await routeWorkflows.recordRouteResult({
    workflowId: ensured.workflow.workflowId,
    policy: routing.policy,
    result: await session.receiveAsync(
      createSymphonyCurrentFlowTrackerStateObservedSignal({
        id: "signal_todo_observed",
        occurredAt: "2026-04-11T12:01:00.000Z",
        state: "Todo",
        runId: null,
        runMode: null,
        causationId: null,
        correlationId: null
      })
    )
  });
  await routeWorkflows.recordRouteResult({
    workflowId: ensured.workflow.workflowId,
    policy: routing.policy,
    result: await session.receiveAsync(
      createSymphonyCurrentFlowRunStartedSignal({
        id: "signal_implementation_started",
        occurredAt: "2026-04-11T12:01:10.000Z",
        runId: "run-420",
        runMode: "implementation",
        causationId: null,
        correlationId: null
      })
    )
  });
  await routeWorkflows.recordRouteResult({
    workflowId: ensured.workflow.workflowId,
    policy: routing.policy,
    result: await session.receiveAsync(
      createSymphonyCurrentFlowDeliveryReportedSignal({
        id: "signal_delivery_completed",
        occurredAt: "2026-04-11T12:01:20.000Z",
        runId: "run-420",
        status: "completed",
        causationId: null,
        correlationId: null
      })
    )
  });

  return {
    database,
    issue,
    routeWorkflows,
    runtimePolicy,
    workflowId: ensured.workflow.workflowId
  };
}
