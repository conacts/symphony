import { describe, expect, it } from "vitest";
import {
  WorkflowRouterPresetRegistry
} from "./router-preset-registry.js";
import {
  createSymphonyIntelligentFlowRouterPreset
} from "../presets/intelligent-flow/symphony-intelligent-flow-router.js";

describe("workflow router preset registry", () => {
  it("lists and resolves registered presets", async () => {
    const registry = new WorkflowRouterPresetRegistry({
      "intelligent-flow": createSymphonyIntelligentFlowRouterPreset()
    });

    expect(registry.listPresetIds()).toEqual(["intelligent-flow"]);

    const resolved = await registry.resolvePreset("intelligent-flow", {
      now: () => new Date("2026-04-10T00:00:00.000Z")
    });

    expect(resolved.presetId).toBe("intelligent-flow");
    expect(resolved.router.definition().name).toBe("symphony-intelligent-flow");
    expect(resolved.router.definition().version).toBe("1");
    expect(resolved.policy).toEqual({});
  });

  it("fails fast when a requested preset id is not registered", () => {
    const registry = new WorkflowRouterPresetRegistry({
      "intelligent-flow": createSymphonyIntelligentFlowRouterPreset()
    });

    expect(() => registry.requirePresetId("missing")).toThrow(
      /Unknown workflow router preset/
    );
  });
});
