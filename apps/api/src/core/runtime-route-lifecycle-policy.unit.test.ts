import { describe, expect, it } from "vitest";
import { buildSymphonyRuntimePolicy } from "@symphony/test-support";
import { buildNonRunningTrackerIngressPolicy } from "./runtime-route-lifecycle-policy.js";

describe("runtime route lifecycle policy", () => {
  it("separates dispatchable seed states from preset-required seed states", () => {
    const runtimePolicy = buildSymphonyRuntimePolicy();

    const policy = buildNonRunningTrackerIngressPolicy({
      trackerConfig: {
        ...runtimePolicy.tracker,
        dispatchableStates: [" Todo ", "Rework", "todo"]
      },
      presetRequiredSeedStates: [
        " Bootstrapping ",
        " In Review ",
        "approved",
        "Approved"
      ]
    });

    expect(policy.dispatchableSeedStates).toEqual(["Todo", "Rework"]);
    expect(policy.presetRequiredSeedStates).toEqual([
      "Bootstrapping",
      "In Review",
      "approved"
    ]);
    expect(policy.seedStates).toEqual([
      "Todo",
      "Rework",
      "Bootstrapping",
      "In Review",
      "approved"
    ]);
  });

  it("extends observable states with terminal and recovery states without duplicating normalized values", () => {
    const runtimePolicy = buildSymphonyRuntimePolicy();

    const policy = buildNonRunningTrackerIngressPolicy({
      trackerConfig: {
        ...runtimePolicy.tracker,
        dispatchableStates: ["Todo"],
        terminalStates: [" done ", "Canceled", "DONE"],
        pauseTransitionToState: " paused ",
        blockedTransitionToState: "Blocked",
        startupFailureTransitionToState: " failed "
      },
      presetRequiredSeedStates: ["Approved"]
    });

    expect(policy.seedStates).toEqual(["Todo", "Approved"]);
    expect(policy.observableStates).toEqual([
      "Todo",
      "Approved",
      "done",
      "Canceled",
      "paused",
      "Blocked",
      "failed"
    ]);
  });
});
