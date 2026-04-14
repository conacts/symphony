import { describe, expect, it } from "vitest";
import {
  WorkflowCapabilityRegistry,
  createWorkflowCapabilityRegistry
} from "./capability-registry.js";
import { createWorkflowModelProfileRegistry } from "./model-profile-registry.js";

const modelProfileRegistry = createWorkflowModelProfileRegistry([
  {
    id: "builder_fast",
    label: "Builder Fast",
    description: null
  },
  {
    id: "critic_strict",
    label: "Critic Strict",
    description: null
  }
] as const);

describe("workflow capability registry", () => {
  it("lists and returns registered capability definitions", () => {
    const registry = createWorkflowCapabilityRegistry({
      definitions: [
        {
          id: "implement.spec",
          phase: "implementing",
          description: "Implement the requested specification.",
          supportedModelProfileIds: ["builder_fast"],
          producesEvidenceIds: ["change_set"],
          enabledByDefault: true
        },
        {
          id: "critic.code_review",
          phase: "verifying",
          description: "Review the submitted change.",
          supportedModelProfileIds: ["critic_strict"],
          producesEvidenceIds: ["code_review_report"],
          enabledByDefault: true
        }
      ] as const,
      modelProfileRegistry
    });

    expect(registry.listCapabilityIds()).toEqual([
      "implement.spec",
      "critic.code_review"
    ]);
    expect(registry.getCapabilityDefinition("implement.spec")).toEqual({
      id: "implement.spec",
      phase: "implementing",
      description: "Implement the requested specification.",
      supportedModelProfileIds: ["builder_fast"],
      producesEvidenceIds: ["change_set"],
      enabledByDefault: true
    });
  });

  it("fails fast when duplicate capability ids are registered", () => {
    expect(
      () =>
        new WorkflowCapabilityRegistry({
          definitions: [
            {
              id: "implement.spec",
              phase: "implementing",
              description: "Implement.",
              supportedModelProfileIds: ["builder_fast"],
              producesEvidenceIds: ["change_set"],
              enabledByDefault: true
            },
            {
              id: "implement.spec",
              phase: "implementing",
              description: "Implement again.",
              supportedModelProfileIds: ["builder_fast"],
              producesEvidenceIds: ["change_set"],
              enabledByDefault: true
            }
          ],
          modelProfileRegistry
        })
    ).toThrow(/Duplicate workflow capability id/);
  });

  it("fails fast when a capability id is blank", () => {
    expect(
      () =>
        new WorkflowCapabilityRegistry({
          definitions: [
            {
              id: "   ",
              phase: "implementing",
              description: "Broken.",
              supportedModelProfileIds: ["builder_fast"],
              producesEvidenceIds: ["change_set"],
              enabledByDefault: true
            }
          ],
          modelProfileRegistry
        })
    ).toThrow(/Workflow capability id is required/);
  });

  it("fails fast when a capability references an unsupported profile", () => {
    expect(
      () =>
        new WorkflowCapabilityRegistry({
          definitions: [
            {
              id: "critic.adversarial_tests",
              phase: "verifying",
              description: "Attack the change.",
              supportedModelProfileIds: ["critic_adversarial"],
              producesEvidenceIds: ["adversarial_test_report"],
              enabledByDefault: true
            }
          ],
          modelProfileRegistry
        })
    ).toThrow(/references unsupported model profile/);
  });

  it("fails fast when the registry is empty", () => {
    expect(
      () =>
        new WorkflowCapabilityRegistry({
          definitions: [],
          modelProfileRegistry
        })
    ).toThrow(/requires at least one capability definition/i);
  });
});
