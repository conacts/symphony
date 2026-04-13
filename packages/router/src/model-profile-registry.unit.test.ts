import { describe, expect, it } from "vitest";
import {
  WorkflowModelProfileRegistry,
  createWorkflowModelProfileRegistry
} from "./model-profile-registry.js";

describe("workflow model profile registry", () => {
  it("lists and returns registered profile definitions", () => {
    const registry = createWorkflowModelProfileRegistry([
      {
        id: "builder_fast",
        label: "Builder Fast",
        description: null
      },
      {
        id: "critic_strict",
        label: "Critic Strict",
        description: "High-scrutiny reviewer."
      }
    ] as const);

    expect(registry.listProfileIds()).toEqual([
      "builder_fast",
      "critic_strict"
    ]);
    expect(registry.getProfileDefinition("builder_fast")).toEqual({
      id: "builder_fast",
      label: "Builder Fast",
      description: null
    });
  });

  it("fails fast when duplicate profile ids are registered", () => {
    expect(
      () =>
        new WorkflowModelProfileRegistry([
          {
            id: "builder_fast",
            label: "Builder Fast",
            description: null
          },
          {
            id: "builder_fast",
            label: "Builder Fast Again",
            description: null
          }
        ])
    ).toThrow(/Duplicate workflow model profile id/);
  });

  it("fails fast when a profile id is blank", () => {
    expect(
      () =>
        new WorkflowModelProfileRegistry([
          {
            id: "   ",
            label: "Broken",
            description: null
          }
        ])
    ).toThrow(/Workflow model profile id is required/);
  });

  it("fails fast when the registry is empty", () => {
    expect(() => new WorkflowModelProfileRegistry([])).toThrow(
      /requires at least one profile definition/i
    );
  });
});
