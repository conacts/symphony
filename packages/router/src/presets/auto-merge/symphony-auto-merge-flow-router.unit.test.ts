import { describe, expect, it } from "vitest";
import {
  createSymphonyCurrentFlowDeliveryReportedSignal,
  createSymphonyCurrentFlowRunStartedSignal,
  createSymphonyCurrentFlowTrackerStateObservedSignal
} from "../current-flow/symphony-current-flow-contract.js";
import {
  createSymphonyAutoMergeFlowRouterAsync
} from "./symphony-auto-merge-flow-router.js";

describe("Symphony auto-merge flow router", () => {
  it("builds the auto-merge router definition", async () => {
    const router = await createSymphonyAutoMergeFlowRouterAsync();

    expect(router.definition().name).toBe("symphony-auto-merge-flow");
    expect(router.definition().version).toBe("1");
  });

  it("auto-approves successful delivery and dispatches approved merge work", async () => {
    const router = await createSymphonyAutoMergeFlowRouterAsync({
      now: () => new Date("2026-04-11T10:00:00.000Z"),
      createId: buildCreateId()
    });
    const session = await router.startSessionAsync({
      workflowId: "SYM-701",
      policy: {}
    });

    await session.receiveAsync(
      createSymphonyCurrentFlowTrackerStateObservedSignal({
        id: "signal_todo_observed",
        occurredAt: "2026-04-11T09:59:58.000Z",
        state: "Todo",
        runId: null,
        runMode: null,
        causationId: null,
        correlationId: "SYM-701"
      })
    );
    await session.receiveAsync(
      createSymphonyCurrentFlowRunStartedSignal({
        id: "signal_implementation_started",
        occurredAt: "2026-04-11T09:59:59.000Z",
        runId: "run-1",
        runMode: "implementation",
        causationId: "run-1",
        correlationId: "SYM-701"
      })
    );

    const result = await session.receiveAsync(
      createSymphonyCurrentFlowDeliveryReportedSignal({
        id: "signal_delivery_reported",
        occurredAt: "2026-04-11T10:00:00.000Z",
        runId: "run-1",
        status: "completed",
        causationId: "run-1",
        correlationId: "SYM-701"
      })
    );

    expect(result.decision.fromNode).toBe("implementation");
    expect(result.decision.toNode).toBe("approved_merge");
    expect(result.decision.reasonCode).toBe("delivery_reported_auto_approved");
    expect(result.decision.commands).toEqual([
      {
        id: "command_signal_delivery_reported_tracker_approved",
        kind: "tracker.transition",
        dedupeKey: null,
        payload: {
          state: "Approved"
        }
      },
      {
        id: "command_signal_delivery_reported_dispatch_approved_merge",
        kind: "run.dispatch",
        dedupeKey: null,
        payload: {
          runMode: "approved_merge"
        }
      }
    ]);
  });

  it("preserves blocked delivery handling from the base current-flow contract", async () => {
    const router = await createSymphonyAutoMergeFlowRouterAsync({
      now: () => new Date("2026-04-11T10:05:00.000Z"),
      createId: buildCreateId()
    });
    const session = await router.startSessionAsync({
      workflowId: "SYM-702",
      policy: {}
    });

    await session.receiveAsync(
      createSymphonyCurrentFlowTrackerStateObservedSignal({
        id: "signal_todo_observed",
        occurredAt: "2026-04-11T10:04:58.000Z",
        state: "Todo",
        runId: null,
        runMode: null,
        causationId: null,
        correlationId: "SYM-702"
      })
    );
    await session.receiveAsync(
      createSymphonyCurrentFlowRunStartedSignal({
        id: "signal_implementation_started",
        occurredAt: "2026-04-11T10:04:59.000Z",
        runId: "run-2",
        runMode: "implementation",
        causationId: "run-2",
        correlationId: "SYM-702"
      })
    );

    const result = await session.receiveAsync(
      createSymphonyCurrentFlowDeliveryReportedSignal({
        id: "signal_delivery_blocked",
        occurredAt: "2026-04-11T10:05:00.000Z",
        runId: "run-2",
        status: "blocked",
        causationId: "run-2",
        correlationId: "SYM-702"
      })
    );

    expect(result.decision.toNode).toBe("blocked");
    expect(result.decision.reasonCode).toBe("implementation_delivery_blocked");
    expect(result.decision.commands).toEqual([
      {
        id: "command_signal_delivery_blocked_tracker_blocked",
        kind: "tracker.transition",
        dedupeKey: null,
        payload: {
          state: "Blocked"
        }
      }
    ]);
  });
});

function buildCreateId() {
  let counter = 0;

  return (prefix: string) => `${prefix}_${String(++counter).padStart(4, "0")}`;
}
