import { describe, expect, it } from "vitest";
import { buildWorkflowCapabilityCandidates } from "./capability-candidate-builder.js";
import type {
  WorkflowCapabilityAttempt,
  WorkflowCapabilityDefinition,
  WorkflowCapabilityProjection,
  WorkflowResolvedRoutingPolicy
} from "./types/index.js";

describe("capability candidate builder", () => {
  it("yields implement.spec for a fresh workflow", () => {
    const candidates = buildWorkflowCapabilityCandidates({
      capabilityDefinitions: capabilityDefinitions,
      resolvedPolicy: createResolvedPolicy(),
      projection: createProjection({
        phase: "queued",
        workEpoch: 0,
        capabilityStatusesByEpoch: [],
        evidenceByEpoch: []
      })
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        capabilityId: "implement.spec",
        phase: "implementing",
        workEpoch: 1,
        required: true,
        allowedModelProfileIds: ["builder_fast", "builder_deep"]
      })
    ]);
  });

  it("yields critic.code_review after implementation completes", () => {
    const candidates = buildWorkflowCapabilityCandidates({
      capabilityDefinitions: capabilityDefinitions,
      resolvedPolicy: createResolvedPolicy(),
      projection: createProjection({
        phase: "verifying",
        workEpoch: 1,
        capabilityStatusesByEpoch: [
          {
            workEpoch: 1,
            stale: false,
            attempts: [
              completedAttempt({
                capabilityId: "implement.spec",
                executionId: "exec_impl_1",
                modelProfileId: "builder_fast"
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
                summary: "Implementation change set.",
                artifacts: []
              }
            ]
          }
        ]
      })
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        capabilityId: "critic.code_review",
        phase: "verifying",
        workEpoch: 1,
        required: true,
        allowedModelProfileIds: ["critic_strict"]
      })
    ]);
  });

  it("enables adversarial tests after code review completes when policy requires adversarial verification", () => {
    const candidates = buildWorkflowCapabilityCandidates({
      capabilityDefinitions: capabilityDefinitions,
      resolvedPolicy: createResolvedPolicy({
        reviewStrictness: "adversarial"
      }),
      projection: createProjection({
        phase: "verifying",
        workEpoch: 1,
        capabilityStatusesByEpoch: [
          {
            workEpoch: 1,
            stale: false,
            attempts: [
              completedAttempt({
                capabilityId: "implement.spec",
                executionId: "exec_impl_1",
                modelProfileId: "builder_fast"
              }),
              completedAttempt({
                capabilityId: "critic.code_review",
                executionId: "exec_review_1",
                modelProfileId: "critic_strict"
              })
            ]
          }
        ]
      })
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        capabilityId: "critic.adversarial_tests",
        phase: "verifying",
        workEpoch: 1,
        required: true,
        allowedModelProfileIds: ["critic_adversarial"]
      })
    ]);
  });

  it("returns to implement.spec when code review requests changes", () => {
    const candidates = buildWorkflowCapabilityCandidates({
      capabilityDefinitions: capabilityDefinitions,
      resolvedPolicy: createResolvedPolicy(),
      projection: createProjection({
        phase: "implementing",
        workEpoch: 1,
        capabilityStatusesByEpoch: [
          {
            workEpoch: 1,
            stale: false,
            attempts: [
              completedAttempt({
                capabilityId: "implement.spec",
                executionId: "exec_impl_1",
                modelProfileId: "builder_fast"
              }),
              changesRequestedAttempt({
                capabilityId: "critic.code_review",
                executionId: "exec_review_1"
              })
            ]
          }
        ]
      })
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        capabilityId: "implement.spec",
        workEpoch: 2,
        required: true
      })
    ]);
  });

  it("yields no candidates while clarification is pending", () => {
    const candidates = buildWorkflowCapabilityCandidates({
      capabilityDefinitions: capabilityDefinitions,
      resolvedPolicy: createResolvedPolicy(),
      projection: createProjection({
        phase: "waiting_input",
        pendingClarification: {
          requestId: "clarify_1",
          raisedByCapabilityId: "implement.spec",
          workEpoch: 1,
          summary: "Need the API contract.",
          questions: [
            {
              id: "q1",
              prompt: "What shape should the response return?",
              context: null
            }
          ]
        }
      })
    });

    expect(candidates).toEqual([]);
  });

  it("re-emits implementation after clarification is answered", () => {
    const candidates = buildWorkflowCapabilityCandidates({
      capabilityDefinitions: capabilityDefinitions,
      resolvedPolicy: createResolvedPolicy(),
      projection: createProjection({
        phase: "implementing",
        workEpoch: 0,
        capabilityStatusesByEpoch: [
          {
            workEpoch: 1,
            stale: false,
            attempts: [
              clarificationRequestedAttempt({
                capabilityId: "implement.spec",
                executionId: "exec_impl_1",
                modelProfileId: "builder_fast"
              })
            ]
          }
        ]
      })
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        capabilityId: "implement.spec",
        workEpoch: 1,
        required: true
      })
    ]);
  });

  it("yields no candidates while the workflow is blocked", () => {
    const candidates = buildWorkflowCapabilityCandidates({
      capabilityDefinitions: capabilityDefinitions,
      resolvedPolicy: createResolvedPolicy(),
      projection: createProjection({
        phase: "blocked",
        blockedReason: "Waiting on external dependency access."
      })
    });

    expect(candidates).toEqual([]);
  });

  it("does not emit a duplicate implementation candidate while implementation is already started", () => {
    const candidates = buildWorkflowCapabilityCandidates({
      capabilityDefinitions: capabilityDefinitions,
      resolvedPolicy: createResolvedPolicy(),
      projection: createProjection({
        phase: "implementing",
        workEpoch: 1,
        capabilityStatusesByEpoch: [
          {
            workEpoch: 2,
            stale: false,
            attempts: [
              startedAttempt({
                capabilityId: "implement.spec",
                executionId: "exec_impl_2",
                modelProfileId: "builder_deep",
                workEpoch: 2
              })
            ]
          }
        ],
        latestAttempts: [
          startedAttempt({
            capabilityId: "implement.spec",
            executionId: "exec_impl_2",
            modelProfileId: "builder_deep",
            workEpoch: 2
          })
        ]
      })
    });

    expect(candidates).toEqual([]);
  });

  it("keeps browser testing non-admissible while the capability is disabled by default", () => {
    const candidates = buildWorkflowCapabilityCandidates({
      capabilityDefinitions: capabilityDefinitions,
      resolvedPolicy: createResolvedPolicy({
        preferredCapabilityIds: ["critic.browser_test"]
      }),
      projection: createProjection({
        phase: "verifying",
        workEpoch: 1,
        capabilityStatusesByEpoch: [
          {
            workEpoch: 1,
            stale: false,
            attempts: [
              completedAttempt({
                capabilityId: "implement.spec",
                executionId: "exec_impl_1",
                modelProfileId: "builder_fast"
              }),
              completedAttempt({
                capabilityId: "critic.code_review",
                executionId: "exec_review_1",
                modelProfileId: "critic_strict"
              })
            ]
          }
        ]
      })
    });

    expect(candidates).toEqual([]);
  });
});

const capabilityDefinitions: WorkflowCapabilityDefinition<string, string, string>[] = [
  {
    id: "implement.spec",
    phase: "implementing",
    description: "Implements the ticket.",
    supportedModelProfileIds: ["builder_fast", "builder_deep"],
    producesEvidenceIds: ["change_set"],
    enabledByDefault: true
  },
  {
    id: "critic.code_review",
    phase: "verifying",
    description: "Reviews the produced implementation.",
    supportedModelProfileIds: ["critic_strict"],
    producesEvidenceIds: ["code_review_report"],
    enabledByDefault: true
  },
  {
    id: "critic.adversarial_tests",
    phase: "verifying",
    description: "Challenges the implementation with adversarial tests.",
    supportedModelProfileIds: ["critic_adversarial"],
    producesEvidenceIds: ["adversarial_test_report"],
    enabledByDefault: true
  },
  {
    id: "critic.browser_test",
    phase: "verifying",
    description: "Exercises the implementation through browser verification.",
    supportedModelProfileIds: ["critic_browser"],
    producesEvidenceIds: ["browser_test_report"],
    enabledByDefault: false
  }
];

function createResolvedPolicy(
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
      "critic_adversarial",
      "critic_browser"
    ],
    completionPolicy: { mode: "manual" },
    clarificationPolicy: { mode: "required" },
    reviewStrictness: "strict",
    maxRetryCount: 1,
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
  overrides: Partial<WorkflowCapabilityProjection<string, string, string>> = {}
): WorkflowCapabilityProjection<string, string, string> {
  const capabilityStatusesByEpoch = overrides.capabilityStatusesByEpoch ?? [];
  const latestAttempts =
    overrides.latestAttempts ?? createLatestAttempts(capabilityStatusesByEpoch);

  return {
    workflowId: "workflow-candidate-builder",
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
  capabilityStatusesByEpoch: WorkflowCapabilityProjection<
    string,
    string,
    string
  >["capabilityStatusesByEpoch"]
): WorkflowCapabilityAttempt<string, string, string>[] {
  const latestByCapabilityId = new Map<string, WorkflowCapabilityAttempt<string, string, string>>();

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

function completedAttempt(input: {
  capabilityId: string;
  executionId: string;
  modelProfileId: string;
  workEpoch?: number;
  attempt?: number;
}): WorkflowCapabilityAttempt<string, string, string> {
  return {
    executionId: input.executionId,
    capabilityId: input.capabilityId,
    modelProfileId: input.modelProfileId,
    workEpoch: input.workEpoch ?? 1,
    attempt: input.attempt ?? 1,
    status: "completed",
    summary: `Completed ${input.capabilityId}.`,
    startedAt: "2026-04-12T23:00:00.000Z",
    completedAt: "2026-04-12T23:01:00.000Z",
    retryable: null,
    reasonCode: null,
    failureKind: null,
    evidenceProduced: []
  };
}

function startedAttempt(input: {
  capabilityId: string;
  executionId: string;
  modelProfileId: string;
  workEpoch?: number;
  attempt?: number;
}): WorkflowCapabilityAttempt<string, string, string> {
  return {
    executionId: input.executionId,
    capabilityId: input.capabilityId,
    modelProfileId: input.modelProfileId,
    workEpoch: input.workEpoch ?? 1,
    attempt: input.attempt ?? 1,
    status: "started",
    summary: `Started ${input.capabilityId}.`,
    startedAt: "2026-04-12T23:00:00.000Z",
    completedAt: null,
    retryable: null,
    reasonCode: null,
    failureKind: null,
    evidenceProduced: []
  };
}

function changesRequestedAttempt(input: {
  capabilityId: string;
  executionId: string;
  modelProfileId?: string;
  workEpoch?: number;
  attempt?: number;
}): WorkflowCapabilityAttempt<string, string, string> {
  return {
    executionId: input.executionId,
    capabilityId: input.capabilityId,
    modelProfileId: input.modelProfileId ?? "critic_strict",
    workEpoch: input.workEpoch ?? 1,
    attempt: input.attempt ?? 1,
    status: "changes_requested",
    summary: `Changes requested by ${input.capabilityId}.`,
    startedAt: "2026-04-12T23:00:00.000Z",
    completedAt: "2026-04-12T23:01:00.000Z",
    retryable: null,
    reasonCode: null,
    failureKind: null,
    evidenceProduced: []
  };
}

function clarificationRequestedAttempt(input: {
  capabilityId: string;
  executionId: string;
  modelProfileId: string;
  workEpoch?: number;
  attempt?: number;
}): WorkflowCapabilityAttempt<string, string, string> {
  return {
    executionId: input.executionId,
    capabilityId: input.capabilityId,
    modelProfileId: input.modelProfileId,
    workEpoch: input.workEpoch ?? 1,
    attempt: input.attempt ?? 1,
    status: "clarification_requested",
    summary: `Clarification requested by ${input.capabilityId}.`,
    startedAt: "2026-04-12T23:00:00.000Z",
    completedAt: null,
    retryable: null,
    reasonCode: null,
    failureKind: null,
    evidenceProduced: []
  };
}
