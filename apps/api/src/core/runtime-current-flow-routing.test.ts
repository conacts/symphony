import { describe, expect, it } from "vitest";
import { buildSymphonyRuntimePolicy } from "@symphony/test-support";
import {
  listRuntimeRouterPresetIds,
  selectRuntimeRouterPreset
} from "./runtime-current-flow-routing.js";

describe("runtime router preset selection", () => {
  it("lists and resolves the registered current-flow preset", async () => {
    const runtimePolicy = buildSymphonyRuntimePolicy();

    expect(listRuntimeRouterPresetIds()).toEqual(["current-flow"]);

    const routing = await selectRuntimeRouterPreset({
      trackerConfig: runtimePolicy.tracker,
      presetId: "current-flow",
      now: () => new Date("2026-04-10T00:00:00.000Z")
    });

    expect(routing.presetId).toBe("current-flow");
    expect(routing.router.definition().name).toBe("symphony-current-flow");
    expect(routing.router.definition().version).toBe("1");
    expect(routing.policy).toEqual({});
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
});
