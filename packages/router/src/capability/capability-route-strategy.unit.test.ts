import { describe, expect, it } from "vitest";
import {
  createDeterministicWorkflowCapabilityRouteStrategy,
  selectDeterministicWorkflowCapabilityRoute
} from "./capability-route-strategy.js";
import type {
  WorkflowCapabilityCandidate,
  WorkflowResolvedRoutingPolicy
} from "../types/index.js";

describe("capability route strategy", () => {
  it("selects a required capability before a merely preferred capability", () => {
    const selection = selectDeterministicWorkflowCapabilityRoute({
      candidates: [
        candidate({
          capabilityId: "critic.code_review",
          priority: 10,
          required: false,
          preferred: true,
          allowedModelProfileIds: ["critic_strict"]
        }),
        candidate({
          capabilityId: "implement.spec",
          priority: 1,
          required: true,
          preferred: false,
          allowedModelProfileIds: ["builder_fast", "builder_deep"]
        })
      ],
      resolvedPolicy: resolvedPolicy(),
      decisionId: "decision_required",
      decidedAt: "2026-04-12T23:40:00.000Z"
    });

    expect(selection).toEqual({
      candidate: expect.objectContaining({
        capabilityId: "implement.spec"
      }),
      decision: expect.objectContaining({
        decisionId: "decision_required",
        capabilityId: "implement.spec",
        modelProfileId: "builder_fast",
        workEpoch: 1
      })
    });
  });

  it("uses deterministic tie-breaking when candidates have the same rank", () => {
    const selection = selectDeterministicWorkflowCapabilityRoute({
      candidates: [
        candidate({
          capabilityId: "critic.code_review",
          priority: 50,
          required: false,
          preferred: false,
          allowedModelProfileIds: ["critic_strict"]
        }),
        candidate({
          capabilityId: "critic.adversarial_tests",
          priority: 50,
          required: false,
          preferred: false,
          allowedModelProfileIds: ["critic_adversarial"]
        })
      ],
      resolvedPolicy: resolvedPolicy(),
      decisionId: "decision_tie_break",
      decidedAt: "2026-04-12T23:41:00.000Z"
    });

    expect(selection?.candidate.capabilityId).toBe("critic.adversarial_tests");
    expect(selection?.decision.modelProfileId).toBe("critic_adversarial");
  });

  it("applies preferred profile bias within the candidate's allowed model profiles", () => {
    const selection = selectDeterministicWorkflowCapabilityRoute({
      candidates: [
        candidate({
          capabilityId: "implement.spec",
          allowedModelProfileIds: ["builder_deep", "builder_fast"]
        })
      ],
      resolvedPolicy: resolvedPolicy(),
      decisionId: "decision_profile_bias",
      decidedAt: "2026-04-12T23:42:00.000Z"
    });

    expect(selection?.decision.modelProfileId).toBe("builder_deep");
  });

  it("rejects forbidden candidates", () => {
    expect(() =>
      selectDeterministicWorkflowCapabilityRoute({
        candidates: [
          candidate({
            capabilityId: "critic.code_review",
            allowedModelProfileIds: ["critic_strict"]
          })
        ],
        resolvedPolicy: resolvedPolicy({
          forbiddenCapabilityIds: ["critic.code_review"]
        }),
        decisionId: "decision_forbidden",
        decidedAt: "2026-04-12T23:43:00.000Z"
      })
    ).toThrowError(
      'Capability route strategy cannot choose forbidden capability "critic.code_review".'
    );
  });

  it("rejects unsupported profiles", () => {
    expect(() =>
      selectDeterministicWorkflowCapabilityRoute({
        candidates: [
          candidate({
            capabilityId: "implement.spec",
            allowedModelProfileIds: ["critic_browser"]
          })
        ],
        resolvedPolicy: resolvedPolicy(),
        decisionId: "decision_bad_profile",
        decidedAt: "2026-04-12T23:44:00.000Z"
      })
    ).toThrowError(
      'Capability route strategy cannot choose unsupported model profile "critic_browser" for capability "implement.spec".'
    );
  });

  it("exposes the deterministic strategy through the strategy factory", () => {
    const strategy = createDeterministicWorkflowCapabilityRouteStrategy<
      string,
      string,
      string
    >();

    expect(strategy.kind).toBe("deterministic");
    expect(
      strategy.select({
        candidates: [
          candidate({
            capabilityId: "implement.spec",
            allowedModelProfileIds: ["builder_fast"]
          })
        ],
        resolvedPolicy: resolvedPolicy(),
        decisionId: "decision_factory",
        decidedAt: "2026-04-12T23:45:00.000Z"
      })
    ).toEqual({
      candidate: expect.objectContaining({
        capabilityId: "implement.spec"
      }),
      decision: expect.objectContaining({
        decisionId: "decision_factory",
        modelProfileId: "builder_fast"
      })
    });
  });
});

function candidate(
  overrides: Partial<WorkflowCapabilityCandidate<string, string>> & {
    capabilityId: string;
  }
): WorkflowCapabilityCandidate<string, string> {
  return {
    capabilityId: overrides.capabilityId,
    phase: overrides.phase ?? "verifying",
    workEpoch: overrides.workEpoch ?? 1,
    priority: overrides.priority ?? 100,
    required: overrides.required ?? false,
    preferred: overrides.preferred ?? false,
    allowedModelProfileIds: overrides.allowedModelProfileIds ?? ["builder_fast"],
    reason: overrides.reason ?? "Candidate is admissible."
  };
}

function resolvedPolicy(
  overrides: Partial<WorkflowResolvedRoutingPolicy<string, string, string>> = {}
): WorkflowResolvedRoutingPolicy<string, string, string> {
  const base: WorkflowResolvedRoutingPolicy<string, string, string> = {
    requiredCapabilityIds: [],
    preferredCapabilityIds: [],
    forbiddenCapabilityIds: [],
    requiredEvidenceIds: [],
    allowedModelProfileIds: [
      "builder_fast",
      "builder_deep",
      "critic_strict",
      "critic_adversarial"
    ],
    clarificationPolicy: { mode: "required" },
    reviewStrictness: "strict",
    maxRetryCount: 1
  };

  return {
    ...base,
    ...overrides,
    clarificationPolicy:
      overrides.clarificationPolicy ?? base.clarificationPolicy
  };
}
