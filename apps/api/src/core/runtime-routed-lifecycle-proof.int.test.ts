import { afterEach, describe, expect, it } from "vitest";
import type {
  SymphonyCurrentFlowData,
  SymphonyCurrentFlowNode,
  SymphonyCurrentFlowPolicy
} from "@symphony/router";
import { expectRouteWorkflowAuthorityProof } from "../test-support/route-workflow-authority-test-support.js";
import { RuntimeRoutedLifecycleProofHarness } from "../test-support/runtime-routed-lifecycle-proof-harness.js";

const harnesses: RuntimeRoutedLifecycleProofHarness[] = [];
const runtimeRoutedLifecycleProofTimeoutMs = 20_000;

type CurrentFlowAuthorityExpectation = {
  currentNode: SymphonyCurrentFlowNode;
  reasonCode?: string;
  signalType?: string;
  pendingCommandIds?: string[];
  settlementStatuses?: Record<string, "succeeded" | "failed">;
  assertData?(data: SymphonyCurrentFlowData): void;
};

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.cleanup()));
});

describe("runtime routed lifecycle proof", () => {
  it(
    "proves the full review, rework, approval, and merge lifecycle across restarts",
    async () => {
      const harness = await RuntimeRoutedLifecycleProofHarness.create({
        issueId: "issue-routed-lifecycle-proof",
        issueIdentifier: "SYM-ROUTED-LIFECYCLE",
        trackerState: "Todo"
      });
      harnesses.push(harness);

      const firstObservation = await harness.observeNonRunningIssue();
      expect(firstObservation).toEqual(
        expect.objectContaining({
          issueIdentifier: harness.issueIdentifier,
          observedTrackerState: "Todo",
          workflowTrackerState: "Bootstrapping",
          observed: true,
          recordedAt: expect.any(String)
        })
      );
      expectQueuedDispatch(harness, {
        runMode: "implementation",
        issueState: "Bootstrapping"
      });

      await expectCurrentFlowAuthority(harness, {
        currentNode: "bootstrapping",
        reasonCode: "todo_claimed_for_dispatch",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.trackerState).toBe("Bootstrapping");
          expect(data.lastDispatchMode).toBe("implementation");
        }
      });
      expect((await harness.loadLifecycleView()).trackerState).toBe("Bootstrapping");

      await harness.restart({
        trackerState: "Bootstrapping"
      });

      const redispatchedBootstrappingObservation =
        await harness.observeNonRunningIssue();
      expect(redispatchedBootstrappingObservation).toEqual(
        expect.objectContaining({
          issueIdentifier: harness.issueIdentifier,
          observedTrackerState: "Bootstrapping",
          workflowTrackerState: "Bootstrapping",
          observed: true,
          recordedAt: expect.any(String)
        })
      );
      expectQueuedDispatch(harness, {
        runMode: "implementation",
        issueState: "Bootstrapping"
      });

      await expectCurrentFlowAuthority(harness, {
        currentNode: "bootstrapping",
        reasonCode: "bootstrapping_redispatched",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.trackerState).toBe("Bootstrapping");
          expect(data.lastDispatchMode).toBe("implementation");
        }
      });

      const implementationIssue = await harness.activateNextDispatch({
        runId: "run-implementation-proof-1",
        recordedAt: "2026-04-12T10:00:05.000Z"
      });
      expect(implementationIssue.state).toBe("In Progress");

      await expectCurrentFlowAuthority(harness, {
        currentNode: "implementation",
        reasonCode: "implementation_run_started",
        signalType: "runtime.run_started",
        assertData(data) {
          expect(data.trackerState).toBe("In Progress");
          expect(data.lastRunMode).toBe("implementation");
        }
      });
      expect((await harness.loadLifecycleView()).trackerState).toBe("In Progress");

      const implementationDelivery = await harness.recordDeliveryReport({
        runId: "run-implementation-proof-1",
        summary: "Implementation delivery is ready for review.",
        prUrl: "https://github.com/openai/symphony/pull/101",
        testsSummary: "pnpm --filter @symphony/api test"
      });
      expect(implementationDelivery.success).toBe(true);

      const reviewProof = await expectCurrentFlowAuthority(harness, {
        currentNode: "review",
        reasonCode: "delivery_reported",
        signalType: "runtime.delivery_reported",
        assertData(data) {
          expect(data.trackerState).toBe("In Review");
          expect(data.lastRunMode).toBe("implementation");
        }
      });
      expect((await harness.loadLifecycleView()).trackerState).toBe("In Review");

      await harness.restart({
        trackerState: "In Review"
      });

      const reviewObservation = await harness.observeNonRunningIssue();
      expect(reviewObservation).toEqual(
        expect.objectContaining({
          issueIdentifier: harness.issueIdentifier,
          observedTrackerState: "In Review",
          workflowTrackerState: "In Review",
          observed: false,
          recordedAt: expect.any(String)
        })
      );
      expect(harness.queuedDispatches()).toHaveLength(0);

      const reviewProofAfterRestart = await expectCurrentFlowAuthority(harness, {
        currentNode: "review",
        reasonCode: "delivery_reported",
        signalType: "runtime.delivery_reported",
        assertData(data) {
          expect(data.trackerState).toBe("In Review");
        }
      });
      expect(reviewProofAfterRestart.snapshot.eventSequence).toBe(
        reviewProof.snapshot.eventSequence
      );

      await harness.setTrackerState("Rework");

      const reworkObservation = await harness.observeNonRunningIssue();
      expect(reworkObservation).toEqual(
        expect.objectContaining({
          issueIdentifier: harness.issueIdentifier,
          observedTrackerState: "Rework",
          workflowTrackerState: "Bootstrapping",
          observed: true,
          recordedAt: expect.any(String)
        })
      );
      expectQueuedDispatch(harness, {
        runMode: "rework",
        issueState: "Bootstrapping"
      });

      await expectCurrentFlowAuthority(harness, {
        currentNode: "bootstrapping",
        reasonCode: "review_requested_rework",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.trackerState).toBe("Bootstrapping");
          expect(data.lastDispatchMode).toBe("rework");
        }
      });

      await harness.restart({
        trackerState: "Bootstrapping"
      });

      const reworkRedispatchObservation = await harness.observeNonRunningIssue();
      expect(reworkRedispatchObservation).toEqual(
        expect.objectContaining({
          issueIdentifier: harness.issueIdentifier,
          observedTrackerState: "Bootstrapping",
          workflowTrackerState: "Bootstrapping",
          observed: true,
          recordedAt: expect.any(String)
        })
      );
      expectQueuedDispatch(harness, {
        runMode: "rework",
        issueState: "Bootstrapping"
      });

      await expectCurrentFlowAuthority(harness, {
        currentNode: "bootstrapping",
        reasonCode: "bootstrapping_redispatched",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.trackerState).toBe("Bootstrapping");
          expect(data.lastDispatchMode).toBe("rework");
        }
      });

      const reworkIssue = await harness.activateNextDispatch({
        runId: "run-rework-proof-1",
        recordedAt: "2026-04-12T10:10:05.000Z"
      });
      expect(reworkIssue.state).toBe("In Progress");

      await expectCurrentFlowAuthority(harness, {
        currentNode: "rework",
        reasonCode: "rework_run_started",
        signalType: "runtime.run_started",
        assertData(data) {
          expect(data.trackerState).toBe("In Progress");
          expect(data.lastRunMode).toBe("rework");
        }
      });

      const reworkDelivery = await harness.recordDeliveryReport({
        runId: "run-rework-proof-1",
        summary: "Rework delivery is ready for review.",
        prUrl: "https://github.com/openai/symphony/pull/102",
        testsSummary: "pnpm --filter @symphony/api test"
      });
      expect(reworkDelivery.success).toBe(true);

      await expectCurrentFlowAuthority(harness, {
        currentNode: "review",
        reasonCode: "rework_delivery_reported",
        signalType: "runtime.delivery_reported",
        assertData(data) {
          expect(data.trackerState).toBe("In Review");
          expect(data.lastRunMode).toBe("rework");
        }
      });
      expect((await harness.loadLifecycleView()).trackerState).toBe("In Review");

      await harness.setTrackerState("Approved");

      const approvedObservation = await harness.observeNonRunningIssue();
      expect(approvedObservation).toEqual(
        expect.objectContaining({
          issueIdentifier: harness.issueIdentifier,
          observedTrackerState: "Approved",
          workflowTrackerState: "Approved",
          observed: true,
          recordedAt: expect.any(String)
        })
      );
      expectQueuedDispatch(harness, {
        runMode: "approved_merge",
        issueState: "Approved"
      });

      await expectCurrentFlowAuthority(harness, {
        currentNode: "approved_merge",
        reasonCode: "review_approved_for_merge",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.trackerState).toBe("Approved");
          expect(data.lastDispatchMode).toBe("approved_merge");
        }
      });
      expect((await harness.loadLifecycleView()).trackerState).toBe("Approved");

      await harness.restart({
        trackerState: "Approved"
      });

      const approvedRedispatchObservation = await harness.observeNonRunningIssue();
      expect(approvedRedispatchObservation).toEqual(
        expect.objectContaining({
          issueIdentifier: harness.issueIdentifier,
          observedTrackerState: "Approved",
          workflowTrackerState: "Approved",
          observed: true,
          recordedAt: expect.any(String)
        })
      );
      expectQueuedDispatch(harness, {
        runMode: "approved_merge",
        issueState: "Approved"
      });

      await expectCurrentFlowAuthority(harness, {
        currentNode: "approved_merge",
        reasonCode: "approved_merge_redispatched",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.trackerState).toBe("Approved");
          expect(data.lastDispatchMode).toBe("approved_merge");
        }
      });

      const approvedMergeIssue = await harness.activateNextDispatch({
        runId: "run-approved-merge-proof-1",
        recordedAt: "2026-04-12T10:20:05.000Z"
      });
      expect(approvedMergeIssue.state).toBe("In Progress");

      await expectCurrentFlowAuthority(harness, {
        currentNode: "approved_merge",
        reasonCode: "approved_merge_started",
        signalType: "runtime.run_started",
        assertData(data) {
          expect(data.trackerState).toBe("In Progress");
          expect(data.lastRunMode).toBe("approved_merge");
        }
      });
      expect((await harness.loadLifecycleView()).trackerState).toBe("In Progress");

      const mergeResult = await harness.submitMergeResult({
        runId: "run-approved-merge-proof-1",
        status: "merged",
        summary: "Approved merge completed successfully.",
        prUrl: "https://github.com/openai/symphony/pull/102",
        mergeCommitSha: "abc123def456",
        testsSummary: "pnpm --filter @symphony/api test"
      });
      expect(mergeResult.success).toBe(true);

      await expectCurrentFlowAuthority(harness, {
        currentNode: "done",
        reasonCode: "merge_result_reported",
        signalType: "runtime.merge_result_reported",
        assertData(data) {
          expect(data.trackerState).toBe("Done");
          expect(data.latestMergeResult).toEqual(
            expect.objectContaining({
              runId: "run-approved-merge-proof-1",
              status: "merged",
              summary: "Approved merge completed successfully.",
              prUrl: "https://github.com/openai/symphony/pull/102",
              mergeCommitSha: "abc123def456",
              testsSummary: "pnpm --filter @symphony/api test",
              recordedAt: expect.any(String)
            })
          );
        }
      });
      expect((await harness.loadLifecycleView()).trackerState).toBe("Done");
    },
    runtimeRoutedLifecycleProofTimeoutMs
  );

  it(
    "reopens a paused workflow after restart and resumes routed implementation",
    async () => {
      const harness = await RuntimeRoutedLifecycleProofHarness.create({
        issueId: "issue-routed-paused-proof",
        issueIdentifier: "SYM-ROUTED-PAUSED",
        trackerState: "Todo"
      });
      harnesses.push(harness);

      await harness.observeNonRunningIssue();
      await harness.activateNextDispatch({
        runId: "run-paused-proof-1",
        recordedAt: "2026-04-12T11:00:05.000Z"
      });

      const spikeResult = await harness.submitSpikeResult({
        runId: "run-paused-proof-1",
        summary: "Paused for explicit follow-up.",
        details: "Waiting on an internal design clarification.",
        targetState: "Paused"
      });
      expect(spikeResult.success).toBe(true);

      await expectCurrentFlowAuthority(harness, {
        currentNode: "paused",
        reasonCode: "implementation_state_requested_paused",
        signalType: "runtime.state_requested",
        assertData(data) {
          expect(data.trackerState).toBe("Paused");
          expect(data.lastDispatchMode).toBe("implementation");
        }
      });
      expect((await harness.loadLifecycleView()).trackerState).toBe("Paused");

      await harness.restart({
        trackerState: "Todo"
      });

      const reopenedObservation = await harness.observeNonRunningIssue();
      expect(reopenedObservation).toEqual(
        expect.objectContaining({
          issueIdentifier: harness.issueIdentifier,
          observedTrackerState: "Todo",
          workflowTrackerState: "Bootstrapping",
          observed: true,
          recordedAt: expect.any(String)
        })
      );
      expectQueuedDispatch(harness, {
        runMode: "implementation",
        issueState: "Bootstrapping"
      });

      await expectCurrentFlowAuthority(harness, {
        currentNode: "bootstrapping",
        reasonCode: "paused_reopened_from_todo",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.trackerState).toBe("Bootstrapping");
          expect(data.lastDispatchMode).toBe("implementation");
        }
      });

      await harness.activateNextDispatch({
        runId: "run-paused-proof-2",
        recordedAt: "2026-04-12T11:10:05.000Z"
      });

      await expectCurrentFlowAuthority(harness, {
        currentNode: "implementation",
        reasonCode: "implementation_run_started",
        signalType: "runtime.run_started",
        assertData(data) {
          expect(data.trackerState).toBe("In Progress");
          expect(data.lastRunMode).toBe("implementation");
        }
      });
    },
    runtimeRoutedLifecycleProofTimeoutMs
  );

  it(
    "reopens a restarted implementation run from observed review state through workflow history",
    async () => {
      const harness = await RuntimeRoutedLifecycleProofHarness.create({
        issueId: "issue-routed-active-review-proof",
        issueIdentifier: "SYM-ROUTED-ACTIVE-REVIEW",
        trackerState: "Todo"
      });
      harnesses.push(harness);

      await harness.observeNonRunningIssue();
      await harness.activateNextDispatch({
        runId: "run-active-review-proof-1",
        recordedAt: "2026-04-12T11:15:05.000Z"
      });

      await harness.restart({
        trackerState: "In Progress"
      });
      await harness.setTrackerState("In Review");

      const observed = await harness.observeActiveIssueState({
        recordedAt: "2026-04-12T11:15:10.000Z"
      });
      expect(observed).toBe(true);
      expect(harness.queuedDispatches()).toHaveLength(0);

      await expectCurrentFlowAuthority(harness, {
        currentNode: "review",
        reasonCode: "paused_reopened_from_review",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.trackerState).toBe("In Review");
          expect(data.lastDispatchMode).toBe("implementation");
          expect(data.lastRunMode).toBe("implementation");
        }
      });
      expect((await harness.loadLifecycleView()).trackerState).toBe("In Review");
    },
    runtimeRoutedLifecycleProofTimeoutMs
  );

  it(
    "reopens restarted approved-merge runs from observed approved state through workflow history",
    async () => {
      const harness = await RuntimeRoutedLifecycleProofHarness.create({
        issueId: "issue-routed-active-approved-proof",
        issueIdentifier: "SYM-ROUTED-ACTIVE-APPROVED",
        trackerState: "Todo"
      });
      harnesses.push(harness);

      await advanceToRunningApprovedMerge(harness);

      await harness.restart({
        trackerState: "In Progress"
      });
      await harness.setTrackerState("Approved");

      const firstObserved = await harness.observeActiveIssueState({
        recordedAt: "2026-04-12T11:25:10.000Z"
      });
      expect(firstObserved).toBe(true);
      expect(harness.queuedDispatches()).toHaveLength(0);

      const firstProof = await expectCurrentFlowAuthority(harness, {
        currentNode: "approved_merge",
        reasonCode: "paused_reopened_from_approved",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.trackerState).toBe("Approved");
          expect(data.lastDispatchMode).toBe("approved_merge");
          expect(data.lastRunMode).toBe("approved_merge");
        }
      });
      expectSucceededRedispatchSettlement(firstProof);
      expect((await harness.loadLifecycleView()).trackerState).toBe("Approved");

      await harness.restart({
        trackerState: "Approved"
      });

      const secondObserved = await harness.observeActiveIssueState({
        recordedAt: "2026-04-12T11:25:15.000Z"
      });
      expect(secondObserved).toBe(true);
      expect(harness.queuedDispatches()).toHaveLength(0);

      const secondProof = await expectCurrentFlowAuthority(harness, {
        currentNode: "approved_merge",
        reasonCode: "approved_merge_redispatched",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.trackerState).toBe("Approved");
          expect(data.lastDispatchMode).toBe("approved_merge");
          expect(data.lastRunMode).toBe("approved_merge");
        }
      });
      expectSucceededRedispatchSettlement(secondProof);
      expect(secondProof.snapshot.eventSequence).toBeGreaterThan(
        firstProof.snapshot.eventSequence
      );
    },
    runtimeRoutedLifecycleProofTimeoutMs
  );

  it(
    "reopens a blocked workflow after restart and resumes routed implementation",
    async () => {
      const harness = await RuntimeRoutedLifecycleProofHarness.create({
        issueId: "issue-routed-blocked-proof",
        issueIdentifier: "SYM-ROUTED-BLOCKED",
        trackerState: "Todo"
      });
      harnesses.push(harness);

      await harness.observeNonRunningIssue();
      await harness.activateNextDispatch({
        runId: "run-blocked-proof-1",
        recordedAt: "2026-04-12T11:20:05.000Z"
      });

      const spikeResult = await harness.submitSpikeResult({
        runId: "run-blocked-proof-1",
        summary: "Blocked by an external dependency.",
        details: "Waiting on upstream schema access.",
        targetState: "Blocked"
      });
      expect(spikeResult.success).toBe(true);

      await expectCurrentFlowAuthority(harness, {
        currentNode: "blocked",
        reasonCode: "implementation_state_requested_blocked",
        signalType: "runtime.state_requested",
        assertData(data) {
          expect(data.trackerState).toBe("Blocked");
          expect(data.lastDispatchMode).toBe("implementation");
        }
      });
      expect((await harness.loadLifecycleView()).trackerState).toBe("Blocked");

      await harness.restart({
        trackerState: "Todo"
      });

      const reopenedObservation = await harness.observeNonRunningIssue();
      expect(reopenedObservation).toEqual(
        expect.objectContaining({
          issueIdentifier: harness.issueIdentifier,
          observedTrackerState: "Todo",
          workflowTrackerState: "Bootstrapping",
          observed: true,
          recordedAt: expect.any(String)
        })
      );
      expectQueuedDispatch(harness, {
        runMode: "implementation",
        issueState: "Bootstrapping"
      });

      await expectCurrentFlowAuthority(harness, {
        currentNode: "bootstrapping",
        reasonCode: "blocked_reopened_from_todo",
        signalType: "tracker.state_observed",
        assertData(data) {
          expect(data.trackerState).toBe("Bootstrapping");
          expect(data.lastDispatchMode).toBe("implementation");
        }
      });

      await harness.activateNextDispatch({
        runId: "run-blocked-proof-2",
        recordedAt: "2026-04-12T11:30:05.000Z"
      });

      await expectCurrentFlowAuthority(harness, {
        currentNode: "implementation",
        reasonCode: "implementation_run_started",
        signalType: "runtime.run_started",
        assertData(data) {
          expect(data.trackerState).toBe("In Progress");
          expect(data.lastRunMode).toBe("implementation");
        }
      });
    },
    runtimeRoutedLifecycleProofTimeoutMs
  );

  it(
    "keeps failed workflow history authoritative after restart without redispatching",
    async () => {
      const harness = await RuntimeRoutedLifecycleProofHarness.create({
        issueId: "issue-routed-failed-proof",
        issueIdentifier: "SYM-ROUTED-FAILED",
        trackerState: "Todo"
      });
      harnesses.push(harness);

      await harness.observeNonRunningIssue();

      const failedIssue = await harness.routeStartupFailure({
        runId: "run-failed-proof-1",
        recordedAt: "2026-04-12T11:40:05.000Z",
        reason: "Runtime activation failed before the run started."
      });
      expect(failedIssue.state).toBe("Failed");

      const failedProof = await expectCurrentFlowAuthority(harness, {
        currentNode: "failed",
        reasonCode: "startup_failure",
        signalType: "runtime.startup_failure",
        assertData(data) {
          expect(data.trackerState).toBe("Failed");
          expect(data.lastRuntimeOutcome).toBe("startup_failure");
        }
      });
      expect((await harness.loadLifecycleView()).trackerState).toBe("Failed");

      await harness.restart({
        trackerState: "Failed"
      });

      const failedObservation = await harness.observeNonRunningIssue();
      expect(failedObservation).toEqual(
        expect.objectContaining({
          issueIdentifier: harness.issueIdentifier,
          observedTrackerState: "Failed",
          workflowTrackerState: "Failed",
          observed: false,
          recordedAt: expect.any(String)
        })
      );
      expect(harness.queuedDispatches()).toHaveLength(0);

      const failedProofAfterRestart = await expectCurrentFlowAuthority(harness, {
        currentNode: "failed",
        reasonCode: "startup_failure",
        signalType: "runtime.startup_failure",
        assertData(data) {
          expect(data.trackerState).toBe("Failed");
          expect(data.lastRuntimeOutcome).toBe("startup_failure");
        }
      });
      expect(failedProofAfterRestart.snapshot.eventSequence).toBe(
        failedProof.snapshot.eventSequence
      );
    },
    runtimeRoutedLifecycleProofTimeoutMs
  );
});

async function expectCurrentFlowAuthority(
  harness: RuntimeRoutedLifecycleProofHarness,
  input: CurrentFlowAuthorityExpectation
) {
  return await expectRouteWorkflowAuthorityProof<
    SymphonyCurrentFlowNode,
    SymphonyCurrentFlowData,
    SymphonyCurrentFlowPolicy
  >({
    routeWorkflows: harness.services.routeWorkflows,
    issueIdentifier: harness.issueIdentifier,
    ...input
  });
}

function expectQueuedDispatch(
  harness: RuntimeRoutedLifecycleProofHarness,
  input: {
    runMode: string;
    issueState: string;
  }
) {
  expect(harness.queuedDispatches()).toEqual([
    expect.objectContaining({
      workflowId: expect.any(String),
      commandId: expect.any(String),
      runMode: input.runMode,
      issue: expect.objectContaining({
        id: harness.issueId,
        identifier: harness.issueIdentifier,
        state: input.issueState
      }),
      recordedAt: expect.any(String)
    })
  ]);
}

function expectSucceededRedispatchSettlement(
  proof: Awaited<ReturnType<typeof expectCurrentFlowAuthority>>
) {
  expect(proof.latestDecision.commands).toEqual([
    expect.objectContaining({
      kind: "run.dispatch"
    })
  ]);
  expect(proof.latestSettlementEvents).toHaveLength(1);
  if (proof.latestSettlementEvents[0]?.event.kind !== "command_settled") {
    throw new TypeError("Expected redispatch settlement event.");
  }
  expect(proof.latestSettlementEvents[0].event.status).toBe("succeeded");
  expect(proof.latestSettlementEvents[0].commandId).toBe(
    proof.latestDecision.commands[0]?.id ?? null
  );
}

async function advanceToRunningApprovedMerge(
  harness: RuntimeRoutedLifecycleProofHarness
): Promise<void> {
  await harness.observeNonRunningIssue();
  await harness.activateNextDispatch({
    runId: "run-active-approved-proof-implementation",
    recordedAt: "2026-04-12T11:25:00.000Z"
  });

  const implementationDelivery = await harness.recordDeliveryReport({
    runId: "run-active-approved-proof-implementation",
    summary: "Implementation delivery is ready for approval.",
    prUrl: "https://github.com/openai/symphony/pull/201",
    testsSummary: "pnpm --filter @symphony/api test"
  });
  expect(implementationDelivery.success).toBe(true);

  await harness.setTrackerState("Approved");
  const approvedObservation = await harness.observeNonRunningIssue();
  expect(approvedObservation).toEqual(
    expect.objectContaining({
      issueIdentifier: harness.issueIdentifier,
      observedTrackerState: "Approved",
      workflowTrackerState: "Approved",
      observed: true,
      recordedAt: expect.any(String)
    })
  );
  expectQueuedDispatch(harness, {
    runMode: "approved_merge",
    issueState: "Approved"
  });

  await harness.activateNextDispatch({
    runId: "run-active-approved-proof-merge",
    recordedAt: "2026-04-12T11:25:05.000Z"
  });
  harness.clearDispatchQueue();
}
