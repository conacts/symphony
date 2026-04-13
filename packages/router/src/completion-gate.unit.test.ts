import { describe, expect, it } from "vitest";
import { evaluateWorkflowCompletionGate } from "./completion-gate.js";
import type {
  WorkflowCapabilityAttempt,
  WorkflowCapabilityProjection,
  WorkflowResolvedRoutingPolicy
} from "./types/index.js";

describe("completion gate", () => {
  it("returns not_ready when required evidence is missing", () => {
    const evaluation = evaluateWorkflowCompletionGate({
      resolvedPolicy: createResolvedPolicy({
        requiredEvidenceIds: ["change_set", "code_review_report"]
      }),
      projection: createProjection({
        evidenceByEpoch: [
          {
            workEpoch: 1,
            stale: false,
            evidence: [
              {
                evidenceId: "change_set",
                summary: "Code changes recorded.",
                artifacts: []
              }
            ]
          }
        ]
      })
    });

    expect(evaluation.result).toBe("not_ready");
    expect(evaluation.satisfiedEvidenceIds).toEqual(["change_set"]);
    expect(evaluation.missingEvidenceIds).toEqual(["code_review_report"]);
    expect(evaluation.reasons).toContain(
      'Required evidence "code_review_report" is missing for work epoch 1.'
    );
  });

  it("returns not_ready when a required capability is not completed in the current work epoch", () => {
    const evaluation = evaluateWorkflowCompletionGate({
      resolvedPolicy: createResolvedPolicy({
        requiredCapabilityIds: ["implement.spec", "critic.code_review"]
      }),
      projection: createProjection({
        capabilityStatusesByEpoch: [
          {
            workEpoch: 1,
            stale: false,
            attempts: [
              completedAttempt({
                capabilityId: "implement.spec",
                executionId: "exec_impl_1"
              }),
              startedAttempt({
                capabilityId: "critic.code_review",
                executionId: "exec_review_1"
              })
            ]
          }
        ]
      })
    });

    expect(evaluation.result).toBe("not_ready");
    expect(evaluation.satisfiedCapabilityIds).toEqual(["implement.spec"]);
    expect(evaluation.missingCapabilityIds).toEqual(["critic.code_review"]);
    expect(evaluation.reasons).toContain(
      'Required capability "critic.code_review" has not completed for work epoch 1.'
    );
  });

  it("ignores future work epochs while completion still evaluates the current epoch", () => {
    const evaluation = evaluateWorkflowCompletionGate({
      resolvedPolicy: createResolvedPolicy({
        requiredCapabilityIds: ["implement.spec"],
        requiredEvidenceIds: ["change_set"]
      }),
      projection: createProjection({
        workEpoch: 0,
        phase: "implementing",
        capabilityStatusesByEpoch: [
          {
            workEpoch: 1,
            stale: false,
            attempts: [
              startedAttempt({
                capabilityId: "implement.spec",
                executionId: "exec_impl_1",
                modelProfileId: "builder_fast",
                workEpoch: 1
              })
            ]
          }
        ],
        evidenceByEpoch: [],
        latestAttempts: [
          startedAttempt({
            capabilityId: "implement.spec",
            executionId: "exec_impl_1",
            modelProfileId: "builder_fast",
            workEpoch: 1
          })
        ]
      })
    });

    expect(evaluation.result).toBe("not_ready");
    expect(evaluation.missingCapabilityIds).toEqual(["implement.spec"]);
    expect(evaluation.missingEvidenceIds).toEqual(["change_set"]);
  });

  it("returns not_ready while clarification is pending even when proof requirements are satisfied", () => {
    const evaluation = evaluateWorkflowCompletionGate({
      resolvedPolicy: createResolvedPolicy({
        requiredCapabilityIds: ["implement.spec"],
        requiredEvidenceIds: ["change_set"]
      }),
      projection: createProjection({
        pendingClarification: {
          requestId: "clarify_contract",
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
        },
        capabilityStatusesByEpoch: [
          {
            workEpoch: 1,
            stale: false,
            attempts: [
              completedAttempt({
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
                summary: "Implementation change set.",
                artifacts: []
              }
            ]
          }
        ]
      })
    });

    expect(evaluation.result).toBe("not_ready");
    expect(evaluation.reasons).toContain(
      'Completion is blocked by pending clarification request "clarify_contract".'
    );
  });

  it("returns not_ready when the workflow is blocked", () => {
    const evaluation = evaluateWorkflowCompletionGate({
      resolvedPolicy: createResolvedPolicy({
        requiredCapabilityIds: ["implement.spec"],
        requiredEvidenceIds: ["change_set"]
      }),
      projection: createProjection({
        blockedReason: "Waiting on external dependency access.",
        capabilityStatusesByEpoch: [
          {
            workEpoch: 1,
            stale: false,
            attempts: [
              completedAttempt({
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
                summary: "Implementation change set.",
                artifacts: []
              }
            ]
          }
        ]
      })
    });

    expect(evaluation.result).toBe("not_ready");
    expect(evaluation.reasons).toContain(
      "Completion is blocked by workflow state: Waiting on external dependency access."
    );
  });

  it("returns ready_for_manual_completion when proof requirements are satisfied under manual policy", () => {
    const evaluation = evaluateWorkflowCompletionGate({
      resolvedPolicy: createResolvedPolicy({
        requiredCapabilityIds: ["implement.spec", "critic.code_review"],
        requiredEvidenceIds: ["change_set", "code_review_report"],
        completionPolicy: { mode: "manual" }
      }),
      projection: createReadyProjection()
    });

    expect(evaluation.result).toBe("ready_for_manual_completion");
    expect(evaluation.missingCapabilityIds).toEqual([]);
    expect(evaluation.missingEvidenceIds).toEqual([]);
    expect(evaluation.reasons).toEqual([]);
  });

  it("returns ready_for_auto_completion when proof requirements are satisfied under auto policy", () => {
    const evaluation = evaluateWorkflowCompletionGate({
      resolvedPolicy: createResolvedPolicy({
        requiredCapabilityIds: ["implement.spec", "critic.code_review"],
        requiredEvidenceIds: ["change_set", "code_review_report"],
        completionPolicy: { mode: "auto" }
      }),
      projection: createReadyProjection()
    });

    expect(evaluation.result).toBe("ready_for_auto_completion");
    expect(evaluation.missingCapabilityIds).toEqual([]);
    expect(evaluation.missingEvidenceIds).toEqual([]);
    expect(evaluation.reasons).toEqual([]);
  });
});

function createResolvedPolicy(
  overrides: Partial<WorkflowResolvedRoutingPolicy<string, string, string>> = {}
): WorkflowResolvedRoutingPolicy<string, string, string> {
  const base: WorkflowResolvedRoutingPolicy<string, string, string> = {
    requiredCapabilityIds: [],
    preferredCapabilityIds: [],
    forbiddenCapabilityIds: [],
    requiredEvidenceIds: [],
    allowedModelProfileIds: ["builder_fast", "critic_strict"],
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
  const base: WorkflowCapabilityProjection<string, string, string> = {
    workflowId: "workflow-completion-gate",
    phase: "verifying",
    workEpoch: 1,
    pendingClarification: null,
    blockedReason: null,
    latestAttempts: [],
    capabilityStatusesByEpoch: [
      {
        workEpoch: 1,
        stale: false,
        attempts: []
      }
    ],
    evidenceByEpoch: [
      {
        workEpoch: 1,
        stale: false,
        evidence: []
      }
    ],
    completionReadiness: "not_ready"
  };

  return {
    ...base,
    ...overrides
  };
}

function createReadyProjection(): WorkflowCapabilityProjection<
  string,
  string,
  string
> {
  return createProjection({
    latestAttempts: [
      completedAttempt({
        capabilityId: "implement.spec",
        executionId: "exec_impl_1"
      }),
      completedAttempt({
        capabilityId: "critic.code_review",
        executionId: "exec_review_1",
        modelProfileId: "critic_strict"
      })
    ],
    capabilityStatusesByEpoch: [
      {
        workEpoch: 1,
        stale: false,
        attempts: [
          completedAttempt({
            capabilityId: "implement.spec",
            executionId: "exec_impl_1"
          }),
          completedAttempt({
            capabilityId: "critic.code_review",
            executionId: "exec_review_1",
            modelProfileId: "critic_strict"
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
          },
          {
            evidenceId: "code_review_report",
            summary: "Review report.",
            artifacts: []
          }
        ]
      }
    ]
  });
}

function completedAttempt(input: {
  capabilityId: string;
  executionId: string;
  modelProfileId?: string;
  workEpoch?: number;
  attempt?: number;
}): WorkflowCapabilityAttempt<string, string, string> {
  return {
    executionId: input.executionId,
    capabilityId: input.capabilityId,
    modelProfileId: input.modelProfileId ?? "builder_fast",
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
