import { describe, expect, it } from "vitest";
import { createWorkflowCapabilityPlanner } from "./capability-planner.js";
import type {
  WorkflowCapabilityDefinition,
  WorkflowJournalEvent,
  WorkflowModelProfileDefinition,
  WorkflowResolvedRoutingPolicy,
  WorkflowSignal,
  WorkflowTicketExecutionContract
} from "../types/index.js";

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
    supportedModelProfileIds: ["critic_strict"],
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

describe("capability planner", () => {
  it("plans deterministic execution from contract plus history", () => {
    const planner = createWorkflowCapabilityPlanner({
      capabilityDefinitions,
      modelProfiles,
      presetPolicy: createPresetPolicy()
    });

    const plan = planner.plan({
      contract: createContract(),
      history: [],
      decisionId: "decision_queued",
      decidedAt: "2026-04-12T23:50:00.000Z"
    });

    expect(plan).toEqual({
      kind: "execute",
      candidate: expect.objectContaining({
        capabilityId: "implement.spec",
        workEpoch: 1
      }),
      decision: expect.objectContaining({
        decisionId: "decision_queued",
        capabilityId: "implement.spec",
        modelProfileId: "builder_fast",
        workEpoch: 1
      })
    });
  });

  it("returns a completion-ready plan when required capabilities and evidence are satisfied", () => {
    const planner = createWorkflowCapabilityPlanner({
      capabilityDefinitions,
      modelProfiles,
      presetPolicy: createPresetPolicy()
    });

    const workflowId = "workflow-complete";
    const plan = planner.plan({
      contract: createContract({ workflowId }),
      history: [
        signalRecorded(
          capabilityStarted({
            workflowId,
            id: "signal_started_impl",
            occurredAt: "2026-04-12T23:50:00.000Z",
            executionId: "exec_impl",
            capabilityId: "implement.spec",
            modelProfileId: "builder_fast",
            workEpoch: 1,
            attempt: 1,
            summary: "Started implementation."
          })
        ),
        signalRecorded(
          capabilityCompleted({
            workflowId,
            id: "signal_completed_impl",
            occurredAt: "2026-04-12T23:51:00.000Z",
            executionId: "exec_impl",
            capabilityId: "implement.spec",
            modelProfileId: "builder_fast",
            workEpoch: 1,
            attempt: 1,
            summary: "Completed implementation.",
            evidenceProduced: [
              {
                evidenceId: "change_set",
                summary: "Change set.",
                artifacts: []
              }
            ]
          })
        ),
        signalRecorded(
          capabilityStarted({
            workflowId,
            id: "signal_started_review",
            occurredAt: "2026-04-12T23:52:00.000Z",
            executionId: "exec_review",
            capabilityId: "critic.code_review",
            modelProfileId: "critic_strict",
            workEpoch: 1,
            attempt: 1,
            summary: "Started review."
          })
        ),
        signalRecorded(
          capabilityCompleted({
            workflowId,
            id: "signal_completed_review",
            occurredAt: "2026-04-12T23:53:00.000Z",
            executionId: "exec_review",
            capabilityId: "critic.code_review",
            modelProfileId: "critic_strict",
            workEpoch: 1,
            attempt: 1,
            summary: "Completed review.",
            evidenceProduced: [
              {
                evidenceId: "code_review_report",
                summary: "Review report.",
                artifacts: []
              }
            ]
          })
        )
      ],
      decisionId: "decision_complete",
      decidedAt: "2026-04-12T23:54:00.000Z"
    });

    expect(plan).toEqual({
      kind: "ready_for_manual_completion",
      evaluation: expect.objectContaining({
        result: "ready_for_manual_completion",
        missingCapabilityIds: [],
        missingEvidenceIds: []
      })
    });
  });

  it("returns a blocked plan when the workflow is blocked", () => {
    const planner = createWorkflowCapabilityPlanner({
      capabilityDefinitions,
      modelProfiles,
      presetPolicy: createPresetPolicy()
    });

    const workflowId = "workflow-blocked";
    const plan = planner.plan({
      contract: createContract({ workflowId }),
      history: [
        signalRecorded(
          capabilityStarted({
            workflowId,
            id: "signal_started_review_blocked",
            occurredAt: "2026-04-12T23:55:00.000Z",
            executionId: "exec_review_blocked",
            capabilityId: "critic.code_review",
            modelProfileId: "critic_strict",
            workEpoch: 1,
            attempt: 1,
            summary: "Started review."
          })
        ),
        signalRecorded(
          capabilityBlocked({
            workflowId,
            id: "signal_blocked_review",
            occurredAt: "2026-04-12T23:56:00.000Z",
            executionId: "exec_review_blocked",
            capabilityId: "critic.code_review",
            modelProfileId: "critic_strict",
            workEpoch: 1,
            attempt: 1,
            summary: "Waiting on an external dependency.",
            reasonCode: "dependency_unavailable"
          })
        )
      ],
      decisionId: "decision_blocked",
      decidedAt: "2026-04-12T23:57:00.000Z"
    });

    expect(plan).toEqual({
      kind: "blocked",
      reason: "Waiting on an external dependency."
    });
  });

  it("returns an awaiting-input plan while clarification is pending", () => {
    const planner = createWorkflowCapabilityPlanner({
      capabilityDefinitions,
      modelProfiles,
      presetPolicy: createPresetPolicy()
    });

    const workflowId = "workflow-awaiting-input";
    const plan = planner.plan({
      contract: createContract({ workflowId }),
      history: [
        signalRecorded(
          capabilityStarted({
            workflowId,
            id: "signal_started_impl_clarify",
            occurredAt: "2026-04-12T23:58:00.000Z",
            executionId: "exec_impl_clarify",
            capabilityId: "implement.spec",
            modelProfileId: "builder_fast",
            workEpoch: 1,
            attempt: 1,
            summary: "Started implementation."
          })
        ),
        signalRecorded(
          clarificationRequested({
            workflowId,
            id: "signal_clarification_requested",
            occurredAt: "2026-04-12T23:59:00.000Z",
            requestId: "clarify_1",
            raisedByCapabilityId: "implement.spec",
            workEpoch: 1,
            summary: "Need the expected API contract.",
            questions: [
              {
                id: "q1",
                prompt: "What response shape should this route return?",
                context: null
              }
            ]
          })
        )
      ],
      decisionId: "decision_awaiting",
      decidedAt: "2026-04-13T00:00:00.000Z"
    });

    expect(plan).toEqual({
      kind: "awaiting_input",
      clarification: expect.objectContaining({
        requestId: "clarify_1",
        raisedByCapabilityId: "implement.spec"
      })
    });
  });
});

function createPresetPolicy(): WorkflowResolvedRoutingPolicy<
  TestCapabilityId,
  TestEvidenceId,
  TestProfileId
> {
  return {
    requiredCapabilityIds: ["implement.spec", "critic.code_review"],
    preferredCapabilityIds: [],
    forbiddenCapabilityIds: [],
    requiredEvidenceIds: ["change_set", "code_review_report"],
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
}

function createContract(input?: {
  workflowId?: string;
}): WorkflowTicketExecutionContract<
  TestCapabilityId,
  TestEvidenceId,
  TestProfileId
> {
  return {
    contractId: "contract_1",
    workflowId: input?.workflowId ?? "workflow-planner",
    issueIdentifier: "SYM-123",
    repositoryKey: "repo_main",
    summary: "Implement the capability planner.",
    objective: "Produce the next authoritative capability plan.",
    doneDefinition: "Planner emits execute, blocked, awaiting_input, or ready.",
    mergePolicy: "manual",
    routingDirectives: {
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
      maxRetryCount: 2
    },
    createdAt: "2026-04-12T23:49:00.000Z",
    updatedAt: "2026-04-12T23:49:00.000Z"
  };
}

function signalRecorded(signal: WorkflowSignal): WorkflowJournalEvent {
  return {
    kind: "signal_recorded",
    signal,
    recordedAt: signal.occurredAt
  };
}

function capabilityStarted(input: {
  workflowId: string;
  id: string;
  occurredAt: string;
  executionId: string;
  capabilityId: TestCapabilityId;
  modelProfileId: TestProfileId;
  workEpoch: number;
  attempt: number;
  summary: string;
}): WorkflowSignal {
  return {
    id: input.id,
    type: "capability.started",
    source: "runtime",
    occurredAt: input.occurredAt,
    causationId: null,
    correlationId: input.executionId,
    payload: {
      workflowId: input.workflowId,
      executionId: input.executionId,
      capabilityId: input.capabilityId,
      modelProfileId: input.modelProfileId,
      workEpoch: input.workEpoch,
      attempt: input.attempt,
      summary: input.summary
    }
  };
}

function capabilityCompleted(input: {
  workflowId: string;
  id: string;
  occurredAt: string;
  executionId: string;
  capabilityId: TestCapabilityId;
  modelProfileId: TestProfileId;
  workEpoch: number;
  attempt: number;
  summary: string;
  evidenceProduced: Array<{
    evidenceId: TestEvidenceId;
    summary: string;
    artifacts: Array<{ label: string; uri: string | null }>;
  }>;
}): WorkflowSignal {
  return {
    id: input.id,
    type: "capability.completed",
    source: "runtime",
    occurredAt: input.occurredAt,
    causationId: null,
    correlationId: input.executionId,
    payload: {
      workflowId: input.workflowId,
      executionId: input.executionId,
      capabilityId: input.capabilityId,
      modelProfileId: input.modelProfileId,
      workEpoch: input.workEpoch,
      attempt: input.attempt,
      summary: input.summary,
      evidenceProduced: input.evidenceProduced
    }
  };
}

function capabilityBlocked(input: {
  workflowId: string;
  id: string;
  occurredAt: string;
  executionId: string;
  capabilityId: TestCapabilityId;
  modelProfileId: TestProfileId;
  workEpoch: number;
  attempt: number;
  summary: string;
  reasonCode: string;
}): WorkflowSignal {
  return {
    id: input.id,
    type: "capability.blocked",
    source: "runtime",
    occurredAt: input.occurredAt,
    causationId: null,
    correlationId: input.executionId,
    payload: {
      workflowId: input.workflowId,
      executionId: input.executionId,
      capabilityId: input.capabilityId,
      modelProfileId: input.modelProfileId,
      workEpoch: input.workEpoch,
      attempt: input.attempt,
      summary: input.summary,
      reasonCode: input.reasonCode
    }
  };
}

function clarificationRequested(input: {
  workflowId: string;
  id: string;
  occurredAt: string;
  requestId: string;
  raisedByCapabilityId: TestCapabilityId | null;
  workEpoch: number;
  summary: string;
  questions: Array<{ id: string; prompt: string; context: string | null }>;
}): WorkflowSignal {
  return {
    id: input.id,
    type: "workflow.clarification_requested",
    source: "runtime",
    occurredAt: input.occurredAt,
    causationId: null,
    correlationId: input.requestId,
    payload: {
      workflowId: input.workflowId,
      requestId: input.requestId,
      raisedByCapabilityId: input.raisedByCapabilityId,
      workEpoch: input.workEpoch,
      summary: input.summary,
      questions: input.questions
    }
  };
}
