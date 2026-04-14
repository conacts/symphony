import { afterEach, describe, expect, it } from "vitest";
import {
  createSymphonyCapabilityPreset,
  createSymphonyIntelligentFlowModuleRegistry,
  createSymphonyTicketExecutionContract,
  listSymphonyIntelligentFlowDefaultModuleDefinitions,
  type SymphonyCapabilityPresetPolicyId,
  type SymphonyWorkflowCapabilityPreset
} from "@symphony/router";
import type {
  SymphonyTrackerIssue
} from "@symphony/tracker";
import {
  CapabilityRouterProofHarness,
  createCapabilityScenarioExecutionEngine
} from "../test-support/capability-router-proof-harness.js";

let harness: CapabilityRouterProofHarness | null = null;

afterEach(async () => {
  await harness?.cleanup();
  harness = null;
});

describe("intelligent-flow golden paths", () => {
  it("routes a simple implementation-only contract to completion readiness", async () => {
    harness = await CapabilityRouterProofHarness.create({
      presetId: "intelligent-flow",
      createContract: createContractFactory({
        requiredCapabilityIds: ["implement.spec"],
        requiredEvidenceIds: ["change_set"]
      }),
      createIntelligentFlowCapabilityPreset: createNeutralCapabilityPresetFactory()
    });

    const implementation = await harness.advance({
      recordedAt: "2026-04-13T11:00:00.000Z"
    });
    const projection = await harness.projection();

    expect(implementation.kind).toBe("executed");
    if (implementation.kind !== "executed") {
      throw new TypeError("Expected implementation advance to execute.");
    }

    expect(implementation.planning.plan).toEqual(
      expect.objectContaining({
        kind: "execute",
        decision: expect.objectContaining({
          capabilityId: "implement.spec",
          workEpoch: 1
        })
      })
    );
    expect(implementation.planning.decision.intelligentFlowRouterDecision).toEqual(
      expect.objectContaining({
        selectedModuleId: "implement.spec",
        selectionMode: "deterministic"
      })
    );
    expect(implementation.nextPlanning.plan).toEqual(
      expect.objectContaining({
        kind: "ready_for_manual_completion",
        evaluation: expect.objectContaining({
          result: "ready_for_manual_completion",
          missingCapabilityIds: [],
          missingEvidenceIds: []
        })
      })
    );
    expect(projection.evidenceByEpoch).toEqual([
      expect.objectContaining({
        workEpoch: 1,
        evidence: expect.arrayContaining([
          expect.objectContaining({
            evidenceId: "change_set"
          })
        ])
      })
    ]);
  });

  it("routes implementation into code review under the default intelligent-flow policy", async () => {
    harness = await CapabilityRouterProofHarness.create({
      presetId: "intelligent-flow",
      policyId: "default"
    });

    const implementation = await harness.advance({
      recordedAt: "2026-04-13T11:10:00.000Z",
      policyId: "default"
    });
    const review = await harness.advance({
      recordedAt: "2026-04-13T11:11:00.000Z",
      policyId: "default"
    });
    const projection = await harness.projection();

    expect(implementation.kind).toBe("executed");
    expect(review.kind).toBe("executed");
    if (implementation.kind !== "executed" || review.kind !== "executed") {
      throw new TypeError("Expected implementation and review advances to execute.");
    }

    expect(implementation.nextPlanning.plan).toEqual(
      expect.objectContaining({
        kind: "execute",
        decision: expect.objectContaining({
          capabilityId: "critic.code_review",
          workEpoch: 1
        })
      })
    );
    expect(review.planning.decision.intelligentFlowRouterDecision).toEqual(
      expect.objectContaining({
        selectedModuleId: "critic.code_review",
        selectionMode: "deterministic"
      })
    );
    expect(review.nextPlanning.plan).toEqual(
      expect.objectContaining({
        kind: "ready_for_manual_completion",
        evaluation: expect.objectContaining({
          result: "ready_for_manual_completion"
        })
      })
    );
    expect(projection.evidenceByEpoch).toEqual([
      expect.objectContaining({
        workEpoch: 1,
        evidence: expect.arrayContaining([
          expect.objectContaining({
            evidenceId: "change_set"
          }),
          expect.objectContaining({
            evidenceId: "code_review_report"
          })
        ])
      })
    ]);
  });

  it("routes implementation into browser verification when the browser module is enabled for tests", async () => {
    harness = await CapabilityRouterProofHarness.create({
      presetId: "intelligent-flow",
      createContract: createContractFactory({
        requiredCapabilityIds: ["implement.spec", "critic.browser_test"],
        requiredEvidenceIds: ["change_set", "browser_test_report"],
        allowedModelProfileIds: ["builder_fast", "builder_deep", "critic_browser"]
      }),
      createIntelligentFlowCapabilityPreset: createNeutralCapabilityPresetFactory({
        enableBrowser: true
      }),
      intelligentFlowModuleRegistry: createBrowserEnabledModuleRegistry()
    });

    const implementation = await harness.advance({
      recordedAt: "2026-04-13T11:20:00.000Z"
    });
    const browser = await harness.advance({
      recordedAt: "2026-04-13T11:21:00.000Z"
    });
    const projection = await harness.projection();

    expect(implementation.kind).toBe("executed");
    expect(browser.kind).toBe("executed");
    if (implementation.kind !== "executed" || browser.kind !== "executed") {
      throw new TypeError("Expected implementation and browser advances to execute.");
    }

    expect(implementation.nextPlanning.plan).toEqual(
      expect.objectContaining({
        kind: "execute",
        decision: expect.objectContaining({
          capabilityId: "critic.browser_test",
          modelProfileId: "critic_browser",
          workEpoch: 1
        })
      })
    );
    expect(browser.nextPlanning.plan).toEqual(
      expect.objectContaining({
        kind: "ready_for_manual_completion",
        evaluation: expect.objectContaining({
          result: "ready_for_manual_completion"
        })
      })
    );
    expect(projection.evidenceByEpoch).toEqual([
      expect.objectContaining({
        workEpoch: 1,
        evidence: expect.arrayContaining([
          expect.objectContaining({
            evidenceId: "change_set"
          }),
          expect.objectContaining({
            evidenceId: "browser_test_report"
          })
        ])
      })
    ]);
  });

  it("moves the lifecycle shell into awaiting_input and resumes the same capability after clarification", async () => {
    harness = await CapabilityRouterProofHarness.create({
      presetId: "intelligent-flow",
      createContract: createContractFactory({
        requiredCapabilityIds: ["implement.spec"],
        requiredEvidenceIds: ["change_set"]
      }),
      createIntelligentFlowCapabilityPreset: createNeutralCapabilityPresetFactory(),
      createEngine: () =>
        createCapabilityScenarioExecutionEngine({
          outcomes: {
            "implement.spec:1:1": "clarification_requested",
            "implement.spec:1:2": "completed"
          }
        })
    });

    const clarificationAdvance = await harness.advance({
      recordedAt: "2026-04-13T11:30:00.000Z"
    });

    expect(clarificationAdvance.kind).toBe("executed");
    if (clarificationAdvance.kind !== "executed") {
      throw new TypeError("Expected clarification advance to execute.");
    }

    expect(clarificationAdvance.nextPlanning.plan).toEqual(
      expect.objectContaining({
        kind: "awaiting_input"
      })
    );
    expect((await harness.loadLifecycleAuthority()).currentNode).toBe(
      "awaiting_input"
    );

    await harness.answerPendingClarification({
      recordedAt: "2026-04-13T11:31:00.000Z",
      answers: {
        question_1: "Proceed with the strict JSON contract and continue."
      }
    });

    expect((await harness.loadLifecycleAuthority()).currentNode).toBe("claimed");

    const resumedAdvance = await harness.advance({
      recordedAt: "2026-04-13T11:32:00.000Z"
    });

    expect(resumedAdvance.kind).toBe("executed");
    if (resumedAdvance.kind !== "executed") {
      throw new TypeError("Expected resumed advance to execute.");
    }

    expect(resumedAdvance.planning.plan).toEqual(
      expect.objectContaining({
        kind: "execute",
        decision: expect.objectContaining({
          capabilityId: "implement.spec",
          workEpoch: 1
        })
      })
    );
    expect(resumedAdvance.execution.result).toEqual(
      expect.objectContaining({
        kind: "completed",
        capabilityId: "implement.spec",
        workEpoch: 1,
        attempt: 2
      })
    );
    expect(resumedAdvance.nextPlanning.plan.kind).toBe("ready_for_manual_completion");
  });

  it("moves the lifecycle shell into blocked after implementation emits a blocked outcome", async () => {
    harness = await CapabilityRouterProofHarness.create({
      presetId: "intelligent-flow",
      createContract: createContractFactory({
        requiredCapabilityIds: ["implement.spec"],
        requiredEvidenceIds: ["change_set"]
      }),
      createIntelligentFlowCapabilityPreset: createNeutralCapabilityPresetFactory(),
      createEngine: () =>
        createCapabilityScenarioExecutionEngine({
          outcomes: {
            "implement.spec:1:1": "blocked"
          }
        })
    });

    const blockedAdvance = await harness.advance({
      recordedAt: "2026-04-13T11:40:00.000Z"
    });
    const followUp = await harness.advance({
      recordedAt: "2026-04-13T11:41:00.000Z"
    });

    expect(blockedAdvance.kind).toBe("executed");
    if (blockedAdvance.kind !== "executed") {
      throw new TypeError("Expected blocked advance to execute.");
    }

    expect(blockedAdvance.execution.result).toEqual(
      expect.objectContaining({
        kind: "blocked",
        capabilityId: "implement.spec"
      })
    );
    expect(blockedAdvance.nextPlanning.plan).toEqual(
      expect.objectContaining({
        kind: "blocked",
        reason: "Blocked while executing implement.spec."
      })
    );
    expect((await harness.loadLifecycleAuthority()).currentNode).toBe("blocked");
    expect(followUp.kind).toBe("not_executed");
    if (followUp.kind !== "not_executed") {
      throw new TypeError("Expected blocked follow-up planning to stop execution.");
    }

    expect(followUp.planning.plan).toEqual(
      expect.objectContaining({
        kind: "blocked"
      })
    );
  });

  it("falls back to the deterministic choice when the selector returns an inadmissible module", async () => {
    harness = await CapabilityRouterProofHarness.create({
      presetId: "intelligent-flow",
      policyId: "backend_strict",
      intelligentFlowSelector: {
        async select() {
          return {
            response: {
              selectedModuleId: "critic.browser_test",
              reason: "Browser verification looks safest.",
              confidence: 0.68,
              deferToDeterministicFallback: false
            },
            model: "test-intelligent-selector",
            providerBaseUrl: "https://selector.test/v1",
            rawResponse: {
              ok: true
            }
          };
        }
      }
    });

    const implementation = await harness.advance({
      recordedAt: "2026-04-13T11:50:00.000Z",
      policyId: "backend_strict"
    });

    expect(implementation.kind).toBe("executed");
    if (implementation.kind !== "executed") {
      throw new TypeError("Expected implementation advance to execute.");
    }

    expect(implementation.nextPlanning.plan).toEqual(
      expect.objectContaining({
        kind: "execute",
        decision: expect.objectContaining({
          capabilityId: "critic.code_review",
          workEpoch: 1
        })
      })
    );
    expect(implementation.nextPlanning.decision.intelligentFlowRouterDecision).toEqual(
      expect.objectContaining({
        selectedModuleId: "critic.code_review",
        selectionMode: "fallback_default",
        fallbackReason: expect.stringContaining("critic.browser_test")
      })
    );
  });

  it("moves the lifecycle shell to done after completion readiness is observed as Done", async () => {
    harness = await CapabilityRouterProofHarness.create({
      presetId: "intelligent-flow",
      createContract: createContractFactory({
        requiredCapabilityIds: ["implement.spec"],
        requiredEvidenceIds: ["change_set"]
      }),
      createIntelligentFlowCapabilityPreset: createNeutralCapabilityPresetFactory()
    });

    const implementation = await harness.advance({
      recordedAt: "2026-04-13T12:00:00.000Z"
    });

    expect(implementation.kind).toBe("executed");
    if (implementation.kind !== "executed") {
      throw new TypeError("Expected implementation advance to execute.");
    }

    expect(implementation.nextPlanning.plan.kind).toBe("ready_for_manual_completion");

    await harness.observeTrackerState({
      recordedAt: "2026-04-13T12:01:00.000Z",
      state: "Done"
    });

    expect((await harness.loadLifecycleAuthority()).currentNode).toBe("done");
  });
});

function createNeutralCapabilityPresetFactory(input: {
  enableBrowser?: boolean;
} = {}) {
  return (
    factoryInput: {
      policyId?: SymphonyCapabilityPresetPolicyId;
    } = {}
  ): SymphonyWorkflowCapabilityPreset => {
    const { policyId } = factoryInput;
    const preset = createSymphonyCapabilityPreset({
      policyId
    });
    const capabilities = preset.capabilities.map((definition) =>
      definition.id === "critic.browser_test"
        ? {
            ...definition,
            enabledByDefault: input.enableBrowser ?? false
          }
        : {
            ...definition
          }
    );

    return {
      capabilities,
      modelProfiles: preset.modelProfiles.map((profile) => ({
        ...profile
      })),
      defaultPolicy: {
        requiredCapabilityIds: [],
        preferredCapabilityIds: [],
        forbiddenCapabilityIds: [],
        requiredEvidenceIds: [],
        allowedModelProfileIds: preset.modelProfiles.map((profile) => profile.id),
        completionPolicy: {
          mode: "manual"
        },
        clarificationPolicy: {
          mode: "required"
        },
        reviewStrictness: "strict",
        maxRetryCount: 2,
        mergePolicy: "manual"
      }
    };
  };
}

function createBrowserEnabledModuleRegistry() {
  return createSymphonyIntelligentFlowModuleRegistry({
    definitions: listSymphonyIntelligentFlowDefaultModuleDefinitions().map(
      (definition) =>
        definition.id === "critic.browser_test"
          ? {
              ...definition,
              enabledByDefault: true
            }
          : definition
    ),
    runtimeSupport: {
      browser_automation: true
    }
  });
}

function createContractFactory(input: {
  requiredCapabilityIds: Array<
    "implement.spec" | "critic.code_review" | "critic.adversarial_tests" | "critic.browser_test"
  >;
  requiredEvidenceIds: Array<
    "change_set" | "code_review_report" | "adversarial_test_report" | "browser_test_report"
  >;
  preferredCapabilityIds?: Array<
    "implement.spec" | "critic.code_review" | "critic.adversarial_tests" | "critic.browser_test"
  >;
  forbiddenCapabilityIds?: Array<
    "implement.spec" | "critic.code_review" | "critic.adversarial_tests" | "critic.browser_test"
  >;
  allowedModelProfileIds?: Array<
    "builder_fast" | "builder_deep" | "critic_strict" | "critic_adversarial" | "critic_browser"
  >;
}) {
  return ({
    workflowId,
    issue,
    repositoryKey,
    recordedAt
  }: {
    workflowId: string;
    issue: SymphonyTrackerIssue;
    repositoryKey: string;
    recordedAt: string;
  }) =>
    createSymphonyTicketExecutionContract({
      contractId: `contract_${workflowId}`,
      workflowId,
      issueIdentifier: issue.identifier,
      repositoryKey,
      summary: issue.title,
      objective: "Prove the intelligent-flow golden path end to end.",
      doneDefinition: "The required module evidence is recorded and the shell state is consistent.",
      mergePolicy: "manual",
      routingDirectives: {
        requiredCapabilityIds: [...input.requiredCapabilityIds],
        preferredCapabilityIds: [...(input.preferredCapabilityIds ?? [])],
        forbiddenCapabilityIds: [...(input.forbiddenCapabilityIds ?? [])],
        requiredEvidenceIds: [...input.requiredEvidenceIds],
        allowedModelProfileIds: [
          ...(input.allowedModelProfileIds ?? [
            "builder_fast",
            "builder_deep",
            "critic_strict",
            "critic_adversarial",
            "critic_browser"
          ])
        ],
        completionPolicy: {
          mode: "manual"
        },
        clarificationPolicy: {
          mode: "required"
        },
        reviewStrictness: "strict",
        maxRetryCount: 2
      },
      createdAt: recordedAt,
      updatedAt: recordedAt
    });
}
