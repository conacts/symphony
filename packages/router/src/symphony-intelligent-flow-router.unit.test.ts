import { describe, expect, it } from "vitest";
import {
  createSymphonyCurrentFlowDeliveryReportedSignal,
  createSymphonyCurrentFlowReviewReworkRequestedSignal,
  createSymphonyCurrentFlowRunStartedSignal,
  createSymphonyCurrentFlowTrackerStateObservedSignal
} from "./symphony-current-flow-contract.js";
import {
  createSymphonyIntelligentFlowRouterAsync
} from "./symphony-intelligent-flow-router.js";

describe("Symphony intelligent-flow router", () => {
  it("builds the intelligent-flow router definition", async () => {
    const router = await createSymphonyIntelligentFlowRouterAsync();

    expect(router.definition().name).toBe("symphony-intelligent-flow");
    expect(router.definition().version).toBe("1");
    expect(router.definition().initialNode).toBe("queued");
    expect(router.definition().nodes.map((node) => node.id)).toEqual([
      "queued",
      "claimed",
      "active",
      "awaiting_input",
      "blocked",
      "paused",
      "failed",
      "done"
    ]);
  });

  it("claims Todo work into the claimed shell state and dispatches implementation", async () => {
    const router = await createSymphonyIntelligentFlowRouterAsync({
      now: () => new Date("2026-04-13T23:00:00.000Z"),
      createId: buildCreateId()
    });
    const session = await router.startSessionAsync({
      workflowId: "SYM-INT-701",
      policy: {}
    });

    const result = await session.receiveAsync(
      createSymphonyCurrentFlowTrackerStateObservedSignal({
        id: "signal_todo_observed",
        occurredAt: "2026-04-13T22:59:58.000Z",
        state: "Todo",
        runId: null,
        runMode: null,
        causationId: null,
        correlationId: "SYM-INT-701"
      })
    );

    expect(result.decision.fromNode).toBe("queued");
    expect(result.decision.toNode).toBe("claimed");
    expect(result.decision.reasonCode).toBe("queued_claimed_from_todo");
    expect(result.decision.commands).toEqual([
      {
        id: "command_signal_todo_observed_tracker_bootstrapping",
        kind: "tracker.transition",
        dedupeKey: null,
        payload: {
          state: "Bootstrapping"
        }
      },
      {
        id: "command_signal_todo_observed_dispatch_implementation",
        kind: "run.dispatch",
        dedupeKey: null,
        payload: {
          runMode: "implementation"
        }
      }
    ]);
  });

  it("moves claimed work into active when a run starts and requests In Progress", async () => {
    const router = await createSymphonyIntelligentFlowRouterAsync({
      now: () => new Date("2026-04-13T23:05:00.000Z"),
      createId: buildCreateId()
    });
    const session = await router.startSessionAsync({
      workflowId: "SYM-INT-702",
      policy: {}
    });

    await session.receiveAsync(
      createSymphonyCurrentFlowTrackerStateObservedSignal({
        id: "signal_todo_observed",
        occurredAt: "2026-04-13T23:04:58.000Z",
        state: "Todo",
        runId: null,
        runMode: null,
        causationId: null,
        correlationId: "SYM-INT-702"
      })
    );

    const result = await session.receiveAsync(
      createSymphonyCurrentFlowRunStartedSignal({
        id: "signal_implementation_started",
        occurredAt: "2026-04-13T23:04:59.000Z",
        runId: "run-1",
        runMode: "implementation",
        causationId: "run-1",
        correlationId: "SYM-INT-702"
      })
    );

    expect(result.decision.fromNode).toBe("claimed");
    expect(result.decision.toNode).toBe("active");
    expect(result.decision.reasonCode).toBe("active_run_started");
    expect(result.decision.commands).toEqual([
      {
        id: "command_signal_implementation_started_tracker_in_progress",
        kind: "tracker.transition",
        dedupeKey: null,
        payload: {
          state: "In Progress"
        }
      }
    ]);
  });

  it("keeps completed delivery inside the active shell while transitioning the tracker to In Review", async () => {
    const router = await createSymphonyIntelligentFlowRouterAsync({
      now: () => new Date("2026-04-13T23:10:00.000Z"),
      createId: buildCreateId()
    });
    const session = await router.startSessionAsync({
      workflowId: "SYM-INT-703",
      policy: {}
    });

    await session.receiveAsync(
      createSymphonyCurrentFlowTrackerStateObservedSignal({
        id: "signal_todo_observed",
        occurredAt: "2026-04-13T23:09:58.000Z",
        state: "Todo",
        runId: null,
        runMode: null,
        causationId: null,
        correlationId: "SYM-INT-703"
      })
    );
    await session.receiveAsync(
      createSymphonyCurrentFlowRunStartedSignal({
        id: "signal_implementation_started",
        occurredAt: "2026-04-13T23:09:59.000Z",
        runId: "run-1",
        runMode: "implementation",
        causationId: "run-1",
        correlationId: "SYM-INT-703"
      })
    );

    const result = await session.receiveAsync(
      createSymphonyCurrentFlowDeliveryReportedSignal({
        id: "signal_delivery_reported",
        occurredAt: "2026-04-13T23:10:00.000Z",
        runId: "run-1",
        status: "completed",
        causationId: "run-1",
        correlationId: "SYM-INT-703"
      })
    );

    expect(result.decision.fromNode).toBe("active");
    expect(result.decision.toNode).toBe("active");
    expect(result.decision.reasonCode).toBe("active_delivery_recorded");
    expect(result.decision.commands).toEqual([
      {
        id: "command_signal_delivery_reported_tracker_in_review",
        kind: "tracker.transition",
        dedupeKey: null,
        payload: {
          state: "In Review"
        }
      }
    ]);
  });

  it("requeues active work into claimed when review requests rework", async () => {
    const router = await createSymphonyIntelligentFlowRouterAsync({
      now: () => new Date("2026-04-13T23:15:00.000Z"),
      createId: buildCreateId()
    });
    const session = await router.startSessionAsync({
      workflowId: "SYM-INT-704",
      policy: {}
    });

    await session.receiveAsync(
      createSymphonyCurrentFlowTrackerStateObservedSignal({
        id: "signal_review_observed",
        occurredAt: "2026-04-13T23:14:59.000Z",
        state: "In Review",
        runId: null,
        runMode: null,
        causationId: null,
        correlationId: "SYM-INT-704"
      })
    );

    const result = await session.receiveAsync(
      createSymphonyCurrentFlowReviewReworkRequestedSignal({
        id: "signal_review_rework_requested",
        occurredAt: "2026-04-13T23:15:00.000Z",
        handoff: {
          source: "github_review",
          triggerKind: "changes_requested_review",
          reviewContextUrl:
            "https://github.com/openai/symphony/pull/123#pullrequestreview-456",
          pullRequestUrl: "https://github.com/openai/symphony/pull/123",
          actorLogin: "reviewer",
          feedbackBody: "Address the requested review changes.",
          recordedAt: "2026-04-13T23:15:00.000Z"
        },
        causationId: "review-1",
        correlationId: "SYM-INT-704"
      })
    );

    expect(result.decision.fromNode).toBe("active");
    expect(result.decision.toNode).toBe("claimed");
    expect(result.decision.reasonCode).toBe("active_requested_rework");
    expect(result.decision.commands).toEqual([
      {
        id: "command_signal_review_rework_requested_tracker_rework",
        kind: "tracker.transition",
        dedupeKey: null,
        payload: {
          state: "Rework"
        }
      },
      {
        id: "command_signal_review_rework_requested_tracker_bootstrapping",
        kind: "tracker.transition",
        dedupeKey: null,
        payload: {
          state: "Bootstrapping"
        }
      },
      {
        id: "command_signal_review_rework_requested_dispatch_rework",
        kind: "run.dispatch",
        dedupeKey: null,
        payload: {
          runMode: "rework"
        }
      }
    ]);
  });
});

function buildCreateId() {
  let counter = 0;
  return (prefix: string) => `${prefix}_${String(++counter).padStart(4, "0")}`;
}
