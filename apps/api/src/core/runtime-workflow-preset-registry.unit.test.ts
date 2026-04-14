import { describe, expect, it } from "vitest";
import { buildSymphonyRuntimePolicy } from "@symphony/test-support";
import { runtimeAutoMergeRuntimeRouterPresetModule } from "./runtime-auto-merge-routing.js";
import { runtimeCurrentFlowRuntimeRouterPresetModule } from "./runtime-current-flow-routing.js";
import { runtimeIntelligentFlowRuntimeRouterPresetModule } from "./runtime-intelligent-flow-routing.js";
import { createSymphonyRuntimeWorkflowPresetRegistry } from "./runtime-workflow-preset-registry.js";

describe("runtime workflow preset registry", () => {
  it("lists multiple registered preset ids", () => {
    const registry = createSymphonyRuntimeWorkflowPresetRegistry({
      defaultPresetId: "intelligent-flow",
      modules: {
        "auto-merge": runtimeAutoMergeRuntimeRouterPresetModule,
        "current-flow": runtimeCurrentFlowRuntimeRouterPresetModule,
        "intelligent-flow": runtimeIntelligentFlowRuntimeRouterPresetModule
      }
    });

    expect(registry.listPresetIds()).toEqual([
      "auto-merge",
      "current-flow",
      "intelligent-flow"
    ]);
  });

  it("defaults to intelligent-flow while preserving explicit legacy presets", async () => {
    const runtimePolicy = buildSymphonyRuntimePolicy();
    const registry = createSymphonyRuntimeWorkflowPresetRegistry({
      defaultPresetId: "intelligent-flow",
      modules: {
        "auto-merge": runtimeAutoMergeRuntimeRouterPresetModule,
        "current-flow": runtimeCurrentFlowRuntimeRouterPresetModule,
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
    await expect(
      registry.selectPreset({
        trackerConfig: runtimePolicy.tracker,
        presetId: "current-flow"
      })
    ).resolves.toMatchObject({
      presetId: "current-flow"
    });
    await expect(
      registry.selectPreset({
        trackerConfig: runtimePolicy.tracker,
        presetId: "auto-merge"
      })
    ).resolves.toMatchObject({
      presetId: "auto-merge"
    });
  });

  it("fails fast when the default preset id is not registered", () => {
    const modules = {
      "current-flow": runtimeCurrentFlowRuntimeRouterPresetModule
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
      ...runtimeCurrentFlowRuntimeRouterPresetModule,
      presetId: "alternate-flow"
    };

    expect(() =>
      createSymphonyRuntimeWorkflowPresetRegistry({
        defaultPresetId: "current-flow",
        modules: {
          "current-flow": mismatchedModule
        }
      })
    ).toThrow(/does not match registered preset id/i);
  });
});
