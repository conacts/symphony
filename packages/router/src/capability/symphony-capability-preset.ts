import { createWorkflowCapabilityRegistry } from "./capability-registry.js";
import { createWorkflowModelProfileRegistry } from "./model-profile-registry.js";
import { resolveWorkflowRoutingPolicy } from "./routing-policy-resolver.js";
import {
  symphonyCapabilityDefinitionSchema,
  symphonyModelProfileDefinitionSchema,
  type SymphonyCapabilityEvidenceId,
  type SymphonyCapabilityId,
  type SymphonyCapabilityModelProfileId,
  type SymphonyWorkflowCapabilityDefinition,
  type SymphonyWorkflowModelProfileDefinition
} from "./symphony-capability-contract.js";
import type {
  WorkflowCapabilityPreset,
  WorkflowResolvedRoutingPolicy
} from "../types/index.js";

export type SymphonyCapabilityPresetPolicyId = "default" | "backend_strict";

export type SymphonyWorkflowCapabilityPreset = WorkflowCapabilityPreset<
  SymphonyCapabilityId,
  SymphonyCapabilityEvidenceId,
  SymphonyCapabilityModelProfileId
>;

type SymphonyPresetRoutingPolicy = WorkflowResolvedRoutingPolicy<
  SymphonyCapabilityId,
  SymphonyCapabilityEvidenceId,
  SymphonyCapabilityModelProfileId
>;

const symphonyCapabilityDefinitions: SymphonyWorkflowCapabilityDefinition[] = [
  symphonyCapabilityDefinitionSchema.parse({
    id: "implement.spec",
    phase: "implementing",
    description: "Implements the requested ticket slice and produces the canonical change set.",
    supportedModelProfileIds: ["builder_fast", "builder_deep"],
    producesEvidenceIds: ["change_set"],
    enabledByDefault: true
  }),
  symphonyCapabilityDefinitionSchema.parse({
    id: "critic.code_review",
    phase: "verifying",
    description: "Reviews the implementation for correctness, regressions, and contract drift.",
    supportedModelProfileIds: ["critic_strict"],
    producesEvidenceIds: ["code_review_report"],
    enabledByDefault: true
  }),
  symphonyCapabilityDefinitionSchema.parse({
    id: "critic.adversarial_tests",
    phase: "verifying",
    description: "Exercises the change with hostile and edge-case verification before completion.",
    supportedModelProfileIds: ["critic_adversarial"],
    producesEvidenceIds: ["adversarial_test_report"],
    enabledByDefault: true
  }),
  symphonyCapabilityDefinitionSchema.parse({
    id: "critic.browser_test",
    phase: "verifying",
    description: "Reserved browser verification capability until the execution substrate is wired.",
    supportedModelProfileIds: ["critic_browser"],
    producesEvidenceIds: ["browser_test_report"],
    enabledByDefault: false
  })
];

const symphonyModelProfiles: SymphonyWorkflowModelProfileDefinition[] = [
  symphonyModelProfileDefinitionSchema.parse({
    id: "builder_fast",
    label: "Builder Fast",
    description: "Fast implementation profile for low-ambiguity ticket slices."
  }),
  symphonyModelProfileDefinitionSchema.parse({
    id: "builder_deep",
    label: "Builder Deep",
    description: "Higher-depth implementation profile for larger or more coupled changes."
  }),
  symphonyModelProfileDefinitionSchema.parse({
    id: "critic_strict",
    label: "Critic Strict",
    description: "Strict review profile focused on behavioral regressions and contract gaps."
  }),
  symphonyModelProfileDefinitionSchema.parse({
    id: "critic_adversarial",
    label: "Critic Adversarial",
    description: "Adversarial verification profile for backend-oriented edge cases."
  }),
  symphonyModelProfileDefinitionSchema.parse({
    id: "critic_browser",
    label: "Critic Browser",
    description: "Browser verification profile kept registered while browser execution remains stubbed."
  })
];

export function createSymphonyCapabilityPreset(input: {
  policyId?: SymphonyCapabilityPresetPolicyId;
} = {}): SymphonyWorkflowCapabilityPreset {
  const modelProfiles = cloneModelProfiles();
  const modelProfileRegistry = createWorkflowModelProfileRegistry(modelProfiles);
  const capabilities = cloneCapabilityDefinitions();

  createWorkflowCapabilityRegistry({
    definitions: capabilities,
    modelProfileRegistry
  });

  const defaultPolicy = resolveWorkflowRoutingPolicy({
    capabilityDefinitions: capabilities,
    modelProfiles,
    presetPolicy: createPresetRoutingPolicy(input.policyId ?? "default")
  });

  return {
    capabilities,
    modelProfiles,
    defaultPolicy
  };
}

function createPresetRoutingPolicy(
  policyId: SymphonyCapabilityPresetPolicyId
): SymphonyPresetRoutingPolicy {
  switch (policyId) {
    case "default":
      return {
        requiredCapabilityIds: ["implement.spec", "critic.code_review"],
        preferredCapabilityIds: [],
        forbiddenCapabilityIds: ["critic.browser_test"],
        requiredEvidenceIds: ["change_set", "code_review_report"],
        allowedModelProfileIds: [
          "builder_fast",
          "builder_deep",
          "critic_strict",
          "critic_adversarial"
        ],
        completionPolicy: {
          mode: "manual"
        },
        clarificationPolicy: {
          mode: "required"
        },
        reviewStrictness: "strict",
        maxRetryCount: 2,
        mergePolicy: "manual"
      };
    case "backend_strict":
      return {
        requiredCapabilityIds: ["implement.spec", "critic.code_review"],
        preferredCapabilityIds: ["critic.adversarial_tests"],
        forbiddenCapabilityIds: ["critic.browser_test"],
        requiredEvidenceIds: [
          "change_set",
          "code_review_report",
          "adversarial_test_report"
        ],
        allowedModelProfileIds: [
          "builder_fast",
          "builder_deep",
          "critic_strict",
          "critic_adversarial"
        ],
        completionPolicy: {
          mode: "manual"
        },
        clarificationPolicy: {
          mode: "required"
        },
        reviewStrictness: "adversarial",
        maxRetryCount: 2,
        mergePolicy: "manual"
      };
  }
}

function cloneCapabilityDefinitions(): SymphonyWorkflowCapabilityDefinition[] {
  return symphonyCapabilityDefinitions.map((definition) => ({
    ...definition,
    supportedModelProfileIds: [...definition.supportedModelProfileIds],
    producesEvidenceIds: [...definition.producesEvidenceIds]
  }));
}

function cloneModelProfiles(): SymphonyWorkflowModelProfileDefinition[] {
  return symphonyModelProfiles.map((definition) => ({
    ...definition
  }));
}
