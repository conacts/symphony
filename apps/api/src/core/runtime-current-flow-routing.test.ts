import { describe, expect, it } from "vitest";
import { buildSymphonyRuntimePolicy } from "@symphony/test-support";
import {
  getDefaultRuntimeRouterPresetId,
  listRuntimeRouterPresetIds,
  selectRuntimeRouterPreset
} from "./runtime-workflow-presets.js";
import {
  createSymphonyCurrentFlowDispatchCommand,
  createSymphonyCurrentFlowTrackerTransitionCommand
} from "@symphony/router";

describe("runtime router preset selection", () => {
  it("lists and resolves the registered current-flow preset", async () => {
    const runtimePolicy = buildSymphonyRuntimePolicy();

    expect(listRuntimeRouterPresetIds()).toEqual(["current-flow"]);
    expect(getDefaultRuntimeRouterPresetId()).toBe("current-flow");

    const routing = await selectRuntimeRouterPreset({
      trackerConfig: runtimePolicy.tracker,
      presetId: "current-flow",
      now: () => new Date("2026-04-10T00:00:00.000Z")
    });

    expect(routing.presetId).toBe("current-flow");
    expect(routing.module.presetId).toBe("current-flow");
    expect(routing.router.definition().name).toBe("symphony-current-flow");
    expect(routing.router.definition().version).toBe("1");
    expect(routing.policy).toEqual({});
    expect(
      routing.module.runtimeAdapter.readTrackerTransitionState(
        createSymphonyCurrentFlowTrackerTransitionCommand({
          id: "command_tracker_bootstrapping",
          dedupeKey: null,
          state: "Bootstrapping"
        })
      )
    ).toBe("Bootstrapping");
    expect(
      routing.module.runtimeAdapter.readDispatchRunMode(
        createSymphonyCurrentFlowDispatchCommand({
          id: "command_dispatch_implementation",
          dedupeKey: null,
          runMode: "implementation"
        })
      )
    ).toBe("implementation");
  });

  it("fails fast when a preset id is not registered", async () => {
    const runtimePolicy = buildSymphonyRuntimePolicy();

    await expect(
      selectRuntimeRouterPreset({
        trackerConfig: runtimePolicy.tracker,
        presetId: "missing"
      })
    ).rejects.toThrow(/Unknown workflow router preset/);
  });

  it("fails fast when the selected preset tracker contract is invalid", async () => {
    const runtimePolicy = buildSymphonyRuntimePolicy();

    await expect(
      selectRuntimeRouterPreset({
        trackerConfig: {
          ...runtimePolicy.tracker,
          claimTransitionToState: "In Progress"
        },
        presetId: "current-flow"
      })
    ).rejects.toThrow(
      /Current-flow routing requires tracker\.claimTransitionToState/
    );
  });
});
