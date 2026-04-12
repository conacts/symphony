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
import {
  buildSymphonyRuntimePolicy,
  buildSymphonyTrackerIssue
} from "@symphony/test-support";
import { createMemorySymphonyTracker } from "@symphony/tracker";
import { expectRouteWorkflowAuthorityProof } from "../test-support/route-workflow-authority-test-support.js";
import { createRuntimeDispatchBootstrapRouter } from "./runtime-dispatch-bootstrap-routing.js";
import { createRouteWorkflowPort } from "./runtime-route-workflows.js";
import { createRuntimeRunStartActivationRouter } from "./runtime-run-start-activation-routing.js";
import { createRuntimeTrackerStateObservationRouter } from "./runtime-tracker-state-observation-routing.js";
import { createRuntimeCurrentFlowRouting } from "./runtime-workflow-presets.js";
import { createRuntimeWorkflowSessionLoader } from "./runtime-workflow-session-loader.js";

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

describe("runtime tracker state observation routing", () => {
  it("settles active approved-merge redispatch inside workflow history", async () => {
    const harness = await createHarness({
      state: "Approved"
    });

    try {
      await startApprovedMergeRun(harness);
      await harness.tracker.updateIssueState(harness.issue.id, "Approved");

      const result = await harness.observationRouter.observe({
        observationKind: "active",
        issueIdentifier: harness.issue.identifier,
        runId: "run-approved-merge",
        runMode: "approved_merge",
        recordedAt: "2026-04-12T16:05:10.000Z"
      });

      expect(result?.issue.state).toBe("Approved");

      const proof = await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "approved_merge",
        reasonCode: "approved_merge_redispatched",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.trackerState).toBe("Approved");
          expect(data.lastDispatchMode).toBe("approved_merge");
          expect(data.lastRunMode).toBe("approved_merge");
        }
      });

      expect(proof.latestDecision.commands).toEqual([
        expect.objectContaining({
          kind: "run.dispatch"
        })
      ]);
      expect(proof.latestSettlementEvents).toHaveLength(1);
      expect(proof.latestSettlementEvents[0]?.commandId).toBe(
        proof.latestDecision.commands[0]?.id ?? null
      );
      if (proof.latestSettlementEvents[0]?.event.kind !== "command_settled") {
        throw new TypeError("Expected approved-merge redispatch settlement event.");
      }
      expect(proof.latestSettlementEvents[0].event.status).toBe("succeeded");
    } finally {
      harness.close();
    }
  });

  it("fails fast when active observation emits redispatch for a different run mode", async () => {
    const harness = await createHarness({
      state: "Approved"
    });

    try {
      await startApprovedMergeRun(harness);
      await harness.tracker.updateIssueState(harness.issue.id, "Approved");

      await expect(
        harness.observationRouter.observe({
          observationKind: "active",
          issueIdentifier: harness.issue.identifier,
          runId: "run-approved-merge",
          runMode: "implementation",
          recordedAt: "2026-04-12T16:05:10.000Z"
        })
      ).rejects.toThrow(
        /only supports run\.dispatch for active run mode implementation/i
      );
    } finally {
      harness.close();
    }
  });
});

async function createHarness(input: {
  state: "Approved";
}) {
  const root = await mkdtemp(
    path.join(tmpdir(), "symphony-tracker-state-observation-routing-")
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
    state: input.state
  });
  const tracker = createMemorySymphonyTracker([issue]);

  await issueStore.upsert({
    issueIdentifier: issue.identifier,
    trackerIssueId: issue.id,
    repositoryKey: "openai/symphony",
    latestRunStartedAt: null,
    recordedAt: "2026-04-12T16:00:00.000Z"
  });

  const routing = await createRuntimeCurrentFlowRouting({
    trackerConfig: runtimePolicy.tracker,
    now: () => new Date("2026-04-12T16:00:00.000Z")
  });
  const sessionLoader = await createRuntimeWorkflowSessionLoader({
    routeWorkflows,
    trackerConfig: runtimePolicy.tracker,
    now: () => new Date("2026-04-12T16:00:00.000Z")
  });
  const dispatchBootstrapRouter = await createRuntimeDispatchBootstrapRouter({
    routeWorkflows,
    tracker,
    trackerConfig: runtimePolicy.tracker,
    repositoryKey: "openai/symphony",
    routing,
    sessionLoader
  });
  const runStartActivationRouter = await createRuntimeRunStartActivationRouter({
    routeWorkflows,
    tracker,
    sessionLoader
  });
  const observationRouter = await createRuntimeTrackerStateObservationRouter({
    routeWorkflows,
    tracker,
    trackerConfig: runtimePolicy.tracker,
    repositoryKey: "openai/symphony",
    routing,
    sessionLoader
  });

  return {
    issue,
    tracker,
    routeWorkflows,
    dispatchBootstrapRouter,
    runStartActivationRouter,
    observationRouter,
    close() {
      database.close();
    }
  };
}

async function startApprovedMergeRun(
  harness: Awaited<ReturnType<typeof createHarness>>
) {
  await harness.dispatchBootstrapRouter.route({
    issue: harness.issue,
    attempt: 1,
    preferredWorkerHost: null,
    startedAt: "2026-04-12T16:05:00.000Z"
  });

  const approvedIssue = harness.tracker.getIssue(harness.issue.id);
  const activated = await harness.runStartActivationRouter.activate({
    issue: approvedIssue!,
    runId: "run-approved-merge",
    runMode: "approved_merge",
    threadId: "thread-approved-merge",
    workerHost: null,
    launchTarget: null,
    recordedAt: "2026-04-12T16:05:05.000Z"
  });

  return activated.issue;
}
