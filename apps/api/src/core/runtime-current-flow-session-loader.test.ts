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
import { createRuntimeCurrentFlowRouting } from "./runtime-workflow-presets.js";
import { createRuntimeCurrentFlowSessionLoader } from "./runtime-current-flow-session-loader.js";
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

describe("runtime current-flow session loader", () => {
  it("resumes persisted current-flow workflows from stored workflow identity", async () => {
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
    repositoryKey: "openai/symphony"
  });

  const routing = await createRuntimeCurrentFlowRouting({
    trackerConfig: runtimePolicy.tracker,
    now: () => new Date("2026-04-10T16:00:00.000Z")
  });
  const sessionLoader = await createRuntimeCurrentFlowSessionLoader({
    routeWorkflows,
    trackerConfig: runtimePolicy.tracker,
    now: () => new Date("2026-04-10T16:00:00.000Z")
  });

  return {
    database,
    issue,
    routeWorkflows,
    routing,
    sessionLoader,
    close() {
      database.close();
    }
  };
}
