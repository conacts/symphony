import { describe, expect, it } from "vitest";
import {
  listAgentHarnessModules,
  resolveAgentHarnessModule
} from "./registry.js";

describe("agent harness registry", () => {
  it("returns provider modules with explicit transport and analytics contracts", () => {
    const modules = listAgentHarnessModules();

    expect(modules.map((module) => module.definition.kind)).toEqual(["pi"]);
    expect(modules.every((module) => module.transport)).toBe(true);
    expect(modules.every((module) => module.analytics)).toBe(true);
  });

  it("exposes the PI analytics adapter through the provider module", () => {
    const module = resolveAgentHarnessModule("pi");

    expect(module.analytics.mode).toBe("projection");
    expect(module.analytics.lossiness).toBe("best_effort");
    expect(module.analytics.adapter).toEqual(
      expect.objectContaining({
        extractTurnUsage: expect.any(Function),
        projectMessageEndEvent: expect.any(Function),
        projectQueueUpdateEvent: expect.any(Function),
        projectRuntimeEvent: expect.any(Function),
        projectSessionHeaderEvent: expect.any(Function),
        projectToolExecutionEndEvent: expect.any(Function),
        projectToolExecutionStartEvent: expect.any(Function),
        projectToolExecutionUpdateEvent: expect.any(Function),
        projectTurnEndEvent: expect.any(Function),
        projectTurnStartEvent: expect.any(Function)
      })
    );
  });
});
