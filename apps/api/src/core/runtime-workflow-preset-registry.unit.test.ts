import { describe, expect, it } from "vitest";
import { buildSymphonyRuntimePolicy } from "@symphony/test-support";
import { runtimeIntelligentFlowRuntimeRouterPresetModule } from "./runtime-intelligent-flow-routing.js";
import { createSymphonyRuntimeWorkflowPresetRegistry } from "./runtime-workflow-preset-registry.js";

describe("runtime workflow preset registry", () => {
  it("lists registered preset ids", () => {
    const registry = createSymphonyRuntimeWorkflowPresetRegistry({
      defaultPresetId: "intelligent-flow",
      modules: {
        "intelligent-flow": runtimeIntelligentFlowRuntimeRouterPresetModule
      }
    });

    expect(registry.listPresetIds()).toEqual(["intelligent-flow"]);
  });

  it("defaults to intelligent-flow", async () => {
    const runtimePolicy = buildSymphonyRuntimePolicy();
    const registry = createSymphonyRuntimeWorkflowPresetRegistry({
      defaultPresetId: "intelligent-flow",
      modules: {
        "intelligent-flow": runtimeIntelligentFlowRuntimeRouterPresetModule
      }
    });

    expect(registry.getDefaultPresetId()).toBe("intelligent-flow");
    await expect(
      registry.selectPreset({
        trackerConfig: runtimePolicy.tracker
      })
    ).resolves.toMatchObject({
      presetId: "intelligent-flow"
    });
  });

  it("fails fast when the default preset id is not registered", () => {
    const modules = {
      "intelligent-flow": runtimeIntelligentFlowRuntimeRouterPresetModule
    };

    expect(() =>
      createSymphonyRuntimeWorkflowPresetRegistry({
        defaultPresetId:
          "missing" as (keyof typeof modules & string),
        modules
      })
    ).toThrow(/default .* is not registered/i);
  });

  it("fails fast when a registered preset key does not match the module preset id", () => {
    const mismatchedModule = {
      ...runtimeIntelligentFlowRuntimeRouterPresetModule,
      presetId: "alternate-flow"
    };

    expect(() =>
      createSymphonyRuntimeWorkflowPresetRegistry({
        defaultPresetId: "intelligent-flow",
        modules: {
          "intelligent-flow": mismatchedModule
        }
      })
    ).toThrow(/does not match registered preset id/i);
  });
});
