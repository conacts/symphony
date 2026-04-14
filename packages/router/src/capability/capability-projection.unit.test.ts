import { describe, expect, it } from "vitest";
import { projectWorkflowCapabilityProjection } from "./capability-projection.js";
import type { WorkflowJournalEvent, WorkflowSignal } from "../types/index.js";

describe("capability projection", () => {
  it("advances workEpoch only when implement.spec completes", () => {
    const workflowId = "workflow-cap-1";
    const projection = projectWorkflowCapabilityProjection({
      workflowId,
      history: [
        signalRecorded(
          capabilityStarted({
            workflowId,
            id: "signal_started_impl_1",
            occurredAt: "2026-04-12T23:10:00.000Z",
            executionId: "exec_impl_1",
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
            id: "signal_completed_impl_1",
            occurredAt: "2026-04-12T23:11:00.000Z",
            executionId: "exec_impl_1",
            capabilityId: "implement.spec",
            modelProfileId: "builder_fast",
            workEpoch: 1,
            attempt: 1,
            summary: "Implemented the change.",
            evidenceProduced: [
              {
                evidenceId: "change_set",
                summary: "Created the code change.",
                artifacts: []
              }
            ]
          })
        )
      ]
    });

    expect(projection.workEpoch).toBe(1);
    expect(projection.phase).toBe("verifying");
    expect(projection.latestAttempts).toEqual([
      expect.objectContaining({
        capabilityId: "implement.spec",
        workEpoch: 1,
        status: "completed"
      })
    ]);
  });

  it("keeps prior-epoch verification evidence visible but stale after a new implementation epoch", () => {
    const workflowId = "workflow-cap-2";
    const projection = projectWorkflowCapabilityProjection({
      workflowId,
      history: [
        signalRecorded(
          capabilityStarted({
            workflowId,
            id: "signal_started_impl_1",
            occurredAt: "2026-04-12T23:20:00.000Z",
            executionId: "exec_impl_1",
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
            id: "signal_completed_impl_1",
            occurredAt: "2026-04-12T23:21:00.000Z",
            executionId: "exec_impl_1",
            capabilityId: "implement.spec",
            modelProfileId: "builder_fast",
            workEpoch: 1,
            attempt: 1,
            summary: "Completed implementation epoch 1.",
            evidenceProduced: [
              {
                evidenceId: "change_set",
                summary: "Epoch 1 change set.",
                artifacts: []
              }
            ]
          })
        ),
        signalRecorded(
          capabilityStarted({
            workflowId,
            id: "signal_started_review_1",
            occurredAt: "2026-04-12T23:22:00.000Z",
            executionId: "exec_review_1",
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
            id: "signal_completed_review_1",
            occurredAt: "2026-04-12T23:23:00.000Z",
            executionId: "exec_review_1",
            capabilityId: "critic.code_review",
            modelProfileId: "critic_strict",
            workEpoch: 1,
            attempt: 1,
            summary: "Completed review.",
            evidenceProduced: [
              {
                evidenceId: "code_review_report",
                summary: "Epoch 1 review report.",
                artifacts: []
              }
            ]
          })
        ),
        signalRecorded(
          completionGateEvaluated({
            workflowId,
            id: "signal_gate_epoch_1",
            occurredAt: "2026-04-12T23:24:00.000Z",
            workEpoch: 1,
            result: "ready_for_manual_completion"
          })
        ),
        signalRecorded(
          capabilityStarted({
            workflowId,
            id: "signal_started_impl_2",
            occurredAt: "2026-04-12T23:25:00.000Z",
            executionId: "exec_impl_2",
            capabilityId: "implement.spec",
            modelProfileId: "builder_deep",
            workEpoch: 2,
            attempt: 1,
            summary: "Started implementation epoch 2."
          })
        ),
        signalRecorded(
          capabilityCompleted({
            workflowId,
            id: "signal_completed_impl_2",
            occurredAt: "2026-04-12T23:26:00.000Z",
            executionId: "exec_impl_2",
            capabilityId: "implement.spec",
            modelProfileId: "builder_deep",
            workEpoch: 2,
            attempt: 1,
            summary: "Completed implementation epoch 2.",
            evidenceProduced: [
              {
                evidenceId: "change_set",
                summary: "Epoch 2 change set.",
                artifacts: []
              }
            ]
          })
        )
      ]
    });

    expect(projection.workEpoch).toBe(2);
    expect(projection.evidenceByEpoch).toEqual([
      expect.objectContaining({
        workEpoch: 1,
        stale: true
      }),
      expect.objectContaining({
        workEpoch: 2,
        stale: false
      })
    ]);
    expect(projection.completionReadiness).toBe("not_ready");
  });

  it("enters and clears pending clarification through durable request and answer signals", () => {
    const workflowId = "workflow-cap-3";
    const projection = projectWorkflowCapabilityProjection({
      workflowId,
      history: [
        signalRecorded(
          capabilityStarted({
            workflowId,
            id: "signal_started_impl_clarify",
            occurredAt: "2026-04-12T23:30:00.000Z",
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
            occurredAt: "2026-04-12T23:31:00.000Z",
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
        ),
        signalRecorded(
          clarificationAnswered({
            workflowId,
            id: "signal_clarification_answered",
            occurredAt: "2026-04-12T23:32:00.000Z",
            requestId: "clarify_1"
          })
        )
      ]
    });

    expect(projection.pendingClarification).toBeNull();
    expect(projection.phase).toBe("implementing");
  });

  it("projects blocked state durably from capability.blocked", () => {
    const workflowId = "workflow-cap-4";
    const projection = projectWorkflowCapabilityProjection({
      workflowId,
      history: [
        signalRecorded(
          capabilityStarted({
            workflowId,
            id: "signal_started_review_blocked",
            occurredAt: "2026-04-12T23:40:00.000Z",
            executionId: "exec_review_blocked",
            capabilityId: "critic.adversarial_tests",
            modelProfileId: "critic_adversarial",
            workEpoch: 1,
            attempt: 1,
            summary: "Started adversarial tests."
          })
        ),
        signalRecorded(
          capabilityBlocked({
            workflowId,
            id: "signal_blocked_review",
            occurredAt: "2026-04-12T23:41:00.000Z",
            executionId: "exec_review_blocked",
            capabilityId: "critic.adversarial_tests",
            modelProfileId: "critic_adversarial",
            workEpoch: 1,
            attempt: 1,
            summary: "Waiting on an unavailable external dependency.",
            reasonCode: "dependency_unavailable"
          })
        )
      ]
    });

    expect(projection.blockedReason).toBe(
      "Waiting on an unavailable external dependency."
    );
    expect(projection.phase).toBe("blocked");
  });

  it("invalidates completion readiness when changes are requested", () => {
    const workflowId = "workflow-cap-5";
    const projection = projectWorkflowCapabilityProjection({
      workflowId,
      history: [
        signalRecorded(
          capabilityStarted({
            workflowId,
            id: "signal_started_impl_1",
            occurredAt: "2026-04-12T23:50:00.000Z",
            executionId: "exec_impl_1",
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
            id: "signal_completed_impl_1",
            occurredAt: "2026-04-12T23:51:00.000Z",
            executionId: "exec_impl_1",
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
          completionGateEvaluated({
            workflowId,
            id: "signal_gate_ready",
            occurredAt: "2026-04-12T23:52:00.000Z",
            workEpoch: 1,
            result: "ready_for_manual_completion"
          })
        ),
        signalRecorded(
          capabilityStarted({
            workflowId,
            id: "signal_started_review_1",
            occurredAt: "2026-04-12T23:53:00.000Z",
            executionId: "exec_review_1",
            capabilityId: "critic.code_review",
            modelProfileId: "critic_strict",
            workEpoch: 1,
            attempt: 1,
            summary: "Started review."
          })
        ),
        signalRecorded(
          capabilityChangesRequested({
            workflowId,
            id: "signal_changes_requested",
            occurredAt: "2026-04-12T23:54:00.000Z",
            executionId: "exec_review_1",
            capabilityId: "critic.code_review",
            modelProfileId: "critic_strict",
            workEpoch: 1,
            attempt: 1,
            summary: "Requested follow-up changes."
          })
        )
      ]
    });

    expect(projection.completionReadiness).toBe("not_ready");
    expect(projection.phase).toBe("implementing");
  });
});

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
  capabilityId: string;
  modelProfileId: string;
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
  capabilityId: string;
  modelProfileId: string;
  workEpoch: number;
  attempt: number;
  summary: string;
  evidenceProduced: Array<{
    evidenceId: string;
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
  capabilityId: string;
  modelProfileId: string;
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

function capabilityChangesRequested(input: {
  workflowId: string;
  id: string;
  occurredAt: string;
  executionId: string;
  capabilityId: string;
  modelProfileId: string;
  workEpoch: number;
  attempt: number;
  summary: string;
}): WorkflowSignal {
  return {
    id: input.id,
    type: "capability.changes_requested",
    source: "review",
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
      findings: ["Fix the failing review point."]
    }
  };
}

function clarificationRequested(input: {
  workflowId: string;
  id: string;
  occurredAt: string;
  requestId: string;
  raisedByCapabilityId: string | null;
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

function clarificationAnswered(input: {
  workflowId: string;
  id: string;
  occurredAt: string;
  requestId: string;
}): WorkflowSignal {
  return {
    id: input.id,
    type: "workflow.clarification_answered",
    source: "operator",
    occurredAt: input.occurredAt,
    causationId: null,
    correlationId: input.requestId,
    payload: {
      workflowId: input.workflowId,
      requestId: input.requestId,
      answeredAt: input.occurredAt,
      answers: {
        answer: "Return the canonical route payload."
      }
    }
  };
}

function completionGateEvaluated(input: {
  workflowId: string;
  id: string;
  occurredAt: string;
  workEpoch: number;
  result: "not_ready" | "ready_for_manual_completion" | "ready_for_auto_completion";
}): WorkflowSignal {
  return {
    id: input.id,
    type: "workflow.completion_gate_evaluated",
    source: "router",
    occurredAt: input.occurredAt,
    causationId: null,
    correlationId: null,
    payload: {
      workflowId: input.workflowId,
      workEpoch: input.workEpoch,
      result: input.result,
      satisfiedEvidenceIds: ["change_set"],
      missingEvidenceIds: [],
      reasons: ["All required evidence is present."]
    }
  };
}
