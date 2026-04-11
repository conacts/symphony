import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRouteWorkflowStore,
  createSymphonyIssueStore,
  createSymphonyRuntimeLogStore,
  initializeSymphonyDb
} from "@symphony/db";
import {
  buildSymphonyRuntimePolicy,
  buildSymphonyTrackerIssue
} from "@symphony/test-support";
import {
  createMemorySymphonyTracker,
  type SymphonyTrackerIssue
} from "@symphony/tracker";
import { createRuntimeRouteLifecycleService } from "./runtime-route-lifecycle-service.js";
import { createRouteWorkflowPort } from "./runtime-route-workflows.js";
import { createRuntimeTrackerStateIngressPort } from "./runtime-tracker-state-ingress-port.js";

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

describe("runtime tracker state ingress port", () => {
  it("records observed non-running tracker state changes in runtime logs", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      const dispatchRequests: Array<{
        workflowId: string;
        issueState: string;
        runMode: string;
      }> = [];

      const observedIssues = await harness.ingress.observeNonRunning({
        claimedIssueIds: [],
        recordedAt: "2026-04-10T15:00:00.000Z",
        onDispatchRequested: async (input) => {
          dispatchRequests.push({
            workflowId: input.workflowId,
            issueState: input.issue.state,
            runMode: input.runMode
          });
        }
      });

      expect(observedIssues).toEqual([
        {
          issueIdentifier: harness.issue.identifier,
          trackerState: "Bootstrapping"
        }
      ]);
      expect(dispatchRequests).toEqual([
        {
          workflowId: expect.any(String),
          issueState: "Bootstrapping",
          runMode: "implementation"
        }
      ]);

      const logs = await harness.runtimeLogStore.list();
      expect(logs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: "tracker_state_ingress",
            eventType: "tracker_state_ingress_observed",
            issueIdentifier: harness.issue.identifier,
            payload: expect.objectContaining({
              scope: "non_running_batch",
              trackerState: "Bootstrapping",
              claimedIssueCount: 0
            })
          }),
          expect.objectContaining({
            source: "tracker_state_ingress",
            eventType: "tracker_state_ingress_batch_completed",
            issueIdentifier: null,
            payload: {
              observedCount: 1,
              claimedIssueCount: 0,
              observedIssues: [
                {
                  issueIdentifier: harness.issue.identifier,
                  trackerState: "Bootstrapping"
                }
              ]
            }
          })
        ])
      );
    } finally {
      harness.close();
    }
  });

  it("records failures when explicit tracker observation emits dispatch without a callback", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await advanceWorkflowToReview(harness);
      await harness.tracker.updateIssueState(harness.issue.id, "Rework");

      await expect(
        harness.ingress.observeByIdentifier({
          issueIdentifier: harness.issue.identifier,
          recordedAt: "2026-04-10T15:00:10.000Z"
        })
      ).rejects.toThrow(/run\.dispatch without a dispatch callback/i);

      const logs = await harness.runtimeLogStore.list({
        issueIdentifier: harness.issue.identifier
      });
      expect(logs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            source: "tracker_state_ingress",
            eventType: "tracker_state_ingress_failed",
            issueIdentifier: harness.issue.identifier,
            payload: expect.objectContaining({
              scope: "issue_identifier",
              error: expect.stringContaining(
                "Idle tracker state observation emitted run.dispatch without a dispatch callback."
              )
            })
          })
        ])
      );
    } finally {
      harness.close();
    }
  });
});

async function createHarness(input: {
  state: "Todo";
}) {
  const root = await mkdtemp(path.join(tmpdir(), "symphony-tracker-state-ingress-"));
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
  const runtimeLogStore = createSymphonyRuntimeLogStore(database.db, {
    repositoryKey: "openai/symphony"
  });

  await issueStore.upsert({
    issueIdentifier: issue.identifier,
    trackerIssueId: issue.id,
    repositoryKey: "openai/symphony"
  });

  const routeLifecycle = await createRuntimeRouteLifecycleService({
    routeWorkflows,
    tracker,
    trackerConfig: runtimePolicy.tracker,
    repositoryKey: "openai/symphony",
    now: () => new Date("2026-04-10T15:00:00.000Z")
  });
  const ingress = createRuntimeTrackerStateIngressPort({
    routeLifecycle,
    runtimeLogStore
  });

  return {
    issue,
    ingress,
    routeLifecycle,
    runtimeLogStore,
    tracker,
    close() {
      database.close();
    }
  };
}

async function advanceWorkflowToReview(harness: {
  issue: SymphonyTrackerIssue;
  routeLifecycle: Awaited<ReturnType<typeof createRuntimeRouteLifecycleService>>;
  tracker: ReturnType<typeof createMemorySymphonyTracker>;
}) {
  await harness.routeLifecycle.dispatchBootstrapRouter.route({
    issue: harness.issue,
    attempt: 1,
    preferredWorkerHost: null,
    startedAt: "2026-04-10T15:00:01.000Z"
  });
  const bootstrappingIssue = harness.tracker.getIssue(harness.issue.id);
  await harness.routeLifecycle.runStartActivationRouter.activate({
    issue: bootstrappingIssue!,
    runId: "run-1",
    runMode: "implementation",
    threadId: "thread-1",
    workerHost: null,
    launchTarget: null,
    recordedAt: "2026-04-10T15:00:02.000Z"
  });

  await harness.tracker.updateIssueState(harness.issue.id, "In Review");
  await harness.routeLifecycle.observeActiveIssueStateByIdentifier({
    issueIdentifier: harness.issue.identifier,
    recordedAt: "2026-04-10T15:00:03.000Z"
  });
}
