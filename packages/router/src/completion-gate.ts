import type {
  WorkflowCapabilityAttempt,
  WorkflowCapabilityEpochEvidence,
  WorkflowCapabilityEpochStatus,
  WorkflowCapabilityId,
  WorkflowCapabilityProjection,
  WorkflowCompletionGateEvaluation,
  WorkflowEvidenceId,
  WorkflowModelProfileId,
  WorkflowResolvedRoutingPolicy
} from "./types/index.js";

export function evaluateWorkflowCompletionGate<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
>(input: {
  resolvedPolicy: WorkflowResolvedRoutingPolicy<
    CapabilityId,
    EvidenceId,
    ProfileId
  >;
  projection: WorkflowCapabilityProjection<CapabilityId, EvidenceId, ProfileId>;
}): WorkflowCompletionGateEvaluation<CapabilityId, EvidenceId> {
  const currentCapabilityStatus = requireCurrentEpochCapabilityStatus({
    statuses: input.projection.capabilityStatusesByEpoch,
    workEpoch: input.projection.workEpoch
  });
  const currentEvidenceStatus = requireCurrentEpochEvidenceStatus({
    evidenceByEpoch: input.projection.evidenceByEpoch,
    workEpoch: input.projection.workEpoch
  });
  const latestAttemptsByCapabilityId = createLatestAttemptMap(
    currentCapabilityStatus?.attempts ?? []
  );
  const currentEvidenceIds = new Set(
    (currentEvidenceStatus?.evidence ?? []).map((record) => record.evidenceId)
  );
  const satisfiedCapabilityIds =
    input.resolvedPolicy.requiredCapabilityIds.filter((capabilityId) => {
      const attempt = latestAttemptsByCapabilityId.get(capabilityId);
      return attempt?.status === "completed";
    });
  const missingCapabilityIds = input.resolvedPolicy.requiredCapabilityIds.filter(
    (capabilityId) => !satisfiedCapabilityIds.includes(capabilityId)
  );
  const satisfiedEvidenceIds = input.resolvedPolicy.requiredEvidenceIds.filter(
    (evidenceId) => currentEvidenceIds.has(evidenceId)
  );
  const missingEvidenceIds = input.resolvedPolicy.requiredEvidenceIds.filter(
    (evidenceId) => !currentEvidenceIds.has(evidenceId)
  );
  const reasons = buildCompletionGateReasons({
    projection: input.projection,
    missingCapabilityIds,
    missingEvidenceIds
  });

  return {
    workEpoch: input.projection.workEpoch,
    result:
      reasons.length === 0
        ? input.resolvedPolicy.completionPolicy.mode === "manual"
          ? "ready_for_manual_completion"
          : "ready_for_auto_completion"
        : "not_ready",
    satisfiedCapabilityIds,
    missingCapabilityIds,
    satisfiedEvidenceIds,
    missingEvidenceIds,
    reasons
  };
}

function requireCurrentEpochCapabilityStatus<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId,
>(input: {
  statuses: WorkflowCapabilityEpochStatus<CapabilityId, EvidenceId, ProfileId>[];
  workEpoch: number;
}): WorkflowCapabilityEpochStatus<CapabilityId, EvidenceId, ProfileId> | null {
  const currentStatuses = input.statuses.filter(
    (status) => status.workEpoch === input.workEpoch
  );
  if (currentStatuses.length > 1) {
    throw new TypeError(
      `Completion gate projection contains multiple capability status entries for work epoch ${input.workEpoch}.`
    );
  }

  const currentStatus = currentStatuses[0] ?? null;
  if (currentStatus?.stale) {
    throw new TypeError(
      `Completion gate projection marked current capability status epoch ${input.workEpoch} as stale.`
    );
  }

  for (const status of input.statuses) {
    if (status.workEpoch < input.workEpoch && !status.stale) {
      throw new TypeError(
        `Completion gate projection marked stale capability status epoch ${status.workEpoch} as non-stale.`
      );
    }
  }

  return currentStatus;
}

function requireCurrentEpochEvidenceStatus<
  EvidenceId extends WorkflowEvidenceId,
>(input: {
  evidenceByEpoch: WorkflowCapabilityEpochEvidence<EvidenceId>[];
  workEpoch: number;
}): WorkflowCapabilityEpochEvidence<EvidenceId> | null {
  const currentEntries = input.evidenceByEpoch.filter(
    (entry) => entry.workEpoch === input.workEpoch
  );
  if (currentEntries.length > 1) {
    throw new TypeError(
      `Completion gate projection contains multiple evidence entries for work epoch ${input.workEpoch}.`
    );
  }

  const currentEntry = currentEntries[0] ?? null;
  if (currentEntry?.stale) {
    throw new TypeError(
      `Completion gate projection marked current evidence epoch ${input.workEpoch} as stale.`
    );
  }

  for (const entry of input.evidenceByEpoch) {
    if (entry.workEpoch < input.workEpoch && !entry.stale) {
      throw new TypeError(
        `Completion gate projection marked stale evidence epoch ${entry.workEpoch} as non-stale.`
      );
    }
  }

  return currentEntry;
}

function createLatestAttemptMap<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId,
>(
  attempts: WorkflowCapabilityAttempt<CapabilityId, EvidenceId, ProfileId>[]
): Map<
  CapabilityId,
  WorkflowCapabilityAttempt<CapabilityId, EvidenceId, ProfileId>
> {
  const attemptsByCapabilityId = new Map<
    CapabilityId,
    WorkflowCapabilityAttempt<CapabilityId, EvidenceId, ProfileId>
  >();

  for (const attempt of attempts) {
    const current = attemptsByCapabilityId.get(attempt.capabilityId);
    if (!current) {
      attemptsByCapabilityId.set(attempt.capabilityId, attempt);
      continue;
    }

    if (attempt.attempt === current.attempt) {
      throw new TypeError(
        `Completion gate projection recorded duplicate attempt number ${attempt.attempt} for capability ${JSON.stringify(attempt.capabilityId)} in work epoch ${attempt.workEpoch}.`
      );
    }

    if (attempt.attempt > current.attempt) {
      attemptsByCapabilityId.set(attempt.capabilityId, attempt);
    }
  }

  return attemptsByCapabilityId;
}

function buildCompletionGateReasons<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId,
>(input: {
  projection: WorkflowCapabilityProjection<CapabilityId, EvidenceId, ProfileId>;
  missingCapabilityIds: CapabilityId[];
  missingEvidenceIds: EvidenceId[];
}): string[] {
  const reasons: string[] = [];

  if (input.projection.pendingClarification) {
    reasons.push(
      `Completion is blocked by pending clarification request ${JSON.stringify(input.projection.pendingClarification.requestId)}.`
    );
  }

  if (input.projection.blockedReason !== null) {
    reasons.push(
      `Completion is blocked by workflow state: ${input.projection.blockedReason}`
    );
  }

  for (const capabilityId of input.missingCapabilityIds) {
    reasons.push(
      `Required capability ${JSON.stringify(capabilityId)} has not completed for work epoch ${input.projection.workEpoch}.`
    );
  }

  for (const evidenceId of input.missingEvidenceIds) {
    reasons.push(
      `Required evidence ${JSON.stringify(evidenceId)} is missing for work epoch ${input.projection.workEpoch}.`
    );
  }

  return reasons;
}
