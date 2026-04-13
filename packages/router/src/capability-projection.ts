import {
  readSymphonyCapabilityBlockedSignal,
  readSymphonyCapabilityChangesRequestedSignal,
  readSymphonyCapabilityCompletedSignal,
  readSymphonyCapabilityFailedSignal,
  readSymphonyCapabilityStartedSignal,
  readSymphonyWorkflowClarificationAnsweredSignal,
  readSymphonyWorkflowClarificationRequestedSignal,
  readSymphonyWorkflowCompletionGateEvaluatedSignal
} from "./symphony-capability-contract.js";
import type {
  WorkflowCapabilityAttempt,
  WorkflowCapabilityEpochEvidence,
  WorkflowCapabilityEpochStatus,
  WorkflowCapabilityId,
  WorkflowCapabilityPhase,
  WorkflowCapabilityProjection,
  WorkflowClarificationRequest,
  WorkflowCompletionReadiness,
  WorkflowEvidenceRecord,
  WorkflowHistory,
  WorkflowModelProfileId
} from "./types/index.js";

type ProjectionAttempt<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends string,
  ProfileId extends WorkflowModelProfileId,
> = WorkflowCapabilityAttempt<CapabilityId, EvidenceId, ProfileId> & {
  updatedAt: string;
  sequence: number;
};

export function projectWorkflowCapabilityProjection<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends string = string,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
>(input: {
  workflowId: string;
  history: WorkflowHistory;
}): WorkflowCapabilityProjection<CapabilityId, EvidenceId, ProfileId> {
  const attemptsByExecutionId = new Map<
    string,
    ProjectionAttempt<CapabilityId, EvidenceId, ProfileId>
  >();
  const openClarifications = new Map<
    string,
    WorkflowClarificationRequest<CapabilityId>
  >();
  let currentWorkEpoch = 0;
  let blockedReason: string | null = null;
  let completionReadiness: WorkflowCompletionReadiness = "not_ready";
  let latestAttemptSequence = 0;

  input.history.forEach((event) => {
    if (event.kind !== "signal_recorded") {
      return;
    }

    const signal = event.signal;
    switch (signal.type) {
      case "capability.started": {
        const parsed = readSymphonyCapabilityStartedSignal(signal);
        if (!parsed) {
          return;
        }
        assertSignalWorkflowId(parsed.payload.workflowId, input.workflowId, parsed.type);
        if (attemptsByExecutionId.has(parsed.payload.executionId)) {
          throw new TypeError(
            `Capability projection recorded duplicate capability.started execution id ${JSON.stringify(parsed.payload.executionId)}.`
          );
        }

        latestAttemptSequence += 1;
        attemptsByExecutionId.set(parsed.payload.executionId, {
          executionId: parsed.payload.executionId,
          capabilityId: parsed.payload.capabilityId as CapabilityId,
          modelProfileId: parsed.payload.modelProfileId as ProfileId,
          workEpoch: parsed.payload.workEpoch,
          attempt: parsed.payload.attempt,
          status: "started",
          summary: parsed.payload.summary,
          startedAt: parsed.occurredAt,
          completedAt: null,
          retryable: null,
          reasonCode: null,
          failureKind: null,
          evidenceProduced: [],
          updatedAt: parsed.occurredAt,
          sequence: latestAttemptSequence
        });
        completionReadiness = "not_ready";
        break;
      }
      case "capability.completed": {
        const parsed = readSymphonyCapabilityCompletedSignal(signal);
        if (!parsed) {
          return;
        }
        assertSignalWorkflowId(parsed.payload.workflowId, input.workflowId, parsed.type);
        const attempt = requireAttemptIdentity({
          attemptsByExecutionId,
          signalType: parsed.type,
          payload: parsed.payload
        });
        attempt.status = "completed";
        attempt.summary = parsed.payload.summary;
        attempt.completedAt = parsed.occurredAt;
        attempt.evidenceProduced =
          parsed.payload.evidenceProduced as WorkflowEvidenceRecord<EvidenceId>[];
        attempt.updatedAt = parsed.occurredAt;
        latestAttemptSequence += 1;
        attempt.sequence = latestAttemptSequence;
        if (parsed.payload.capabilityId === "implement.spec") {
          if (parsed.payload.workEpoch <= currentWorkEpoch) {
            throw new TypeError(
              `Capability projection requires implement.spec completion to advance workEpoch. Received ${parsed.payload.workEpoch} after ${currentWorkEpoch}.`
            );
          }
          currentWorkEpoch = parsed.payload.workEpoch;
        }
        completionReadiness = "not_ready";
        break;
      }
      case "capability.changes_requested": {
        const parsed = readSymphonyCapabilityChangesRequestedSignal(signal);
        if (!parsed) {
          return;
        }
        assertSignalWorkflowId(parsed.payload.workflowId, input.workflowId, parsed.type);
        const attempt = requireAttemptIdentity({
          attemptsByExecutionId,
          signalType: parsed.type,
          payload: parsed.payload
        });
        attempt.status = "changes_requested";
        attempt.summary = parsed.payload.summary;
        attempt.completedAt = parsed.occurredAt;
        attempt.updatedAt = parsed.occurredAt;
        latestAttemptSequence += 1;
        attempt.sequence = latestAttemptSequence;
        completionReadiness = "not_ready";
        break;
      }
      case "capability.failed": {
        const parsed = readSymphonyCapabilityFailedSignal(signal);
        if (!parsed) {
          return;
        }
        assertSignalWorkflowId(parsed.payload.workflowId, input.workflowId, parsed.type);
        const attempt = requireAttemptIdentity({
          attemptsByExecutionId,
          signalType: parsed.type,
          payload: parsed.payload
        });
        attempt.status = "failed";
        attempt.summary = parsed.payload.summary;
        attempt.completedAt = parsed.occurredAt;
        attempt.retryable = parsed.payload.retryable;
        attempt.reasonCode = parsed.payload.reasonCode;
        attempt.failureKind = parsed.payload.failureKind;
        attempt.updatedAt = parsed.occurredAt;
        latestAttemptSequence += 1;
        attempt.sequence = latestAttemptSequence;
        completionReadiness = "not_ready";
        break;
      }
      case "capability.blocked": {
        const parsed = readSymphonyCapabilityBlockedSignal(signal);
        if (!parsed) {
          return;
        }
        assertSignalWorkflowId(parsed.payload.workflowId, input.workflowId, parsed.type);
        const attempt = requireAttemptIdentity({
          attemptsByExecutionId,
          signalType: parsed.type,
          payload: parsed.payload
        });
        attempt.status = "blocked";
        attempt.summary = parsed.payload.summary;
        attempt.completedAt = parsed.occurredAt;
        attempt.reasonCode = parsed.payload.reasonCode;
        attempt.updatedAt = parsed.occurredAt;
        latestAttemptSequence += 1;
        attempt.sequence = latestAttemptSequence;
        blockedReason = parsed.payload.summary;
        completionReadiness = "not_ready";
        break;
      }
      case "workflow.clarification_requested": {
        const parsed = readSymphonyWorkflowClarificationRequestedSignal(signal);
        if (!parsed) {
          return;
        }
        assertSignalWorkflowId(parsed.payload.workflowId, input.workflowId, parsed.type);
        if (openClarifications.has(parsed.payload.requestId)) {
          throw new TypeError(
            `Capability projection recorded duplicate open clarification request ${JSON.stringify(parsed.payload.requestId)}.`
          );
        }

        openClarifications.set(parsed.payload.requestId, {
          requestId: parsed.payload.requestId,
          raisedByCapabilityId: parsed.payload.raisedByCapabilityId as CapabilityId | null,
          workEpoch: parsed.payload.workEpoch,
          summary: parsed.payload.summary,
          questions: parsed.payload.questions
        });

        const matchingAttempt = findLatestOpenAttemptForClarification({
          attemptsByExecutionId,
          capabilityId: parsed.payload.raisedByCapabilityId as CapabilityId | null,
          workEpoch: parsed.payload.workEpoch
        });
        if (matchingAttempt) {
          matchingAttempt.status = "clarification_requested";
          matchingAttempt.updatedAt = parsed.occurredAt;
          latestAttemptSequence += 1;
          matchingAttempt.sequence = latestAttemptSequence;
        }
        completionReadiness = "not_ready";
        break;
      }
      case "workflow.clarification_answered": {
        const parsed = readSymphonyWorkflowClarificationAnsweredSignal(signal);
        if (!parsed) {
          return;
        }
        assertSignalWorkflowId(parsed.payload.workflowId, input.workflowId, parsed.type);
        if (!openClarifications.has(parsed.payload.requestId)) {
          throw new TypeError(
            `Capability projection cannot answer unknown clarification request ${JSON.stringify(parsed.payload.requestId)}.`
          );
        }

        openClarifications.delete(parsed.payload.requestId);
        completionReadiness = "not_ready";
        break;
      }
      case "workflow.completion_gate_evaluated": {
        const parsed = readSymphonyWorkflowCompletionGateEvaluatedSignal(signal);
        if (!parsed) {
          return;
        }
        assertSignalWorkflowId(parsed.payload.workflowId, input.workflowId, parsed.type);
        completionReadiness =
          parsed.payload.workEpoch === currentWorkEpoch && openClarifications.size === 0 && blockedReason === null
            ? parsed.payload.result
            : "not_ready";
        break;
      }
      default:
        break;
    }
  });

  const attempts = [...attemptsByExecutionId.values()].sort(compareAttemptSequence);
  const latestAttempts = buildLatestAttempts(attempts);
  const capabilityStatusesByEpoch = buildCapabilityStatusesByEpoch({
    attempts,
    currentWorkEpoch
  });
  const evidenceByEpoch = buildEvidenceByEpoch({
    attempts,
    currentWorkEpoch
  });
  const pendingClarification = getLatestOpenClarification(openClarifications);
  const phase = deriveCapabilityPhase({
    blockedReason,
    pendingClarification,
    latestAttempts
  });

  return {
    workflowId: input.workflowId,
    phase,
    workEpoch: currentWorkEpoch,
    pendingClarification,
    blockedReason,
    latestAttempts,
    capabilityStatusesByEpoch,
    evidenceByEpoch,
    completionReadiness:
      blockedReason === null && pendingClarification === null
        ? completionReadiness
        : "not_ready"
  };
}

function requireAttemptIdentity<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends string,
  ProfileId extends WorkflowModelProfileId,
>(input: {
  attemptsByExecutionId: Map<
    string,
    ProjectionAttempt<CapabilityId, EvidenceId, ProfileId>
  >;
  signalType: string;
  payload: {
    executionId: string;
    capabilityId: string;
    modelProfileId: string;
    workEpoch: number;
    attempt: number;
  };
}): ProjectionAttempt<CapabilityId, EvidenceId, ProfileId> {
  const attempt = input.attemptsByExecutionId.get(input.payload.executionId);
  if (!attempt) {
    throw new TypeError(
      `Capability projection received ${input.signalType} for unknown execution ${JSON.stringify(input.payload.executionId)}.`
    );
  }

  if (
    attempt.capabilityId !== input.payload.capabilityId ||
    attempt.modelProfileId !== input.payload.modelProfileId ||
    attempt.workEpoch !== input.payload.workEpoch ||
    attempt.attempt !== input.payload.attempt
  ) {
    throw new TypeError(
      `Capability projection received ${input.signalType} with mismatched identity for execution ${JSON.stringify(input.payload.executionId)}.`
    );
  }

  if (attempt.completedAt !== null) {
    throw new TypeError(
      `Capability projection received ${input.signalType} after execution ${JSON.stringify(input.payload.executionId)} was already completed.`
    );
  }

  return attempt;
}

function findLatestOpenAttemptForClarification<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends string,
  ProfileId extends WorkflowModelProfileId,
>(input: {
  attemptsByExecutionId: Map<
    string,
    ProjectionAttempt<CapabilityId, EvidenceId, ProfileId>
  >;
  capabilityId: CapabilityId | null;
  workEpoch: number;
}): ProjectionAttempt<CapabilityId, EvidenceId, ProfileId> | null {
  const matchingAttempts = [...input.attemptsByExecutionId.values()]
    .filter(
      (attempt) =>
        attempt.completedAt === null &&
        attempt.workEpoch === input.workEpoch &&
        (input.capabilityId === null || attempt.capabilityId === input.capabilityId)
    )
    .sort(compareAttemptSequence);

  return matchingAttempts.at(-1) ?? null;
}

function buildLatestAttempts<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends string,
  ProfileId extends WorkflowModelProfileId,
>(
  attempts: ProjectionAttempt<CapabilityId, EvidenceId, ProfileId>[]
): WorkflowCapabilityAttempt<CapabilityId, EvidenceId, ProfileId>[] {
  const latestByCapabilityId = new Map<
    CapabilityId,
    ProjectionAttempt<CapabilityId, EvidenceId, ProfileId>
  >();

  for (const attempt of attempts) {
    const current = latestByCapabilityId.get(attempt.capabilityId);
    if (!current || compareAttemptSequence(current, attempt) < 0) {
      latestByCapabilityId.set(attempt.capabilityId, attempt);
    }
  }

  return [...latestByCapabilityId.values()]
    .sort(compareAttemptSequence)
    .reverse()
    .map(stripProjectionAttemptMetadata);
}

function buildCapabilityStatusesByEpoch<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends string,
  ProfileId extends WorkflowModelProfileId,
>(input: {
  attempts: ProjectionAttempt<CapabilityId, EvidenceId, ProfileId>[];
  currentWorkEpoch: number;
}): WorkflowCapabilityEpochStatus<CapabilityId, EvidenceId, ProfileId>[] {
  const attemptsByEpoch = new Map<
    number,
    ProjectionAttempt<CapabilityId, EvidenceId, ProfileId>[]
  >();

  for (const attempt of input.attempts) {
    const current = attemptsByEpoch.get(attempt.workEpoch) ?? [];
    current.push(attempt);
    attemptsByEpoch.set(attempt.workEpoch, current);
  }

  return [...attemptsByEpoch.entries()]
    .sort(([leftEpoch], [rightEpoch]) => leftEpoch - rightEpoch)
    .map(([workEpoch, attempts]) => ({
      workEpoch,
      stale: workEpoch < input.currentWorkEpoch,
      attempts: attempts
        .sort(compareAttemptSequence)
        .map(stripProjectionAttemptMetadata)
    }));
}

function buildEvidenceByEpoch<EvidenceId extends string, CapabilityId extends WorkflowCapabilityId, ProfileId extends WorkflowModelProfileId>(input: {
  attempts: ProjectionAttempt<CapabilityId, EvidenceId, ProfileId>[];
  currentWorkEpoch: number;
}): WorkflowCapabilityEpochEvidence<EvidenceId>[] {
  const evidenceByEpoch = new Map<number, WorkflowEvidenceRecord<EvidenceId>[]>();

  for (const attempt of input.attempts) {
    if (attempt.evidenceProduced.length === 0) {
      continue;
    }

    const current = evidenceByEpoch.get(attempt.workEpoch) ?? [];
    current.push(...attempt.evidenceProduced);
    evidenceByEpoch.set(attempt.workEpoch, current);
  }

  return [...evidenceByEpoch.entries()]
    .sort(([leftEpoch], [rightEpoch]) => leftEpoch - rightEpoch)
    .map(([workEpoch, evidence]) => ({
      workEpoch,
      stale: workEpoch < input.currentWorkEpoch,
      evidence
    }));
}

function getLatestOpenClarification<CapabilityId extends WorkflowCapabilityId>(
  openClarifications: Map<string, WorkflowClarificationRequest<CapabilityId>>
): WorkflowClarificationRequest<CapabilityId> | null {
  return [...openClarifications.values()].at(-1) ?? null;
}

function deriveCapabilityPhase<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends string,
  ProfileId extends WorkflowModelProfileId,
>(input: {
  blockedReason: string | null;
  pendingClarification: WorkflowClarificationRequest<CapabilityId> | null;
  latestAttempts: WorkflowCapabilityAttempt<CapabilityId, EvidenceId, ProfileId>[];
}): WorkflowCapabilityPhase {
  if (input.blockedReason !== null) {
    return "blocked";
  }

  if (input.pendingClarification !== null) {
    return "waiting_input";
  }

  const latestAttempt = input.latestAttempts[0] ?? null;
  if (!latestAttempt) {
    return "queued";
  }

  if (latestAttempt.status === "changes_requested") {
    return "implementing";
  }

  if (latestAttempt.capabilityId === "implement.spec") {
    switch (latestAttempt.status) {
      case "completed":
        return "verifying";
      case "started":
      case "planned":
      case "clarification_requested":
      case "failed":
        return "implementing";
      case "blocked":
        return "blocked";
      default:
        return "implementing";
    }
  }

  switch (latestAttempt.status) {
    case "completed":
    case "started":
    case "planned":
    case "failed":
    case "clarification_requested":
      return "verifying";
    case "blocked":
      return "blocked";
  }
}

function assertSignalWorkflowId(
  signalWorkflowId: string,
  expectedWorkflowId: string,
  signalType: string
) {
  if (signalWorkflowId !== expectedWorkflowId) {
    throw new TypeError(
      `Capability projection received ${signalType} for workflow ${JSON.stringify(signalWorkflowId)} while projecting ${JSON.stringify(expectedWorkflowId)}.`
    );
  }
}

function compareAttemptSequence<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends string,
  ProfileId extends WorkflowModelProfileId,
>(
  left: ProjectionAttempt<CapabilityId, EvidenceId, ProfileId>,
  right: ProjectionAttempt<CapabilityId, EvidenceId, ProfileId>
): number {
  return left.sequence - right.sequence;
}

function stripProjectionAttemptMetadata<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends string,
  ProfileId extends WorkflowModelProfileId,
>(
  attempt: ProjectionAttempt<CapabilityId, EvidenceId, ProfileId>
): WorkflowCapabilityAttempt<CapabilityId, EvidenceId, ProfileId> {
  return {
    executionId: attempt.executionId,
    capabilityId: attempt.capabilityId,
    modelProfileId: attempt.modelProfileId,
    workEpoch: attempt.workEpoch,
    attempt: attempt.attempt,
    status: attempt.status,
    summary: attempt.summary,
    startedAt: attempt.startedAt,
    completedAt: attempt.completedAt,
    retryable: attempt.retryable,
    reasonCode: attempt.reasonCode,
    failureKind: attempt.failureKind,
    evidenceProduced: attempt.evidenceProduced
  };
}
