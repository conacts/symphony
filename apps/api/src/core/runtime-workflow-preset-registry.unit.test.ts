import { describe, expect, it } from "vitest";
import { runtimeAutoMergeRuntimeRouterPresetModule } from "./runtime-auto-merge-routing.js";
import { runtimeCurrentFlowRuntimeRouterPresetModule } from "./runtime-current-flow-routing.js";
import { runtimeIntelligentFlowRuntimeRouterPresetModule } from "./runtime-intelligent-flow-routing.js";
import { createSymphonyRuntimeWorkflowPresetRegistry } from "./runtime-workflow-preset-registry.js";

describe("runtime workflow preset registry", () => {
  it("lists multiple registered preset ids", () => {
    const registry = createSymphonyRuntimeWorkflowPresetRegistry({
      defaultPresetId: "current-flow",
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
