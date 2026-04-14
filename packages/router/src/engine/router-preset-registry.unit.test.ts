import { describe, expect, it } from "vitest";
import {
  WorkflowRouterPresetRegistry
} from "./router-preset-registry.js";
import {
  createSymphonyCurrentFlowRouterPreset
} from "../presets/current-flow/symphony-current-flow-router.js";

describe("workflow router preset registry", () => {
  it("lists and resolves registered presets", async () => {
    const registry = new WorkflowRouterPresetRegistry({
      "current-flow": createSymphonyCurrentFlowRouterPreset()
    });

    expect(registry.listPresetIds()).toEqual(["current-flow"]);

    const resolved = await registry.resolvePreset("current-flow", {
      now: () => new Date("2026-04-10T00:00:00.000Z")
    });

    expect(resolved.presetId).toBe("current-flow");
    expect(resolved.router.definition().name).toBe("symphony-current-flow");
    expect(resolved.router.definition().version).toBe("1");
    expect(resolved.policy).toEqual({});
  });

  it("fails fast when a requested preset id is not registered", () => {
    const registry = new WorkflowRouterPresetRegistry({
      "current-flow": createSymphonyCurrentFlowRouterPreset()
    });

    expect(() => registry.requirePresetId("missing")).toThrow(
      /Unknown workflow router preset/
    );
  });
});
