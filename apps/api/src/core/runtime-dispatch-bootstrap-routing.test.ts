import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRouteWorkflowStore,
  createSymphonyIssueStore,
  initializeSymphonyDb
} from "@symphony/db";
import type {
  SymphonyCurrentFlowData,
  SymphonyCurrentFlowNode,
  SymphonyCurrentFlowPolicy
} from "@symphony/router";
import { buildSymphonyRuntimePolicy, buildSymphonyTrackerIssue } from "@symphony/test-support";
import { createMemorySymphonyTracker } from "@symphony/tracker";
import { createRuntimeDispatchBootstrapRouter } from "./runtime-dispatch-bootstrap-routing.js";
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

describe("runtime dispatch bootstrap routing", () => {
  it("routes Todo work into Bootstrapping and selects implementation mode", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      const result = await harness.router.route({
        issue: harness.issue,
        attempt: 1,
        preferredWorkerHost: null,
        startedAt: "2026-04-10T10:00:00.000Z"
      });

      expect(result.issue.state).toBe("Bootstrapping");
      expect(result.runMode).toBe("implementation");
      expect(harness.tracker.listOperations()).toEqual(
        expect.arrayContaining([
          {
            kind: "update_state",
            issueId: harness.issue.id,
            stateName: "Bootstrapping"
          },
          {
            kind: "comment",
            issueId: harness.issue.id,
            body: expect.stringContaining("moved it from `Todo` to `Bootstrapping`")
          }
        ])
      );

      const hydration = await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >(harness.issue.identifier);
      expect(hydration?.snapshot?.projection.currentNode).toBe("bootstrapping");
      expect(hydration?.snapshot?.projection.pendingCommands).toEqual([]);
      expect(hydration?.snapshot?.projection.data.lastDispatchMode).toBe("implementation");
      expect(hydration?.latestDecision?.reasonCode).toBe("todo_claimed_for_dispatch");
    } finally {
      harness.close();
    }
  });

  it("re-dispatches Bootstrapping work after restart using persisted route history", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await harness.router.route({
        issue: harness.issue,
        attempt: 1,
        preferredWorkerHost: null,
        startedAt: "2026-04-10T10:05:00.000Z"
      });

      const bootstrappingIssue = harness.tracker.getIssue(harness.issue.id);
      expect(bootstrappingIssue?.state).toBe("Bootstrapping");

      const result = await harness.router.route({
        issue: bootstrappingIssue!,
        attempt: 2,
        preferredWorkerHost: null,
        startedAt: "2026-04-10T10:06:00.000Z"
      });

      expect(result.issue.state).toBe("Bootstrapping");
      expect(result.runMode).toBe("implementation");

      const hydration = await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >(harness.issue.identifier);
      expect(hydration?.latestDecision?.reasonCode).toBe("bootstrapping_redispatched");
      expect(hydration?.snapshot?.projection.data.lastDispatchMode).toBe("implementation");
    } finally {
      harness.close();
    }
  });

  it("routes Approved work directly into approved_merge mode without a tracker transition", async () => {
    const harness = await createHarness({
      state: "Approved"
    });

    try {
      const result = await harness.router.route({
        issue: harness.issue,
        attempt: 1,
        preferredWorkerHost: null,
        startedAt: "2026-04-10T10:10:00.000Z"
      });

      expect(result.issue.state).toBe("Approved");
      expect(result.runMode).toBe("approved_merge");
      expect(harness.tracker.listOperations()).toEqual([]);

      const hydration = await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >(harness.issue.identifier);
      expect(hydration?.snapshot?.projection.currentNode).toBe("approved_merge");
      expect(hydration?.snapshot?.projection.data.lastDispatchMode).toBe("approved_merge");
      expect(hydration?.latestDecision?.reasonCode).toBe("approved_merge_requested");
    } finally {
      harness.close();
    }
  });
});

async function createHarness(input: {
  state: "Todo" | "Approved";
}) {
  const root = await mkdtemp(path.join(tmpdir(), "symphony-dispatch-bootstrap-router-"));
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
    state: input.state
  });
  const tracker = createMemorySymphonyTracker([issue]);

  await issueStore.upsert({
    issueIdentifier: issue.identifier,
    trackerIssueId: issue.id,
    repositoryKey: "openai/symphony"
  });

  const router = await createRuntimeDispatchBootstrapRouter({
    routeWorkflows,
    tracker,
    trackerConfig: runtimePolicy.tracker,
    repositoryKey: "openai/symphony",
    now: () => new Date("2026-04-10T10:00:00.000Z")
  });

  return {
    issue,
    tracker,
    routeWorkflows,
    router,
    close() {
      database.close();
    }
  };
}
