import { describe, expect, it } from "vitest";
import type {
  WorkflowCapabilityDefinition,
  WorkflowModelProfileDefinition,
  WorkflowResolvedRoutingPolicy
} from "../types/index.js";
import { resolveWorkflowRoutingPolicy } from "./routing-policy-resolver.js";

type TestCapabilityId =
  | "implement.spec"
  | "critic.code_review"
  | "critic.adversarial_tests"
  | "critic.browser_test";
type TestEvidenceId =
  | "change_set"
  | "code_review_report"
  | "adversarial_test_report"
  | "browser_test_report";
type TestProfileId =
  | "builder_fast"
  | "builder_deep"
  | "critic_strict"
  | "critic_adversarial"
  | "critic_browser";

const capabilityDefinitions: WorkflowCapabilityDefinition<
  TestCapabilityId,
  TestEvidenceId,
  TestProfileId
>[] = [
  {
    id: "implement.spec",
    phase: "implementing",
    description: "Implement the requested specification.",
    supportedModelProfileIds: ["builder_fast", "builder_deep"],
    producesEvidenceIds: ["change_set"],
    enabledByDefault: true
  },
  {
    id: "critic.code_review",
    phase: "verifying",
    description: "Review the proposed code change.",
    supportedModelProfileIds: ["critic_strict", "critic_adversarial"],
    producesEvidenceIds: ["code_review_report"],
    enabledByDefault: true
  },
  {
    id: "critic.adversarial_tests",
    phase: "verifying",
    description: "Run adversarial tests against the change.",
    supportedModelProfileIds: ["critic_adversarial"],
    producesEvidenceIds: ["adversarial_test_report"],
    enabledByDefault: true
  },
  {
    id: "critic.browser_test",
    phase: "verifying",
    description: "Run browser verification.",
    supportedModelProfileIds: ["critic_browser"],
    producesEvidenceIds: ["browser_test_report"],
    enabledByDefault: false
  }
];

const modelProfiles: WorkflowModelProfileDefinition<TestProfileId>[] = [
  {
    id: "builder_fast",
    label: "Builder Fast",
    description: null
  },
  {
    id: "builder_deep",
    label: "Builder Deep",
    description: null
  },
  {
    id: "critic_strict",
    label: "Critic Strict",
    description: null
  },
  {
    id: "critic_adversarial",
    label: "Critic Adversarial",
    description: null
  },
  {
    id: "critic_browser",
    label: "Critic Browser",
    description: null
  }
];

describe("routing policy resolver", () => {
  it("fails fast when a capability becomes both required and forbidden", () => {
    expect(() =>
      resolveWorkflowRoutingPolicy({
        capabilityDefinitions,
        modelProfiles,
        presetPolicy: createPresetPolicy(),
        ticketDirectives: {
          forbiddenCapabilityIds: ["implement.spec"]
        }
      })
    ).toThrow(/both required and forbidden/i);
  });

  it("fails fast when allowed model profiles intersect to an empty set", () => {
    expect(() =>
      resolveWorkflowRoutingPolicy({
        capabilityDefinitions,
        modelProfiles,
        presetPolicy: createPresetPolicy({
          allowedModelProfileIds: ["builder_fast"]
        }),
        userDefaults: {
          allowedModelProfileIds: ["critic_strict"]
        }
      })
    ).toThrow(/empty allowed model profile intersection/i);
  });

  it("fails fast when the merged policy requires impossible evidence", () => {
    expect(() =>
      resolveWorkflowRoutingPolicy({
        capabilityDefinitions,
        modelProfiles,
        presetPolicy: createPresetPolicy({
          requiredEvidenceIds: ["change_set", "browser_test_report"],
          allowedModelProfileIds: ["builder_fast", "critic_strict"]
        })
      })
    ).toThrow(/no admissible capability can produce it/i);
  });

  it("fails fast when the merged policy requires a disabled capability", () => {
    expect(() =>
      resolveWorkflowRoutingPolicy({
        capabilityDefinitions,
        modelProfiles,
        presetPolicy: createPresetPolicy({
          requiredCapabilityIds: ["implement.spec", "critic.browser_test"],
          preferredCapabilityIds: [],
          forbiddenCapabilityIds: [],
          requiredEvidenceIds: ["change_set"],
          allowedModelProfileIds: ["builder_fast", "critic_browser"]
        })
      })
    ).toThrow(/disabled by default/i);
  });

  it("fails fast when required evidence can only be produced by a disabled capability", () => {
    expect(() =>
      resolveWorkflowRoutingPolicy({
        capabilityDefinitions,
        modelProfiles,
        presetPolicy: createPresetPolicy({
          requiredCapabilityIds: ["implement.spec"],
          preferredCapabilityIds: [],
          forbiddenCapabilityIds: [],
          requiredEvidenceIds: ["change_set", "browser_test_report"],
          allowedModelProfileIds: ["builder_fast", "critic_browser"]
        })
      })
    ).toThrow(/no admissible capability can produce it/i);
  });

  it("preserves preset hard requirements even when a ticket tries to weaken them", () => {
    const resolved = resolveWorkflowRoutingPolicy({
      capabilityDefinitions,
      modelProfiles,
      presetPolicy: createPresetPolicy({
        requiredCapabilityIds: ["implement.spec", "critic.code_review"],
        requiredEvidenceIds: ["change_set", "code_review_report"],
        allowedModelProfileIds: ["builder_deep", "critic_strict"],
        completionPolicy: {
          mode: "manual"
        },
        clarificationPolicy: {
          mode: "required"
        },
        reviewStrictness: "strict",
        maxRetryCount: 2,
        mergePolicy: "manual"
      }),
      ticketDirectives: {
        allowedModelProfileIds: [
          "builder_fast",
          "builder_deep",
          "critic_strict",
          "critic_adversarial"
        ],
        completionPolicy: {
          mode: "auto"
        },
        clarificationPolicy: {
          mode: "best_effort"
        },
        reviewStrictness: "standard",
        maxRetryCount: 5,
        mergePolicy: "auto_merge"
      }
    });

    expect(resolved.requiredCapabilityIds).toEqual([
      "implement.spec",
      "critic.code_review"
    ]);
    expect(resolved.requiredEvidenceIds).toEqual([
      "change_set",
      "code_review_report"
    ]);
    expect(resolved.allowedModelProfileIds).toEqual([
      "builder_deep",
      "critic_strict"
    ]);
    expect(resolved.completionPolicy.mode).toBe("manual");
    expect(resolved.clarificationPolicy.mode).toBe("required");
    expect(resolved.reviewStrictness).toBe("strict");
    expect(resolved.maxRetryCount).toBe(2);
    expect(resolved.mergePolicy).toBe("manual");
  });

  it("applies strict overrides and specific preferences without creating contradictions", () => {
    const resolved = resolveWorkflowRoutingPolicy({
      capabilityDefinitions,
      modelProfiles,
      presetPolicy: createPresetPolicy({
        preferredCapabilityIds: ["critic.code_review"],
        allowedModelProfileIds: [
          "builder_fast",
          "critic_strict",
          "critic_adversarial"
        ],
        completionPolicy: {
          mode: "auto"
        },
        clarificationPolicy: {
          mode: "best_effort"
        },
        reviewStrictness: "standard",
        maxRetryCount: 4,
        mergePolicy: "auto_merge"
      }),
      userDefaults: {
        reviewStrictness: "strict",
        maxRetryCount: 2
      },
      ticketDirectives: {
        preferredCapabilityIds: ["critic.adversarial_tests"],
        requiredEvidenceIds: ["adversarial_test_report"],
        allowedModelProfileIds: ["builder_fast", "critic_adversarial"],
        completionPolicy: {
          mode: "manual"
        },
        clarificationPolicy: {
          mode: "required"
        },
        reviewStrictness: "adversarial"
      }
    });

    expect(resolved.preferredCapabilityIds).toEqual([
      "critic.adversarial_tests",
      "critic.code_review"
    ]);
    expect(resolved.allowedModelProfileIds).toEqual([
      "builder_fast",
      "critic_adversarial"
    ]);
    expect(resolved.requiredEvidenceIds).toEqual([
      "change_set",
      "code_review_report",
      "adversarial_test_report"
    ]);
    expect(resolved.completionPolicy.mode).toBe("manual");
    expect(resolved.clarificationPolicy.mode).toBe("required");
    expect(resolved.reviewStrictness).toBe("adversarial");
    expect(resolved.maxRetryCount).toBe(2);
    expect(resolved.mergePolicy).toBe("auto_merge");
  });
});

function createPresetPolicy(
  overrides: Partial<
    WorkflowResolvedRoutingPolicy<TestCapabilityId, TestEvidenceId, TestProfileId>
  > = {}
): WorkflowResolvedRoutingPolicy<
  TestCapabilityId,
  TestEvidenceId,
  TestProfileId
> {
  return {
    requiredCapabilityIds: ["implement.spec"],
    preferredCapabilityIds: ["critic.code_review"],
    forbiddenCapabilityIds: [],
    requiredEvidenceIds: ["change_set", "code_review_report"],
    allowedModelProfileIds: ["builder_fast", "critic_strict"],
    completionPolicy: {
      mode: "auto"
    },
    clarificationPolicy: {
      mode: "best_effort"
    },
    reviewStrictness: "standard",
    maxRetryCount: 3,
    mergePolicy: "auto_merge",
    ...overrides
  };
}
