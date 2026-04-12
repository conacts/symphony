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
  buildSymphonyReworkHandoff,
  buildSymphonyRuntimePolicy,
  buildSymphonyTrackerIssue
} from "@symphony/test-support";
import { createMemorySymphonyTracker } from "@symphony/tracker";
import { expectRouteWorkflowAuthorityProof } from "../test-support/route-workflow-authority-test-support.js";
import {
  createRuntimeCurrentFlowRouting,
  type SymphonyRuntimeRouterPresetId
} from "./runtime-workflow-presets.js";
import { createRuntimeRouteLifecycleService } from "./runtime-route-lifecycle-service.js";
import { createRouteWorkflowPort } from "./runtime-route-workflows.js";
import { createDefaultRuntimeWorkflowPresetSelection } from "./runtime-workflow-preset-selection.js";

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

describe("runtime route lifecycle service", () => {
  it("creates a route workflow on first tracker-state observation", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await harness.tracker.updateIssueState(harness.issue.id, "In Review");

      const observed = await harness.service.observeNonRunningTrackerStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-10T13:59:59.000Z"
      });

      expect(observed).toEqual({
        issueIdentifier: harness.issue.identifier,
        trackerState: "In Review",
        observed: true
      });

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "review",
        reasonCode: "review_observed",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.trackerState).toBe("In Review");
        }
      });
    } finally {
      harness.close();
    }
  });

  it("observes non-running rework state changes through route history and requests dispatch", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await advanceWorkflowToReview(harness);
      await harness.tracker.updateIssueState(harness.issue.id, "Rework");
      const dispatchRequests: Array<{
        workflowId: string;
        issueState: string;
        runMode: string;
      }> = [];

      const observed = await harness.service.observeNonRunningTrackerStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-10T14:00:15.000Z",
        onDispatchRequested: async (input) => {
          dispatchRequests.push({
            workflowId: input.workflowId,
            issueState: input.issue.state,
            runMode: input.runMode
          });
        }
      });

      expect(observed).toEqual({
        issueIdentifier: harness.issue.identifier,
        trackerState: "Bootstrapping",
        observed: true
      });
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Bootstrapping");
      expect(dispatchRequests).toEqual([
        {
          workflowId: expect.any(String),
          issueState: "Bootstrapping",
          runMode: "rework"
        }
      ]);

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "bootstrapping",
        reasonCode: "review_requested_rework",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.trackerState).toBe("Bootstrapping");
          expect(data.lastDispatchMode).toBe("rework");
        }
      });
    } finally {
      harness.close();
    }
  });

  it("routes explicit review rework requests through route history and requests dispatch", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await advanceWorkflowToReview(harness);
      const dispatchRequests: Array<{
        workflowId: string;
        issueState: string;
        runMode: string;
      }> = [];

      const routed = await harness.service.routeReviewReworkRequest({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-10T14:00:17.000Z",
        handoff: buildSymphonyReworkHandoff({
          triggerKind: "changes_requested_review",
          recordedAt: "2026-04-10T14:00:17.000Z"
        }),
        onDispatchRequested: async (input) => {
          dispatchRequests.push({
            workflowId: input.workflowId,
            issueState: input.issue.state,
            runMode: input.runMode
          });
        }
      });

      expect(routed).toBe(true);
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Bootstrapping");
      expect(dispatchRequests).toEqual([
        {
          workflowId: expect.any(String),
          issueState: "Bootstrapping",
          runMode: "rework"
        }
      ]);

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "bootstrapping",
        reasonCode: "review_requested_rework",
        signalType: "review.rework_requested",
        assertData(data) {
          expect(data.trackerState).toBe("Bootstrapping");
          expect(data.lastDispatchMode).toBe("rework");
          expect(data.latestReworkHandoff).toEqual(
            expect.objectContaining({
              triggerKind: "changes_requested_review",
              recordedAt: "2026-04-10T14:00:17.000Z"
            })
          );
        }
      });
    } finally {
      harness.close();
    }
  });

  it("loads current tracker state and latest rework handoff from workflow history", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await advanceWorkflowToReview(harness);

      expect(
        await harness.service.loadCurrentTrackerState({
          issueIdentifier: harness.issue.identifier
        })
      ).toBe("In Review");

      const handoff = buildSymphonyReworkHandoff({
        triggerKind: "changes_requested_review",
        recordedAt: "2026-04-10T14:00:18.000Z"
      });
      await harness.service.routeReviewReworkRequest({
        issueIdentifier: harness.issue.identifier,
        recordedAt: handoff.recordedAt,
        handoff,
        onDispatchRequested: async () => {}
      });

      expect(
        await harness.service.loadCurrentTrackerState({
          issueIdentifier: harness.issue.identifier
        })
      ).toBe("Bootstrapping");
      expect(
        await harness.service.loadLatestReworkHandoff({
          issueIdentifier: harness.issue.identifier
        })
      ).toEqual(handoff);
    } finally {
      harness.close();
    }
  });

  it("returns null for workflow-backed reads when no workflow exists yet", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      expect(
        await harness.service.loadCurrentTrackerState({
          issueIdentifier: harness.issue.identifier
        })
      ).toBeNull();
      expect(
        await harness.service.loadLatestReworkHandoff({
          issueIdentifier: harness.issue.identifier
        })
      ).toBeNull();
      expect(
        await harness.service.loadLatestMergeResult({
          issueIdentifier: harness.issue.identifier,
          runId: "run-1"
        })
      ).toBeNull();
    } finally {
      harness.close();
    }
  });

  it("fails fast when a persisted workflow exists without a readable snapshot", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      const routing = await createRuntimeCurrentFlowRouting({
        trackerConfig: buildSymphonyRuntimePolicy().tracker,
        now: () => new Date("2026-04-10T14:00:00.000Z")
      });
      await harness.routeWorkflows.ensureWorkflowForIssue({
        issueIdentifier: harness.issue.identifier,
        repositoryKey: "openai/symphony",
        routerPresetId: routing.presetId,
        router: routing.router,
        createdAt: "2026-04-10T14:00:00.000Z"
      });

      await expect(
        harness.service.loadCurrentTrackerState({
          issueIdentifier: harness.issue.identifier
        })
      ).rejects.toThrow(/missing a readable projection snapshot/i);
      await expect(
        harness.service.loadLatestReworkHandoff({
          issueIdentifier: harness.issue.identifier
        })
      ).rejects.toThrow(/missing a readable projection snapshot/i);
      await expect(
        harness.service.loadLatestMergeResult({
          issueIdentifier: harness.issue.identifier,
          runId: "run-1"
        })
      ).rejects.toThrow(/missing a readable projection snapshot/i);
    } finally {
      harness.close();
    }
  });

  it("loads latest merge results only for the matching run id", async () => {
    const harness = await createHarness({
      state: "Approved"
    });

    try {
      await advanceWorkflowToRunningApprovedMerge(harness);
      await harness.service.routeMergeResult({
        issueIdentifier: harness.issue.identifier,
        runId: "run-1",
        recordedAt: "2026-04-10T14:12:40.000Z",
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
        await harness.service.loadLatestMergeResult({
          issueIdentifier: harness.issue.identifier,
          runId: "run-1"
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
        await harness.service.loadLatestMergeResult({
          issueIdentifier: harness.issue.identifier,
          runId: "run-2"
        })
      ).toBeNull();
    } finally {
      harness.close();
    }
  });

  it("observes non-running tracker states in batch before dispatch", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      const dispatchRequests: Array<{
        workflowId: string;
        issueState: string;
        runMode: string;
      }> = [];

      const observedIssues = await harness.service.observeNonRunningTrackerStates({
        claimedIssueIds: [],
        recordedAt: "2026-04-10T14:00:12.000Z",
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
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Bootstrapping");
      expect(dispatchRequests).toEqual([
        {
          workflowId: expect.any(String),
          issueState: "Bootstrapping",
          runMode: "implementation"
        }
      ]);

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "bootstrapping",
        reasonCode: "todo_claimed_for_dispatch",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.trackerState).toBe("Bootstrapping");
          expect(data.lastDispatchMode).toBe("implementation");
        }
      });
    } finally {
      harness.close();
    }
  });

  it("skips unchanged non-running tracker states that are already reflected in route history", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await advanceWorkflowToReview(harness);

      const before = await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >(harness.issue.identifier);
      const observedIssues = await harness.service.observeNonRunningTrackerStates({
        claimedIssueIds: [],
        recordedAt: "2026-04-10T14:00:11.000Z",
        onDispatchRequested: async () => {}
      });
      const after = await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >(harness.issue.identifier);

      expect(observedIssues).toEqual([]);
      expect(after?.snapshot?.eventSequence).toBe(before?.snapshot?.eventSequence ?? null);
      expect(after?.snapshot?.projection.currentNode).toBe("review");
      expect(after?.snapshot?.projection.data.trackerState).toBe("In Review");
    } finally {
      harness.close();
    }
  });

  it("skips duplicate explicit non-running observations that are already reflected in route history", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await advanceWorkflowToReview(harness);

      const before = await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >(harness.issue.identifier);
      const observed = await harness.service.observeNonRunningTrackerStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-10T14:00:11.500Z",
        onDispatchRequested: async () => {}
      });
      const after = await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >(harness.issue.identifier);

      expect(observed).toEqual({
        issueIdentifier: harness.issue.identifier,
        trackerState: "In Review",
        observed: false
      });
      expect(after?.snapshot?.eventSequence).toBe(before?.snapshot?.eventSequence ?? null);
      expect(after?.snapshot?.projection.currentNode).toBe("review");
      expect(after?.snapshot?.projection.data.trackerState).toBe("In Review");
    } finally {
      harness.close();
    }
  });

  it("skips claimed issues during non-running tracker observation", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      const observedIssues = await harness.service.observeNonRunningTrackerStates({
        claimedIssueIds: [harness.issue.id],
        recordedAt: "2026-04-10T14:00:12.000Z",
        onDispatchRequested: async () => {}
      });

      expect(observedIssues).toEqual([]);
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Todo");

      const hydration = await harness.routeWorkflows.loadHydrationStateByIssueIdentifier<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >(harness.issue.identifier);
      expect(hydration).toBeNull();
    } finally {
      harness.close();
    }
  });

  it("fails fast when non-running observation emits run.dispatch without a callback", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await advanceWorkflowToReview(harness);
      await harness.tracker.updateIssueState(harness.issue.id, "Rework");

      await expect(
        harness.service.observeNonRunningTrackerStateByIdentifier({
          issueIdentifier: harness.issue.identifier,
          recordedAt: "2026-04-10T14:00:20.000Z"
        })
      ).rejects.toThrow(/run\.dispatch without a dispatch callback/i);

      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Bootstrapping");
    } finally {
      harness.close();
    }
  });

  it("fails fast when review rework routing emits run.dispatch without a callback", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await advanceWorkflowToReview(harness);

      await expect(
        harness.service.routeReviewReworkRequest({
          issueIdentifier: harness.issue.identifier,
          recordedAt: "2026-04-10T14:00:21.000Z",
          handoff: buildSymphonyReworkHandoff({
            triggerKind: "review_comment",
            recordedAt: "2026-04-10T14:00:21.000Z"
          })
        })
      ).rejects.toThrow(/run\.dispatch without a dispatch callback/i);

      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Bootstrapping");
    } finally {
      harness.close();
    }
  });

  it("observes active issue state changes by identifier through route history", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await harness.service.workflowRoutingAdapter.routeDispatchBootstrap({
        issue: harness.issue,
        attempt: 1,
        preferredWorkerHost: null,
        startedAt: "2026-04-10T14:00:00.000Z"
      });
      const bootstrappingIssue = harness.tracker.getIssue(harness.issue.id);
      await harness.service.workflowRoutingAdapter.activateRunStart({
        issue: bootstrappingIssue!,
        runId: "run-1",
        runMode: "implementation",
        threadId: "thread-1",
        workerHost: null,
        launchTarget: null,
        recordedAt: "2026-04-10T14:00:05.000Z"
      });

      await harness.tracker.updateIssueState(harness.issue.id, "In Review");
      const observed = await harness.service.observeActiveIssueStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-10T14:00:10.000Z"
      });

      expect(observed).toBe(true);

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "review",
        reasonCode: "delivery_recorded",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.trackerState).toBe("In Review");
        }
      });
    } finally {
      harness.close();
    }
  });

  it("continues active issue routing after service restart from persisted workflow history", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await harness.service.workflowRoutingAdapter.routeDispatchBootstrap({
        issue: harness.issue,
        attempt: 1,
        preferredWorkerHost: null,
        startedAt: "2026-04-10T14:00:00.000Z"
      });
      const bootstrappingIssue = harness.tracker.getIssue(harness.issue.id);
      await harness.service.workflowRoutingAdapter.activateRunStart({
        issue: bootstrappingIssue!,
        runId: "run-1",
        runMode: "implementation",
        threadId: "thread-1",
        workerHost: null,
        launchTarget: null,
        recordedAt: "2026-04-10T14:00:05.000Z"
      });

      await harness.restartService("2026-04-10T14:00:06.000Z");
      await harness.tracker.updateIssueState(harness.issue.id, "In Review");

      const observed = await harness.service.observeActiveIssueStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-10T14:00:10.000Z"
      });

      expect(observed).toBe(true);

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "review",
        reasonCode: "delivery_recorded",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.trackerState).toBe("In Review");
        }
      });
    } finally {
      harness.close();
    }
  });

  it("continues startup-failure recovery after service restart from persisted failed history", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await advanceWorkflowToFailedStartup(harness);

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "failed",
        reasonCode: "startup_failure",
        signalType: "runtime.startup_failure",
        assertData(data) {
          expect(data.trackerState).toBe("Failed");
          expect(data.lastRuntimeOutcome).toBe("startup_failure");
        }
      });

      await harness.restartService("2026-04-10T14:00:06.000Z");

      expect(
        await harness.service.loadCurrentTrackerState({
          issueIdentifier: harness.issue.identifier
        })
      ).toBe("Failed");

      await harness.tracker.updateIssueState(harness.issue.id, "Todo");
      const dispatchRequests: Array<{
        workflowId: string;
        issueState: string;
        runMode: string;
      }> = [];

      const observed = await harness.service.observeNonRunningTrackerStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-10T14:00:10.000Z",
        onDispatchRequested: async (input) => {
          dispatchRequests.push({
            workflowId: input.workflowId,
            issueState: input.issue.state,
            runMode: input.runMode
          });
        }
      });

      expect(observed).toEqual({
        issueIdentifier: harness.issue.identifier,
        trackerState: "Bootstrapping",
        observed: true
      });
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Bootstrapping");
      expect(dispatchRequests).toEqual([
        {
          workflowId: expect.any(String),
          issueState: "Bootstrapping",
          runMode: "implementation"
        }
      ]);

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "bootstrapping",
        reasonCode: "failed_reopened_from_todo",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.trackerState).toBe("Bootstrapping");
          expect(data.lastDispatchMode).toBe("implementation");
          expect(data.lastRuntimeOutcome).toBe("startup_failure");
        }
      });
    } finally {
      harness.close();
    }
  });

  it("continues bootstrapping redispatch after service restart from persisted bootstrapping history", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      const routed = await advanceWorkflowToBootstrapping(
        harness,
        "2026-04-10T14:00:00.000Z"
      );

      expect(routed.runMode).toBe("implementation");
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Bootstrapping");

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "bootstrapping",
        reasonCode: "todo_claimed_for_dispatch",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.trackerState).toBe("Bootstrapping");
          expect(data.lastDispatchMode).toBe("implementation");
        }
      });

      await harness.restartService("2026-04-10T14:00:07.000Z");

      expect(
        await harness.service.loadCurrentTrackerState({
          issueIdentifier: harness.issue.identifier
        })
      ).toBe("Bootstrapping");

      const dispatchRequests: Array<{
        workflowId: string;
        issueState: string;
        runMode: string;
      }> = [];

      const observed = await harness.service.observeNonRunningTrackerStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-10T14:00:10.000Z",
        onDispatchRequested: async (input) => {
          dispatchRequests.push({
            workflowId: input.workflowId,
            issueState: input.issue.state,
            runMode: input.runMode
          });
        }
      });

      expect(observed).toEqual({
        issueIdentifier: harness.issue.identifier,
        trackerState: "Bootstrapping",
        observed: true
      });
      expect(dispatchRequests).toEqual([
        {
          workflowId: expect.any(String),
          issueState: "Bootstrapping",
          runMode: "implementation"
        }
      ]);

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "bootstrapping",
        reasonCode: "bootstrapping_redispatched",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.trackerState).toBe("Bootstrapping");
          expect(data.lastDispatchMode).toBe("implementation");
        }
      });
    } finally {
      harness.close();
    }
  });

  it("continues approved-merge redispatch after service restart from persisted approved history", async () => {
    const harness = await createHarness({
      state: "Todo",
      presetId: "auto-merge"
    });

    try {
      await advanceWorkflowToAutoApprovedMerge(harness);

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "approved_merge",
        reasonCode: "delivery_reported_auto_approved",
        signalType: "runtime.delivery_reported",
        assertData(data) {
          expect(data.trackerState).toBe("Approved");
          expect(data.lastDispatchMode).toBe("approved_merge");
        }
      });

      await harness.restartService("2026-04-10T14:12:07.000Z");

      expect(
        await harness.service.loadCurrentTrackerState({
          issueIdentifier: harness.issue.identifier
        })
      ).toBe("Approved");

      const dispatchRequests: Array<{
        workflowId: string;
        issueState: string;
        runMode: string;
      }> = [];

      const observed = await harness.service.observeNonRunningTrackerStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-10T14:12:10.000Z",
        onDispatchRequested: async (input) => {
          dispatchRequests.push({
            workflowId: input.workflowId,
            issueState: input.issue.state,
            runMode: input.runMode
          });
        }
      });

      expect(observed).toEqual({
        issueIdentifier: harness.issue.identifier,
        trackerState: "Approved",
        observed: true
      });
      expect(dispatchRequests).toEqual([
        {
          workflowId: expect.any(String),
          issueState: "Approved",
          runMode: "approved_merge"
        }
      ]);

      await expectRouteWorkflowAuthorityProof<
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
        }
      });
    } finally {
      harness.close();
    }
  });

  it("continues paused recovery after service restart from persisted paused history", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await advanceWorkflowToPaused(harness);

      await harness.restartService("2026-04-10T14:12:25.000Z");

      expect(
        await harness.service.loadCurrentTrackerState({
          issueIdentifier: harness.issue.identifier
        })
      ).toBe("Paused");

      await harness.tracker.updateIssueState(harness.issue.id, "Todo");
      const dispatchRequests: Array<{
        workflowId: string;
        issueState: string;
        runMode: string;
      }> = [];

      const observed = await harness.service.observeNonRunningTrackerStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-10T14:12:30.000Z",
        onDispatchRequested: async (input) => {
          dispatchRequests.push({
            workflowId: input.workflowId,
            issueState: input.issue.state,
            runMode: input.runMode
          });
        }
      });

      expect(observed).toEqual({
        issueIdentifier: harness.issue.identifier,
        trackerState: "Bootstrapping",
        observed: true
      });
      expect(dispatchRequests).toEqual([
        {
          workflowId: expect.any(String),
          issueState: "Bootstrapping",
          runMode: "implementation"
        }
      ]);

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "bootstrapping",
        reasonCode: "paused_reopened_from_todo",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.trackerState).toBe("Bootstrapping");
          expect(data.lastDispatchMode).toBe("implementation");
        }
      });
    } finally {
      harness.close();
    }
  });

  it("continues blocked recovery after service restart from persisted blocked history", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await advanceWorkflowToBlocked(harness);

      await harness.restartService("2026-04-10T14:12:15.000Z");

      expect(
        await harness.service.loadCurrentTrackerState({
          issueIdentifier: harness.issue.identifier
        })
      ).toBe("Blocked");

      await harness.tracker.updateIssueState(harness.issue.id, "Todo");
      const dispatchRequests: Array<{
        workflowId: string;
        issueState: string;
        runMode: string;
      }> = [];

      const observed = await harness.service.observeNonRunningTrackerStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-10T14:12:20.000Z",
        onDispatchRequested: async (input) => {
          dispatchRequests.push({
            workflowId: input.workflowId,
            issueState: input.issue.state,
            runMode: input.runMode
          });
        }
      });

      expect(observed).toEqual({
        issueIdentifier: harness.issue.identifier,
        trackerState: "Bootstrapping",
        observed: true
      });
      expect(dispatchRequests).toEqual([
        {
          workflowId: expect.any(String),
          issueState: "Bootstrapping",
          runMode: "implementation"
        }
      ]);

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "bootstrapping",
        reasonCode: "blocked_reopened_from_todo",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.trackerState).toBe("Bootstrapping");
          expect(data.lastDispatchMode).toBe("implementation");
        }
      });
    } finally {
      harness.close();
    }
  });

  it("returns false when no route workflow exists for the issue", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      const observed = await harness.service.observeActiveIssueStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-10T14:05:00.000Z"
      });

      expect(observed).toBe(false);
    } finally {
      harness.close();
    }
  });

  it("returns false when the tracked issue can no longer be loaded", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await harness.service.workflowRoutingAdapter.routeDispatchBootstrap({
        issue: harness.issue,
        attempt: 1,
        preferredWorkerHost: null,
        startedAt: "2026-04-10T14:06:00.000Z"
      });

      const missingTracker = createMemorySymphonyTracker();
      const missingIssueService = await createRuntimeRouteLifecycleService({
        routeWorkflows: harness.routeWorkflows,
        tracker: missingTracker,
        trackerConfig: buildSymphonyRuntimePolicy().tracker,
        repositoryKey: "openai/symphony",
        presetSelection: createDefaultRuntimeWorkflowPresetSelection(),
        now: () => new Date("2026-04-10T14:06:00.000Z")
      });

      const observed = await missingIssueService.observeActiveIssueStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-10T14:06:05.000Z"
      });

      expect(observed).toBe(false);
    } finally {
      harness.close();
    }
  });

  it("routes delivery reports through route history for active implementation runs", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await advanceWorkflowToRunningImplementation(harness);

      const routed = await harness.service.routeDeliveryReport({
        issueIdentifier: harness.issue.identifier,
        runId: "run-1",
        recordedAt: "2026-04-10T14:12:00.000Z",
        status: "completed"
      });

      expect(routed).toBe(true);
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("In Review");

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "review",
        reasonCode: "delivery_reported",
        signalType: "runtime.delivery_reported",
        assertData(data) {
          expect(data.trackerState).toBe("In Review");
        }
      });
    } finally {
      harness.close();
    }
  });

  it("auto-merge delivery reports can approve and dispatch merge work through the same host seam", async () => {
    const harness = await createHarness({
      state: "Todo",
      presetId: "auto-merge"
    });

    try {
      await advanceWorkflowToRunningImplementation(harness);
      const dispatchRequests: Array<{
        workflowId: string;
        issueState: string;
        runMode: string;
      }> = [];

      const routed = await harness.service.routeDeliveryReport({
        issueIdentifier: harness.issue.identifier,
        runId: "run-1",
        recordedAt: "2026-04-10T14:12:05.000Z",
        status: "completed",
        onDispatchRequested: async (input) => {
          dispatchRequests.push({
            workflowId: input.workflowId,
            issueState: input.issue.state,
            runMode: input.runMode
          });
        }
      });

      expect(routed).toBe(true);
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Approved");
      expect(dispatchRequests).toEqual([
        {
          workflowId: expect.any(String),
          issueState: "Approved",
          runMode: "approved_merge"
        }
      ]);

      const proof = await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "approved_merge",
        reasonCode: "delivery_reported_auto_approved",
        signalType: "runtime.delivery_reported",
        assertData(data) {
          expect(data.trackerState).toBe("Approved");
        }
      });
      expect(proof.hydration.workflow.routerPresetId).toBe("auto-merge");
      expect(proof.hydration.workflow.routerName).toBe("symphony-auto-merge-flow");
    } finally {
      harness.close();
    }
  });

  it("routes blocked delivery reports through route history for active implementation runs", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await advanceWorkflowToRunningImplementation(harness);

      const routed = await harness.service.routeDeliveryReport({
        issueIdentifier: harness.issue.identifier,
        runId: "run-1",
        recordedAt: "2026-04-10T14:12:10.000Z",
        status: "blocked"
      });

      expect(routed).toBe(true);
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Blocked");

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "blocked",
        reasonCode: "implementation_delivery_blocked",
        signalType: "runtime.delivery_reported",
        assertData(data) {
          expect(data.trackerState).toBe("Blocked");
        }
      });
    } finally {
      harness.close();
    }
  });

  it("routes spike-result state requests into Paused through route history", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await advanceWorkflowToRunningImplementation(harness);

      const routed = await harness.service.routeRuntimeStateRequest({
        issueIdentifier: harness.issue.identifier,
        runId: "run-1",
        recordedAt: "2026-04-10T14:12:20.000Z",
        requestKind: "spike_result",
        targetState: "Paused"
      });

      expect(routed).toBe(true);
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Paused");

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "paused",
        reasonCode: "implementation_state_requested_paused",
        signalType: "runtime.state_requested",
        assertData(data) {
          expect(data.trackerState).toBe("Paused");
        }
      });
    } finally {
      harness.close();
    }
  });

  it("routes cancel state requests into Canceled through route history", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await advanceWorkflowToRunningImplementation(harness);

      const routed = await harness.service.routeRuntimeStateRequest({
        issueIdentifier: harness.issue.identifier,
        runId: "run-1",
        recordedAt: "2026-04-10T14:12:30.000Z",
        requestKind: "cancel",
        targetState: "Canceled"
      });

      expect(routed).toBe(true);
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Canceled");

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "canceled",
        reasonCode: "implementation_state_requested_canceled",
        signalType: "runtime.state_requested",
        assertData(data) {
          expect(data.trackerState).toBe("Canceled");
        }
      });
    } finally {
      harness.close();
    }
  });

  it("routes merged merge results into Done through route history", async () => {
    const harness = await createHarness({
      state: "Approved"
    });

    try {
      await advanceWorkflowToRunningApprovedMerge(harness);

      const routed = await harness.service.routeMergeResult({
        issueIdentifier: harness.issue.identifier,
        runId: "run-1",
        recordedAt: "2026-04-10T14:12:40.000Z",
        mergeResult: {
          status: "merged",
          summary: "Merged the PR after syncing with main.",
          prUrl: "https://github.com/openai/symphony/pull/123",
          mergeCommitSha: "abc123",
          blockingReason: null,
          testsSummary: "pnpm test"
        }
      });

      expect(routed).toBe(true);
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Done");

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "done",
        reasonCode: "merge_result_reported",
        signalType: "runtime.merge_result_reported",
        assertData(data) {
          expect(data.trackerState).toBe("Done");
          expect(data.latestMergeResult).toEqual({
            runId: "run-1",
            status: "merged",
            summary: "Merged the PR after syncing with main.",
            prUrl: "https://github.com/openai/symphony/pull/123",
            mergeCommitSha: "abc123",
            blockingReason: null,
            testsSummary: "pnpm test",
            recordedAt: "2026-04-10T14:12:40.000Z"
          });
        }
      });
    } finally {
      harness.close();
    }
  });

  it("continues review rework routing after service restart from persisted review history", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await advanceWorkflowToReview(harness);
      await harness.restartService("2026-04-10T14:12:55.000Z");

      const dispatchRequests: Array<{
        workflowId: string;
        issueState: string;
        runMode: string;
      }> = [];

      const routed = await harness.service.routeReviewReworkRequest({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-10T14:13:00.000Z",
        handoff: buildSymphonyReworkHandoff({
          triggerKind: "changes_requested_review",
          recordedAt: "2026-04-10T14:13:00.000Z"
        }),
        onDispatchRequested: async (input) => {
          dispatchRequests.push({
            workflowId: input.workflowId,
            issueState: input.issue.state,
            runMode: input.runMode
          });
        }
      });

      expect(routed).toBe(true);
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Bootstrapping");
      expect(dispatchRequests).toEqual([
        {
          workflowId: expect.any(String),
          issueState: "Bootstrapping",
          runMode: "rework"
        }
      ]);

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "bootstrapping",
        reasonCode: "review_requested_rework",
        signalType: "review.rework_requested",
        assertData(data) {
          expect(data.trackerState).toBe("Bootstrapping");
          expect(data.lastDispatchMode).toBe("rework");
          expect(data.latestReworkHandoff).toEqual(
            expect.objectContaining({
              triggerKind: "changes_requested_review",
              recordedAt: "2026-04-10T14:13:00.000Z"
            })
          );
        }
      });
    } finally {
      harness.close();
    }
  });

  it("routes blocked merge results into Blocked through route history", async () => {
    const harness = await createHarness({
      state: "Approved"
    });

    try {
      await advanceWorkflowToRunningApprovedMerge(harness);

      const routed = await harness.service.routeMergeResult({
        issueIdentifier: harness.issue.identifier,
        runId: "run-1",
        recordedAt: "2026-04-10T14:12:50.000Z",
        mergeResult: {
          status: "blocked",
          summary: "Merge blocked after main introduced conflicts.",
          prUrl: "https://github.com/openai/symphony/pull/123",
          mergeCommitSha: null,
          blockingReason: "Conflicts in packages/workspace/src/docker-client.ts",
          testsSummary: "pnpm test --filter @symphony/workspace"
        }
      });

      expect(routed).toBe(true);
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Blocked");

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "blocked",
        reasonCode: "merge_result_blocked_reported",
        signalType: "runtime.merge_result_reported",
        assertData(data) {
          expect(data.trackerState).toBe("Blocked");
          expect(data.latestMergeResult).toEqual({
            runId: "run-1",
            status: "blocked",
            summary: "Merge blocked after main introduced conflicts.",
            prUrl: "https://github.com/openai/symphony/pull/123",
            mergeCommitSha: null,
            blockingReason: "Conflicts in packages/workspace/src/docker-client.ts",
            testsSummary: "pnpm test --filter @symphony/workspace",
            recordedAt: "2026-04-10T14:12:50.000Z"
          });
        }
      });
    } finally {
      harness.close();
    }
  });

  it("fails fast when a persisted workflow has no active run mode", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      const routing = await createRuntimeCurrentFlowRouting({
        trackerConfig: buildSymphonyRuntimePolicy().tracker,
        now: () => new Date("2026-04-10T14:10:00.000Z")
      });

      await harness.routeWorkflows.ensureWorkflowForIssue({
        issueIdentifier: harness.issue.identifier,
        repositoryKey: "openai/symphony",
        routerPresetId: routing.presetId,
        router: routing.router,
        createdAt: "2026-04-10T14:10:00.000Z"
      });

      await expect(
        harness.service.observeActiveIssueStateByIdentifier({
          issueIdentifier: harness.issue.identifier,
          recordedAt: "2026-04-10T14:10:05.000Z"
        })
      ).rejects.toThrow(/missing an active run mode/i);
    } finally {
      harness.close();
    }
  });

  it("routes shutdown pauses through route history for active runs", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await harness.service.workflowRoutingAdapter.routeDispatchBootstrap({
        issue: harness.issue,
        attempt: 1,
        preferredWorkerHost: null,
        startedAt: "2026-04-10T14:20:00.000Z"
      });
      const bootstrappingIssue = harness.tracker.getIssue(harness.issue.id);
      await harness.service.workflowRoutingAdapter.activateRunStart({
        issue: bootstrappingIssue!,
        runId: "run-1",
        runMode: "implementation",
        threadId: "thread-1",
        workerHost: null,
        launchTarget: null,
        recordedAt: "2026-04-10T14:20:05.000Z"
      });

      const routed = await harness.service.routeShutdownPause({
        issueIdentifier: harness.issue.identifier,
        runId: "run-1",
        runMode: "implementation",
        recordedAt: "2026-04-10T14:20:10.000Z",
        reason: "runtime_shutdown"
      });

      expect(routed).toBe(true);
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Paused");

      await expectRouteWorkflowAuthorityProof<
        SymphonyCurrentFlowNode,
        SymphonyCurrentFlowData,
        SymphonyCurrentFlowPolicy
      >({
        routeWorkflows: harness.routeWorkflows,
        issueIdentifier: harness.issue.identifier,
        currentNode: "paused",
        reasonCode: "implementation_shutdown_paused",
        signalType: "runtime.shutdown_requested",
        assertData(data) {
          expect(data.trackerState).toBe("Paused");
        }
      });
    } finally {
      harness.close();
    }
  });

  it("fails fast when current-flow tracker state contracts do not match the router", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      const trackerConfig = {
        ...buildSymphonyRuntimePolicy().tracker,
        startupFailureTransitionToState: "Startup Failed"
      };

      await expect(
        createRuntimeRouteLifecycleService({
          routeWorkflows: harness.routeWorkflows,
          tracker: harness.tracker,
          trackerConfig,
          repositoryKey: "openai/symphony",
          presetSelection: createDefaultRuntimeWorkflowPresetSelection(),
          now: () => new Date("2026-04-10T14:25:00.000Z")
        })
      ).rejects.toThrow(/startupFailureTransitionToState/i);
    } finally {
      harness.close();
    }
  });

  it("fails fast when current-flow terminal state contracts do not match the router", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      const trackerConfig = {
        ...buildSymphonyRuntimePolicy().tracker,
        terminalStates: ["Done"]
      };

      await expect(
        createRuntimeRouteLifecycleService({
          routeWorkflows: harness.routeWorkflows,
          tracker: harness.tracker,
          trackerConfig,
          repositoryKey: "openai/symphony",
          presetSelection: createDefaultRuntimeWorkflowPresetSelection(),
          now: () => new Date("2026-04-10T14:26:00.000Z")
        })
      ).rejects.toThrow(/terminalStates/i);
    } finally {
      harness.close();
    }
  });
});

async function createHarness(input: {
  state: "Todo" | "Approved";
  presetId?: SymphonyRuntimeRouterPresetId;
}) {
  const root = await mkdtemp(path.join(tmpdir(), "symphony-route-lifecycle-service-"));
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
    recordedAt: "2026-04-10T00:32:59.000Z"
  });

  async function buildService(nowIso: string) {
    return await createRuntimeRouteLifecycleService({
      routeWorkflows,
      tracker,
      trackerConfig: runtimePolicy.tracker,
      repositoryKey: "openai/symphony",
      presetSelection: {
        ...createDefaultRuntimeWorkflowPresetSelection(),
        presetId: input.presetId ?? "current-flow"
      },
      now: () => new Date(nowIso)
    });
  }

  let service = await buildService("2026-04-10T14:00:00.000Z");

  return {
    issue,
    tracker,
    routeWorkflows,
    get service() {
      return service;
    },
    async restartService(nowIso: string) {
      service = await buildService(nowIso);
      return service;
    },
    close() {
      database.close();
    }
  };
}

async function advanceWorkflowToReview(harness: Awaited<ReturnType<typeof createHarness>>) {
  await advanceWorkflowToBootstrapping(
    harness,
    "2026-04-10T14:00:00.000Z"
  );
  const bootstrappingIssue = harness.tracker.getIssue(harness.issue.id);
  await harness.service.workflowRoutingAdapter.activateRunStart({
    issue: bootstrappingIssue!,
    runId: "run-1",
    runMode: "implementation",
    threadId: "thread-1",
    workerHost: null,
    launchTarget: null,
    recordedAt: "2026-04-10T14:00:05.000Z"
  });

  await harness.tracker.updateIssueState(harness.issue.id, "In Review");
  await harness.service.observeActiveIssueStateByIdentifier({
    issueIdentifier: harness.issue.identifier,
    recordedAt: "2026-04-10T14:00:10.000Z"
  });
}

async function advanceWorkflowToRunningImplementation(
  harness: Awaited<ReturnType<typeof createHarness>>
) {
  await advanceWorkflowToBootstrapping(
    harness,
    "2026-04-10T14:11:00.000Z"
  );
  const bootstrappingIssue = harness.tracker.getIssue(harness.issue.id);
  await harness.service.workflowRoutingAdapter.activateRunStart({
    issue: bootstrappingIssue!,
    runId: "run-1",
    runMode: "implementation",
    threadId: "thread-1",
    workerHost: null,
    launchTarget: null,
    recordedAt: "2026-04-10T14:11:05.000Z"
  });
}

async function advanceWorkflowToBootstrapping(
  harness: Awaited<ReturnType<typeof createHarness>>,
  startedAt: string
) {
  return await harness.service.workflowRoutingAdapter.routeDispatchBootstrap({
    issue: harness.issue,
    attempt: 1,
    preferredWorkerHost: null,
    startedAt
  });
}

async function advanceWorkflowToFailedStartup(
  harness: Awaited<ReturnType<typeof createHarness>>
) {
  await advanceWorkflowToBootstrapping(
    harness,
    "2026-04-10T14:00:00.000Z"
  );
  const bootstrappingIssue = harness.tracker.getIssue(harness.issue.id);
  await harness.service.workflowRoutingAdapter.routeRunCompletion({
    issue: bootstrappingIssue!,
    runId: "run-1",
    runMode: "implementation",
    completion: {
      kind: "startup_failure",
      reason: "activation failed",
      failureStage: "runtime_session_start",
      failureOrigin: "workspace_lifecycle"
    },
    recordedAt: "2026-04-10T14:00:05.000Z"
  });
}

async function advanceWorkflowToBlocked(
  harness: Awaited<ReturnType<typeof createHarness>>
) {
  await advanceWorkflowToRunningImplementation(harness);
  await harness.service.routeDeliveryReport({
    issueIdentifier: harness.issue.identifier,
    runId: "run-1",
    recordedAt: "2026-04-10T14:12:10.000Z",
    status: "blocked"
  });
}

async function advanceWorkflowToPaused(
  harness: Awaited<ReturnType<typeof createHarness>>
) {
  await advanceWorkflowToRunningImplementation(harness);
  await harness.service.routeRuntimeStateRequest({
    issueIdentifier: harness.issue.identifier,
    runId: "run-1",
    recordedAt: "2026-04-10T14:12:20.000Z",
    requestKind: "spike_result",
    targetState: "Paused"
  });
}

async function advanceWorkflowToAutoApprovedMerge(
  harness: Awaited<ReturnType<typeof createHarness>>
) {
  await advanceWorkflowToRunningImplementation(harness);
  await harness.service.routeDeliveryReport({
    issueIdentifier: harness.issue.identifier,
    runId: "run-1",
    recordedAt: "2026-04-10T14:12:05.000Z",
    status: "completed",
    onDispatchRequested: async () => {}
  });
}

async function advanceWorkflowToRunningApprovedMerge(
  harness: Awaited<ReturnType<typeof createHarness>>
) {
  await advanceWorkflowToBootstrapping(
    harness,
    "2026-04-10T14:12:00.000Z"
  );
  const approvedIssue = harness.tracker.getIssue(harness.issue.id);
  await harness.service.workflowRoutingAdapter.activateRunStart({
    issue: approvedIssue!,
    runId: "run-1",
    runMode: "approved_merge",
    threadId: "thread-1",
    workerHost: null,
    launchTarget: null,
    recordedAt: "2026-04-10T14:12:05.000Z"
  });
}
