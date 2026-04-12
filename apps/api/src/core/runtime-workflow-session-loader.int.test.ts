import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRouteWorkflowStore,
  createSymphonyIssueStore,
  initializeSymphonyDb
} from "@symphony/db";
import { buildSymphonyRuntimePolicy, buildSymphonyTrackerIssue } from "@symphony/test-support";
import {
  createRuntimeAutoMergeRouting,
  createRuntimeCurrentFlowRouting
} from "./runtime-workflow-presets.js";
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

describe("runtime workflow session loader", () => {
  it("resumes persisted workflows from stored workflow identity", async () => {
    const harness = await createHarness();

    try {
      const ensured = await harness.routeWorkflows.ensureWorkflowForIssue({
        issueIdentifier: harness.issue.identifier,
        repositoryKey: "openai/symphony",
        routerPresetId: harness.routing.presetId,
        router: harness.routing.router,
        createdAt: "2026-04-10T16:00:00.000Z"
      });

      const loaded = await harness.sessionLoader.resumeByWorkflowId({
        workflowId: ensured.workflow.workflowId
      });

      expect(loaded).not.toBeNull();
      expect(loaded?.routing.presetId).toBe("current-flow");
      expect(loaded?.resumed.hydrationState.workflow.workflowId).toBe(
        ensured.workflow.workflowId
      );
    } finally {
      harness.close();
    }
  });

  it("resumes alternate preset workflows from stored workflow identity", async () => {
    const harness = await createHarness();

    try {
      const routing = await createRuntimeAutoMergeRouting({
        trackerConfig: harness.runtimePolicy.tracker,
        now: () => new Date("2026-04-10T16:02:00.000Z")
      });
      const ensured = await harness.routeWorkflows.ensureWorkflowForIssue({
        issueIdentifier: harness.issue.identifier,
        repositoryKey: "openai/symphony",
        routerPresetId: routing.presetId,
        router: routing.router,
        createdAt: "2026-04-10T16:02:00.000Z"
      });

      const loaded = await harness.sessionLoader.resumeByWorkflowId({
        workflowId: ensured.workflow.workflowId
      });

      expect(loaded).not.toBeNull();
      expect(loaded?.routing.presetId).toBe("auto-merge");
      expect(loaded?.routing.router.definition().name).toBe("symphony-auto-merge-flow");
    } finally {
      harness.close();
    }
  });

  it("fails fast when the stored workflow preset id is not registered", async () => {
    const harness = await createHarness();

    try {
      const ensured = await harness.routeWorkflows.ensureWorkflowForIssue({
        issueIdentifier: harness.issue.identifier,
        repositoryKey: "openai/symphony",
        routerPresetId: harness.routing.presetId,
        router: harness.routing.router,
        createdAt: "2026-04-10T16:05:00.000Z"
      });

      harness.database.client
        .prepare(
          "update route_workflows set router_preset_id = ? where workflow_id = ?"
        )
        .run("missing", ensured.workflow.workflowId);

      await expect(
        harness.sessionLoader.resumeByIssueIdentifier({
          issueIdentifier: harness.issue.identifier
        })
      ).rejects.toThrow(/Unknown workflow router preset/);
    } finally {
      harness.close();
    }
  });

  it("fails fast when the stored workflow router definition no longer matches the preset", async () => {
    const harness = await createHarness();

    try {
      const ensured = await harness.routeWorkflows.ensureWorkflowForIssue({
        issueIdentifier: harness.issue.identifier,
        repositoryKey: "openai/symphony",
        routerPresetId: harness.routing.presetId,
        router: harness.routing.router,
        createdAt: "2026-04-10T16:10:00.000Z"
      });

      harness.database.client
        .prepare(
          "update route_workflows set router_version = ? where workflow_id = ?"
        )
        .run("999", ensured.workflow.workflowId);

      await expect(
        harness.sessionLoader.resumeByIssueIdentifier({
          issueIdentifier: harness.issue.identifier
        })
      ).rejects.toThrow(/bound to router version/);
    } finally {
      harness.close();
    }
  });
});

async function createHarness() {
  const root = await mkdtemp(
    path.join(tmpdir(), "symphony-current-flow-session-loader-")
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

  await issueStore.upsert({
    issueIdentifier: issue.identifier,
    trackerIssueId: issue.id,
    repositoryKey: "openai/symphony",
    latestRunStartedAt: null,
    recordedAt: "2026-04-10T00:11:59.000Z"
  });

  const routing = await createRuntimeCurrentFlowRouting({
    trackerConfig: runtimePolicy.tracker,
    now: () => new Date("2026-04-10T16:00:00.000Z")
  });
  const sessionLoader = await createRuntimeWorkflowSessionLoader({
    routeWorkflows,
    trackerConfig: runtimePolicy.tracker,
    now: () => new Date("2026-04-10T16:00:00.000Z")
  });

  return {
    database,
    issue,
    runtimePolicy,
    routeWorkflows,
    routing,
    sessionLoader,
    close() {
      database.close();
    }
  };
}
