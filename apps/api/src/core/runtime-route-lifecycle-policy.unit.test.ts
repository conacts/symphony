import { describe, expect, it } from "vitest";
import { buildSymphonyRuntimePolicy } from "@symphony/test-support";
import { buildNonRunningTrackerIngressPolicy } from "./runtime-route-lifecycle-policy.js";

describe("runtime route lifecycle policy", () => {
  it("separates dispatchable seed states from preset-required seed states", () => {
    const runtimePolicy = buildSymphonyRuntimePolicy();

    const policy = buildNonRunningTrackerIngressPolicy({
      presetId: "intelligent-flow",
      trackerConfig: {
        ...runtimePolicy.tracker,
        dispatchableStates: [" Todo ", "In Progress", "todo"]
      },
      presetRequiredSeedStates: [
        " Bootstrapping ",
        " In Review ",
        "blocked"
      ]
    });

    expect(policy.dispatchableSeedStates).toEqual(["Todo", "In Progress"]);
    expect(policy.presetRequiredSeedStates).toEqual([
      "Bootstrapping",
      "In Review",
      "blocked"
    ]);
    expect(policy.seedStates).toEqual([
      "Todo",
      "In Progress",
      "Bootstrapping",
      "In Review",
      "blocked"
    ]);
  });

  it("extends observable states with terminal and recovery states without duplicating normalized values", () => {
    const runtimePolicy = buildSymphonyRuntimePolicy();

    const policy = buildNonRunningTrackerIngressPolicy({
      presetId: "intelligent-flow",
      trackerConfig: {
        ...runtimePolicy.tracker,
        dispatchableStates: ["Todo"],
        terminalStates: [" done ", "Canceled", "DONE"],
        pauseTransitionToState: " paused ",
        blockedTransitionToState: "Blocked",
        startupFailureTransitionToState: " failed "
      },
      presetRequiredSeedStates: ["Bootstrapping"]
    });

    expect(policy.seedStates).toEqual(["Todo", "Bootstrapping"]);
    expect(policy.observableStates).toEqual([
      "Todo",
      "Bootstrapping",
      "done",
      "Canceled",
      "paused",
      "Blocked",
      "failed"
    ]);
  });

  it("fails fast when a preset declares an empty required seed state", () => {
    const runtimePolicy = buildSymphonyRuntimePolicy();

    expect(() =>
      buildNonRunningTrackerIngressPolicy({
        presetId: "intelligent-flow",
        trackerConfig: runtimePolicy.tracker,
        presetRequiredSeedStates: ["Bootstrapping", "   "]
      })
    ).toThrow(/declares an empty required non-running tracker seed state/i);
  });

  it("fails fast when a preset declares duplicate required seed states", () => {
    const runtimePolicy = buildSymphonyRuntimePolicy();

    expect(() =>
      buildNonRunningTrackerIngressPolicy({
        presetId: "intelligent-flow",
        trackerConfig: runtimePolicy.tracker,
        presetRequiredSeedStates: [" Bootstrapping ", "bootstrapping"]
      })
    ).toThrow(/declares duplicate required non-running tracker seed states/i);
  });
});
