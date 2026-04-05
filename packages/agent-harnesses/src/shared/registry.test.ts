import { describe, expect, it } from "vitest";
import {
  listAgentHarnessModules,
  resolveAgentHarnessModule
} from "./registry.js";

describe("agent harness registry", () => {
  it("returns provider modules with explicit transport and analytics contracts", () => {
    const modules = listAgentHarnessModules();

    expect(modules.map((module) => module.definition.kind)).toEqual([
      "codex",
      "opencode",
      "pi"
    ]);
    expect(modules.every((module) => module.transport)).toBe(true);
    expect(modules.every((module) => module.analytics)).toBe(true);
  });

  it("exposes the OpenCode analytics adapter through the provider module", () => {
    const module = resolveAgentHarnessModule("opencode");

    expect(module.analytics.mode).toBe("projection");
    expect(module.analytics.lossiness).toBe("best_effort");
    expect(module.analytics.adapter).toEqual(
      expect.objectContaining({
        projectPromptResponse: expect.any(Function),
        projectSessionDiff: expect.any(Function),
        projectTodoListEvent: expect.any(Function)
      })
    );
  });
});
