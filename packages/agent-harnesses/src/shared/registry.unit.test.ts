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

  it("exposes the PI SDK runner as a native analytics source", () => {
    const module = resolveAgentHarnessModule("pi");

    expect(module.analytics.mode).toBe("native");
    expect(module.analytics.lossiness).toBe("none");
    expect(module.analytics.adapter).toBeNull();
    expect(module.transport.startSession).toEqual(expect.any(Function));
  });
});
