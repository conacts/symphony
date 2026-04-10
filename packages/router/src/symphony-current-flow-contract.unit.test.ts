import { describe, expect, it } from "vitest";
import {
  createSymphonyCurrentFlowDispatchCommand,
  createSymphonyCurrentFlowDeliveryReportedSignal,
  createSymphonyCurrentFlowMergeResultReportedSignal,
  createSymphonyCurrentFlowRunStartedSignal,
  createSymphonyCurrentFlowStateRequestedSignal,
  createSymphonyCurrentFlowTrackerStateObservedSignal,
  createSymphonyCurrentFlowTrackerTransitionCommand,
  readSymphonyCurrentFlowDispatchCommand,
  readSymphonyCurrentFlowDeliveryReportedSignal,
  readSymphonyCurrentFlowMergeResultReportedSignal,
  readSymphonyCurrentFlowRunStartedSignal,
  readSymphonyCurrentFlowStateRequestedSignal,
  readSymphonyCurrentFlowTrackerStateObservedSignal,
  readSymphonyCurrentFlowTrackerTransitionCommand
} from "./symphony-current-flow-contract.js";

describe("Symphony current-flow contract", () => {
  it("builds and reads tracker observations with explicit null run context", () => {
    const signal = createSymphonyCurrentFlowTrackerStateObservedSignal({
      id: "signal_todo_observed",
      occurredAt: "2026-04-10T15:00:00.000Z",
      state: "Todo",
      runId: null,
      runMode: null,
      causationId: null,
      correlationId: "SYM-300"
    });

    expect(readSymphonyCurrentFlowTrackerStateObservedSignal(signal)).toEqual(
      signal
    );
  });

  it("returns null when reading a different signal type", () => {
    const signal = createSymphonyCurrentFlowRunStartedSignal({
      id: "signal_run_started",
      occurredAt: "2026-04-10T15:00:01.000Z",
      runId: "run-300",
      runMode: "implementation",
      causationId: "run-300",
      correlationId: "SYM-300"
    });

    expect(readSymphonyCurrentFlowTrackerStateObservedSignal(signal)).toBeNull();
    expect(readSymphonyCurrentFlowRunStartedSignal(signal)).toEqual(signal);
  });

  it("builds and reads runtime delivery reports with strict required fields", () => {
    const signal = createSymphonyCurrentFlowDeliveryReportedSignal({
      id: "signal_delivery_reported",
      occurredAt: "2026-04-10T15:00:01.500Z",
      runId: "run-300",
      status: "completed",
      causationId: "run-300",
      correlationId: "SYM-300"
    });

    expect(readSymphonyCurrentFlowDeliveryReportedSignal(signal)).toEqual(signal);
    expect(readSymphonyCurrentFlowRunStartedSignal(signal)).toBeNull();
  });

  it("builds and reads runtime merge-result reports with strict required fields", () => {
    const signal = createSymphonyCurrentFlowMergeResultReportedSignal({
      id: "signal_merge_result_reported",
      occurredAt: "2026-04-10T15:00:01.625Z",
      runId: "run-300",
      status: "merged",
      causationId: "run-300",
      correlationId: "SYM-300"
    });

    expect(readSymphonyCurrentFlowMergeResultReportedSignal(signal)).toEqual(
      signal
    );
    expect(readSymphonyCurrentFlowDeliveryReportedSignal(signal)).toBeNull();
  });

  it("builds and reads runtime state requests with strict required fields", () => {
    const signal = createSymphonyCurrentFlowStateRequestedSignal({
      id: "signal_state_requested",
      occurredAt: "2026-04-10T15:00:01.750Z",
      runId: "run-300",
      requestKind: "cancel",
      targetState: "Canceled",
      causationId: "run-300",
      correlationId: "SYM-300"
    });

    expect(readSymphonyCurrentFlowStateRequestedSignal(signal)).toEqual(signal);
    expect(readSymphonyCurrentFlowDeliveryReportedSignal(signal)).toBeNull();
  });

  it("fails fast when tracker observations omit required null fields", () => {
    expect(() =>
      readSymphonyCurrentFlowTrackerStateObservedSignal({
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
    ).toThrow(/Invalid Symphony current-flow tracker\.state_observed signal/);
  });

  it("fails fast when runtime state requests omit the terminal target state", () => {
    expect(() =>
      readSymphonyCurrentFlowStateRequestedSignal({
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
    ).toThrow(/Invalid Symphony current-flow runtime\.state_requested signal/);
  });

  it("fails fast when merge-result reports omit the status", () => {
    expect(() =>
      readSymphonyCurrentFlowMergeResultReportedSignal({
        id: "signal_invalid_merge_result",
        type: "runtime.merge_result_reported",
        source: "runtime",
        occurredAt: "2026-04-10T15:00:02.250Z",
        payload: {
          runId: "run-300"
        },
        causationId: "run-300",
        correlationId: "SYM-300"
      })
    ).toThrow(
      /Invalid Symphony current-flow runtime\.merge_result_reported signal/
    );
  });

  it("fails fast when run.dispatch payload is malformed", () => {
    expect(() =>
      readSymphonyCurrentFlowDispatchCommand({
        id: "command_dispatch_invalid",
        kind: "run.dispatch",
        dedupeKey: null,
        payload: {
          runMode: "deploy"
        }
      })
    ).toThrow(/Invalid Symphony current-flow run\.dispatch command/);
  });

  it("reads strict tracker and dispatch commands", () => {
    const trackerTransition = createSymphonyCurrentFlowTrackerTransitionCommand({
      id: "command_tracker_paused",
      state: "Paused",
      dedupeKey: null
    });
    const dispatch = createSymphonyCurrentFlowDispatchCommand({
      id: "command_dispatch_rework",
      runMode: "rework",
      dedupeKey: null
    });

    expect(readSymphonyCurrentFlowTrackerTransitionCommand(trackerTransition))
      .toEqual(trackerTransition);
    expect(readSymphonyCurrentFlowDispatchCommand(dispatch)).toEqual(dispatch);
  });
});
