import { describe, expect, it } from "vitest";
import {
  buildSymphonyIntelligentFlowAdmissibilitySnapshot,
  type SymphonyIntelligentFlowCapabilityProjection,
  type SymphonyIntelligentFlowResolvedRoutingPolicy
} from "./symphony-intelligent-flow-admissibility.js";
import {
  createSymphonyIntelligentFlowDefaultModuleRegistry,
  createSymphonyIntelligentFlowModuleRegistry
} from "./symphony-intelligent-flow-module-registry.js";
import {
  listSymphonyIntelligentFlowDefaultModuleDefinitions
} from "./symphony-intelligent-flow-contract.js";
import type {
  WorkflowCapabilityAttempt,
  WorkflowCapabilityEpochStatus
} from "../../types/index.js";

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
type TestModelProfileId =
  | "builder_fast"
  | "builder_deep"
  | "critic_strict"
  | "critic_adversarial"
  | "critic_browser";
type TestCapabilityAttempt = WorkflowCapabilityAttempt<
  TestCapabilityId,
  TestEvidenceId,
  TestModelProfileId
>;
type TestCapabilityEpochStatus = WorkflowCapabilityEpochStatus<
  TestCapabilityId,
  TestEvidenceId,
  TestModelProfileId
>;

describe("Symphony intelligent-flow admissibility", () => {
  it("builds the implementation candidate matrix when no evidence exists yet", () => {
    const snapshot = buildSymphonyIntelligentFlowAdmissibilitySnapshot({
      lifecycleState: "active",
      moduleRegistry: createSymphonyIntelligentFlowDefaultModuleRegistry(),
      resolvedPolicy: createResolvedPolicy({
        requiredCapabilityIds: ["implement.spec", "critic.code_review"],
        requiredEvidenceIds: ["change_set", "code_review_report"]
      }),
      projection: createProjection({
        phase: "implementing",
        workEpoch: 1
      })
    });

    expect(snapshot.admissible).toEqual([
      expect.objectContaining({
        moduleId: "implement.spec",
        rank: 0,
        reasonCode: "required_by_contract"
      })
    ]);
    expect(findRejected(snapshot, "critic.code_review")).toMatchObject({
      reasonCode: "missing_required_evidence"
    });
    expect(findRejected(snapshot, "critic.browser_test")).toMatchObject({
      reasonCode: "disabled_by_default"
    });
  });

  it("builds the verification candidate matrix after implementation evidence exists", () => {
    const snapshot = buildSymphonyIntelligentFlowAdmissibilitySnapshot({
      lifecycleState: "active",
      moduleRegistry: createSymphonyIntelligentFlowDefaultModuleRegistry(),
      resolvedPolicy: createResolvedPolicy({
        requiredCapabilityIds: ["implement.spec", "critic.code_review"],
        requiredEvidenceIds: ["change_set", "code_review_report"]
      }),
      projection: createProjection({
        phase: "verifying",
        workEpoch: 1,
        capabilityStatusesByEpoch: [
          {
            workEpoch: 1,
            stale: false,
            attempts: [
              completedCapabilityAttempt({
                capabilityId: "implement.spec",
                executionId: "exec_impl_1"
              })
            ]
          }
        ],
        evidenceByEpoch: [
          {
            workEpoch: 1,
            stale: false,
            evidence: [
              {
                evidenceId: "change_set",
                summary: "Implementation diff recorded.",
                artifacts: []
              }
            ]
          }
        ]
      })
    });

    expect(snapshot.admissible).toEqual([
      expect.objectContaining({
        moduleId: "critic.code_review",
        rank: 0,
        reasonCode: "required_by_contract"
      })
    ]);
    expect(findRejected(snapshot, "critic.adversarial_tests")).toMatchObject({
      reasonCode: "already_satisfied"
    });
  });

  it("blocks forward work while clarification is pending", () => {
    const snapshot = buildSymphonyIntelligentFlowAdmissibilitySnapshot({
      lifecycleState: "awaiting_input",
      moduleRegistry: createSymphonyIntelligentFlowDefaultModuleRegistry(),
      resolvedPolicy: createResolvedPolicy({
        requiredCapabilityIds: ["implement.spec", "critic.code_review"],
        requiredEvidenceIds: ["change_set", "code_review_report"]
      }),
      projection: createProjection({
        phase: "waiting_input",
        workEpoch: 1,
        pendingClarification: {
          requestId: "clarify_contract",
          raisedByCapabilityId: "implement.spec",
          workEpoch: 1,
          summary: "Need clarification before proceeding.",
          questions: [
            {
              id: "q1",
              prompt: "What response shape is expected?",
              context: null
            }
          ]
        }
      })
    });

    expect(snapshot.admissible).toEqual([]);
    expect(findRejected(snapshot, "implement.spec")).toMatchObject({
      reasonCode: "pending_clarification"
    });
    expect(findRejected(snapshot, "critic.code_review")).toMatchObject({
      reasonCode: "pending_clarification"
    });
  });

  it("emits no forward modules after the lifecycle shell enters blocked", () => {
    const snapshot = buildSymphonyIntelligentFlowAdmissibilitySnapshot({
      lifecycleState: "blocked",
      moduleRegistry: createSymphonyIntelligentFlowDefaultModuleRegistry(),
      resolvedPolicy: createResolvedPolicy({
        requiredCapabilityIds: ["implement.spec", "critic.code_review"],
        requiredEvidenceIds: ["change_set", "code_review_report"]
      }),
      projection: createProjection({
        phase: "blocked",
        workEpoch: 1,
        blockedReason: "Waiting on external credentials."
      })
    });

    expect(snapshot.admissible).toEqual([]);
    expect(findRejected(snapshot, "implement.spec")).toMatchObject({
      reasonCode: "blocked_by_lifecycle"
    });
    expect(findRejected(snapshot, "blocked.report")).toMatchObject({
      reasonCode: "blocked_by_lifecycle"
    });
  });

  it("admits browser verification only when the module is enabled and runtime support exists", () => {
    const enabledBrowserRegistry = createSymphonyIntelligentFlowModuleRegistry({
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
        browser_automation: false
      }
    });
    const supportedBrowserRegistry = createSymphonyIntelligentFlowModuleRegistry({
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
    const resolvedPolicy = createResolvedPolicy({
      requiredCapabilityIds: ["implement.spec", "critic.browser_test"],
      requiredEvidenceIds: ["change_set", "browser_test_report"]
    });
    const projection = createProjection({
      phase: "verifying",
      workEpoch: 1,
      capabilityStatusesByEpoch: [
        {
          workEpoch: 1,
          stale: false,
          attempts: [
            completedCapabilityAttempt({
              capabilityId: "implement.spec",
              executionId: "exec_impl_1"
            })
          ]
        }
      ],
      evidenceByEpoch: [
        {
          workEpoch: 1,
          stale: false,
          evidence: [
            {
              evidenceId: "change_set",
              summary: "Implementation diff recorded.",
              artifacts: []
            }
          ]
        }
      ]
    });

    const unsupportedSnapshot = buildSymphonyIntelligentFlowAdmissibilitySnapshot({
      lifecycleState: "active",
      moduleRegistry: enabledBrowserRegistry,
      resolvedPolicy,
      projection
    });
    const supportedSnapshot = buildSymphonyIntelligentFlowAdmissibilitySnapshot({
      lifecycleState: "active",
      moduleRegistry: supportedBrowserRegistry,
      resolvedPolicy,
      projection
    });

    expect(findRejected(unsupportedSnapshot, "critic.browser_test")).toMatchObject({
      reasonCode: "unsupported_runtime"
    });
    expect(supportedSnapshot.admissible).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          moduleId: "critic.browser_test",
          reasonCode: "required_by_contract"
        })
      ])
    );
  });

  it("rejects retries once the retry budget is exhausted", () => {
    const snapshot = buildSymphonyIntelligentFlowAdmissibilitySnapshot({
      lifecycleState: "active",
      moduleRegistry: createSymphonyIntelligentFlowDefaultModuleRegistry(),
      resolvedPolicy: createResolvedPolicy({
        requiredCapabilityIds: ["implement.spec", "critic.code_review"],
        requiredEvidenceIds: ["change_set", "code_review_report"],
        maxRetryCount: 1
      }),
      projection: createProjection({
        phase: "verifying",
        workEpoch: 1,
        capabilityStatusesByEpoch: [
          {
            workEpoch: 1,
            stale: false,
            attempts: [
              completedCapabilityAttempt({
                capabilityId: "implement.spec",
                executionId: "exec_impl_1"
              })
            ]
          }
        ],
        evidenceByEpoch: [
          {
            workEpoch: 1,
            stale: false,
            evidence: [
              {
                evidenceId: "change_set",
                summary: "Implementation diff recorded.",
                artifacts: []
              }
            ]
          }
        ]
      }),
      moduleAttempts: [
        {
          moduleId: "critic.code_review",
          workEpoch: 1,
          attempt: 2,
          status: "failed",
          retryable: true
        }
      ]
    });

    expect(snapshot.admissible).toEqual([]);
    expect(findRejected(snapshot, "critic.code_review")).toMatchObject({
      reasonCode: "retry_budget_exhausted"
    });
  });
});

function findRejected(
  snapshot: ReturnType<typeof buildSymphonyIntelligentFlowAdmissibilitySnapshot>,
  moduleId: string
) {
  const candidate = snapshot.rejected.find((entry) => entry.moduleId === moduleId);
  if (!candidate) {
    throw new TypeError(`Missing rejected candidate for ${moduleId}.`);
  }

  return candidate;
}

function createResolvedPolicy(
  overrides: Partial<SymphonyIntelligentFlowResolvedRoutingPolicy> = {}
): SymphonyIntelligentFlowResolvedRoutingPolicy {
  const base: SymphonyIntelligentFlowResolvedRoutingPolicy = {
    requiredCapabilityIds: [],
    preferredCapabilityIds: [],
    forbiddenCapabilityIds: [],
    requiredEvidenceIds: [],
    allowedModelProfileIds: [
      "builder_fast",
      "builder_deep",
      "critic_strict",
      "critic_adversarial",
      "critic_browser"
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

  return {
    ...base,
    ...overrides,
    completionPolicy: overrides.completionPolicy ?? base.completionPolicy,
    clarificationPolicy:
      overrides.clarificationPolicy ?? base.clarificationPolicy
  };
}

function createProjection(
  overrides: Partial<SymphonyIntelligentFlowCapabilityProjection> = {}
): SymphonyIntelligentFlowCapabilityProjection {
  const capabilityStatusesByEpoch = overrides.capabilityStatusesByEpoch ?? [];
  const latestAttempts =
    overrides.latestAttempts ?? createLatestAttempts(capabilityStatusesByEpoch);

  return {
    workflowId: "workflow-intelligent-flow-admissibility",
    phase: "queued",
    workEpoch: 0,
    pendingClarification: null,
    blockedReason: null,
    latestAttempts,
    capabilityStatusesByEpoch,
    evidenceByEpoch: overrides.evidenceByEpoch ?? [],
    completionReadiness: "not_ready",
    ...overrides
  };
}

function createLatestAttempts(
  capabilityStatusesByEpoch: TestCapabilityEpochStatus[]
): TestCapabilityAttempt[] {
  const latestByCapabilityId = new Map<TestCapabilityId, TestCapabilityAttempt>();

  for (const status of capabilityStatusesByEpoch) {
    for (const attempt of status.attempts) {
      const current = latestByCapabilityId.get(attempt.capabilityId);
      if (
        !current ||
        attempt.workEpoch > current.workEpoch ||
        (attempt.workEpoch === current.workEpoch && attempt.attempt > current.attempt)
      ) {
        latestByCapabilityId.set(attempt.capabilityId, attempt);
      }
    }
  }

  return [...latestByCapabilityId.values()];
}

function completedCapabilityAttempt(input: {
  capabilityId: TestCapabilityId;
  executionId: string;
  modelProfileId?: TestModelProfileId;
  workEpoch?: number;
  attempt?: number;
}): TestCapabilityAttempt {
  return {
    executionId: input.executionId,
    capabilityId: input.capabilityId,
    modelProfileId: input.modelProfileId ?? "builder_fast",
    workEpoch: input.workEpoch ?? 1,
    attempt: input.attempt ?? 1,
    status: "completed",
    summary: `Completed ${input.capabilityId}.`,
    startedAt: "2026-04-13T22:00:00.000Z",
    completedAt: "2026-04-13T22:01:00.000Z",
    retryable: null,
    reasonCode: null,
    failureKind: null,
    evidenceProduced: []
  };
}
