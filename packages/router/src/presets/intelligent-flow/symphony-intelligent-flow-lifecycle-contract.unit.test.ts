import { describe, expect, it } from "vitest";
import {
  createSymphonyIntelligentFlowDispatchCommand,
  createSymphonyIntelligentFlowDeliveryReportedSignal,
  createSymphonyIntelligentFlowRunStartedSignal,
  createSymphonyIntelligentFlowStateRequestedSignal,
  createSymphonyIntelligentFlowTrackerStateObservedSignal,
  createSymphonyIntelligentFlowTrackerTransitionCommand,
  readSymphonyIntelligentFlowDispatchCommand,
  readSymphonyIntelligentFlowDeliveryReportedSignal,
  readSymphonyIntelligentFlowRunStartedSignal,
  readSymphonyIntelligentFlowStateRequestedSignal,
  readSymphonyIntelligentFlowTrackerStateObservedSignal,
  readSymphonyIntelligentFlowTrackerTransitionCommand
} from "./symphony-intelligent-flow-lifecycle-contract.js";

describe("Symphony intelligent-flow lifecycle contract", () => {
  it("builds and reads tracker observations with explicit null run context", () => {
    const signal = createSymphonyIntelligentFlowTrackerStateObservedSignal({
      id: "signal_todo_observed",
      occurredAt: "2026-04-10T15:00:00.000Z",
      state: "Todo",
      runId: null,
      runMode: null,
      causationId: null,
      correlationId: "SYM-300"
    });

    expect(readSymphonyIntelligentFlowTrackerStateObservedSignal(signal)).toEqual(
      signal
    );
  });

  it("returns null when reading a different signal type", () => {
    const signal = createSymphonyIntelligentFlowRunStartedSignal({
      id: "signal_run_started",
      occurredAt: "2026-04-10T15:00:01.000Z",
      runId: "run-300",
      runMode: "implementation",
      causationId: "run-300",
      correlationId: "SYM-300"
    });

    expect(readSymphonyIntelligentFlowTrackerStateObservedSignal(signal)).toBeNull();
    expect(readSymphonyIntelligentFlowRunStartedSignal(signal)).toEqual(signal);
  });

  it("builds and reads runtime delivery reports with strict required fields", () => {
    const signal = createSymphonyIntelligentFlowDeliveryReportedSignal({
      id: "signal_delivery_reported",
      occurredAt: "2026-04-10T15:00:01.500Z",
      runId: "run-300",
      status: "completed",
      causationId: "run-300",
      correlationId: "SYM-300"
    });

    expect(readSymphonyIntelligentFlowDeliveryReportedSignal(signal)).toEqual(signal);
    expect(readSymphonyIntelligentFlowRunStartedSignal(signal)).toBeNull();
  });

  it("builds and reads runtime state requests with strict required fields", () => {
    const signal = createSymphonyIntelligentFlowStateRequestedSignal({
      id: "signal_state_requested",
      occurredAt: "2026-04-10T15:00:01.750Z",
      runId: "run-300",
      requestKind: "cancel",
      targetState: "Canceled",
      causationId: "run-300",
      correlationId: "SYM-300"
    });

    expect(readSymphonyIntelligentFlowStateRequestedSignal(signal)).toEqual(signal);
    expect(readSymphonyIntelligentFlowDeliveryReportedSignal(signal)).toBeNull();
  });

  it("fails fast when tracker observations omit required null fields", () => {
    expect(() =>
      readSymphonyIntelligentFlowTrackerStateObservedSignal({
        id: "signal_invalid_tracker_state",
        type: "tracker.state_observed",
        source: "tracker",
        occurredAt: "2026-04-10T15:00:02.000Z",
        payload: {
          state: "Todo"
        },
        causationId: null,
        correlationId: "SYM-300"
      })
    ).toThrow(
      /Invalid Symphony intelligent-flow lifecycle tracker\.state_observed signal/
    );
  });

  it("fails fast when runtime state requests omit the terminal target state", () => {
    expect(() =>
      readSymphonyIntelligentFlowStateRequestedSignal({
        id: "signal_invalid_state_request",
        type: "runtime.state_requested",
        source: "runtime",
        occurredAt: "2026-04-10T15:00:02.500Z",
        payload: {
          runId: "run-300",
          requestKind: "spike_result"
        },
        causationId: "run-300",
        correlationId: "SYM-300"
      })
    ).toThrow(
      /Invalid Symphony intelligent-flow lifecycle runtime\.state_requested signal/
    );
  });


  it("fails fast when run.dispatch payload is malformed", () => {
    expect(() =>
      readSymphonyIntelligentFlowDispatchCommand({
        id: "command_dispatch_invalid",
        kind: "run.dispatch",
        dedupeKey: null,
        payload: {
          runMode: "deploy"
        }
      })
    ).toThrow(
      /Invalid Symphony intelligent-flow lifecycle run\.dispatch command/
    );
  });

  it("reads strict tracker and dispatch commands", () => {
    const trackerTransition = createSymphonyIntelligentFlowTrackerTransitionCommand({
      id: "command_tracker_paused",
      state: "Paused",
      dedupeKey: null
    });
    const dispatch = createSymphonyIntelligentFlowDispatchCommand({
      id: "command_dispatch_rework",
      runMode: "rework",
      dedupeKey: null
    });

    expect(readSymphonyIntelligentFlowTrackerTransitionCommand(trackerTransition))
      .toEqual(trackerTransition);
    expect(readSymphonyIntelligentFlowDispatchCommand(dispatch)).toEqual(dispatch);
  });
});
