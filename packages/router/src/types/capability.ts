import type { WorkflowCommand } from "./command.js";
import type {
  WorkflowEvidenceId,
  WorkflowEvidenceRecord
} from "./evidence.js";
import type {
  WorkflowModelProfileDefinition,
  WorkflowModelProfileId
} from "./profile.js";

export type WorkflowCapabilityPhase =
  | "queued"
  | "implementing"
  | "verifying"
  | "waiting_input"
  | "blocked"
  | "complete";

export type WorkflowCapabilityId = string;

export type WorkflowMergePolicy = "manual" | "auto_merge";

export type WorkflowCompletionMode = "manual" | "auto";

export type WorkflowClarificationMode = "required" | "best_effort";

export type WorkflowReviewStrictness = "standard" | "strict" | "adversarial";

export type WorkflowCompletionPolicy = {
  mode: WorkflowCompletionMode;
};

export type WorkflowClarificationPolicy = {
  mode: WorkflowClarificationMode;
};

export type WorkflowClarificationQuestion = {
  id: string;
  prompt: string;
  context: string | null;
};

export type WorkflowClarificationRequest<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
> = {
  requestId: string;
  raisedByCapabilityId: CapabilityId | null;
  workEpoch: number;
  summary: string;
  questions: WorkflowClarificationQuestion[];
};

export type WorkflowRoutingDirectives<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> = {
  requiredCapabilityIds: CapabilityId[];
  preferredCapabilityIds: CapabilityId[];
  forbiddenCapabilityIds: CapabilityId[];
  requiredEvidenceIds: EvidenceId[];
  allowedModelProfileIds: ProfileId[];
  completionPolicy: WorkflowCompletionPolicy;
  clarificationPolicy: WorkflowClarificationPolicy;
  reviewStrictness: WorkflowReviewStrictness;
  maxRetryCount: number;
};

export type WorkflowRoutingDirectiveOverrides<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> = {
  requiredCapabilityIds?: CapabilityId[];
  preferredCapabilityIds?: CapabilityId[];
  forbiddenCapabilityIds?: CapabilityId[];
  requiredEvidenceIds?: EvidenceId[];
  allowedModelProfileIds?: ProfileId[];
  completionPolicy?: WorkflowCompletionPolicy;
  clarificationPolicy?: WorkflowClarificationPolicy;
  reviewStrictness?: WorkflowReviewStrictness;
  maxRetryCount?: number;
};

export type WorkflowResolvedRoutingPolicy<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> = WorkflowRoutingDirectives<CapabilityId, EvidenceId, ProfileId> & {
  mergePolicy: WorkflowMergePolicy;
};

export type WorkflowRoutingPolicyOverrides<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> = WorkflowRoutingDirectiveOverrides<CapabilityId, EvidenceId, ProfileId> & {
  mergePolicy?: WorkflowMergePolicy;
};

export type WorkflowRoutingPolicyResolutionInput<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> = {
  capabilityDefinitions: WorkflowCapabilityDefinition<
    CapabilityId,
    EvidenceId,
    ProfileId
  >[];
  modelProfiles: WorkflowModelProfileDefinition<ProfileId>[];
  presetPolicy: WorkflowResolvedRoutingPolicy<
    CapabilityId,
    EvidenceId,
    ProfileId
  >;
  userDefaults?: WorkflowRoutingPolicyOverrides<
    CapabilityId,
    EvidenceId,
    ProfileId
  > | null;
  ticketDirectives?: WorkflowRoutingPolicyOverrides<
    CapabilityId,
    EvidenceId,
    ProfileId
  > | null;
};

export type WorkflowTicketExecutionContract<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> = {
  contractId: string;
  workflowId: string;
  issueIdentifier: string;
  repositoryKey: string;
  summary: string;
  objective: string;
  doneDefinition: string;
  mergePolicy: WorkflowMergePolicy;
  routingDirectives: WorkflowRoutingDirectives<
    CapabilityId,
    EvidenceId,
    ProfileId
  >;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowCapabilityDefinition<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> = {
  id: CapabilityId;
  phase: WorkflowCapabilityPhase;
  description: string;
  supportedModelProfileIds: ProfileId[];
  producesEvidenceIds: EvidenceId[];
  enabledByDefault: boolean;
};

export type WorkflowCapabilityCandidate<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> = {
  capabilityId: CapabilityId;
  phase: WorkflowCapabilityPhase;
  workEpoch: number;
  priority: number;
  required: boolean;
  preferred: boolean;
  allowedModelProfileIds: ProfileId[];
  reason: string;
};

export type WorkflowCapabilityDecision<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> = {
  decisionId: string;
  capabilityId: CapabilityId;
  modelProfileId: ProfileId;
  workEpoch: number;
  rationale: string;
  decidedAt: string;
};

export type WorkflowCapabilityExecutionCommandPayload<
  Contract extends WorkflowTicketExecutionContract = WorkflowTicketExecutionContract,
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> = {
  workflowId: string;
  capabilityId: CapabilityId;
  modelProfileId: ProfileId;
  contract: Contract;
  executionInput: Record<string, unknown> | null;
};

export type WorkflowCapabilityExecutionCommand<
  Contract extends WorkflowTicketExecutionContract = WorkflowTicketExecutionContract,
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> = WorkflowCommand<
  "capability.execute",
  WorkflowCapabilityExecutionCommandPayload<Contract, CapabilityId, ProfileId>
>;

export type WorkflowCapabilityExecutionResultCompleted<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> = {
  kind: "completed";
  executionId: string;
  capabilityId: CapabilityId;
  modelProfileId: ProfileId;
  workEpoch: number;
  attempt: number;
  summary: string;
  evidenceProduced: WorkflowEvidenceRecord<EvidenceId>[];
};

export type WorkflowCapabilityExecutionResultChangesRequested<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> = {
  kind: "changes_requested";
  executionId: string;
  capabilityId: CapabilityId;
  modelProfileId: ProfileId;
  workEpoch: number;
  attempt: number;
  summary: string;
  findings: string[];
};

export type WorkflowCapabilityExecutionResultClarificationRequested<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
> = {
  kind: "clarification_requested";
  executionId: string;
  capabilityId: CapabilityId;
  clarification: WorkflowClarificationRequest<CapabilityId>;
};

export type WorkflowCapabilityExecutionResultFailed<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> = {
  kind: "failed";
  executionId: string;
  capabilityId: CapabilityId;
  modelProfileId: ProfileId;
  workEpoch: number;
  attempt: number;
  summary: string;
  retryable: boolean;
  reasonCode: string;
  failureKind: string;
};

export type WorkflowCapabilityExecutionResultBlocked<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> = {
  kind: "blocked";
  executionId: string;
  capabilityId: CapabilityId;
  modelProfileId: ProfileId;
  workEpoch: number;
  attempt: number;
  summary: string;
  reasonCode: string;
};

export type WorkflowCapabilityExecutionResult<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> =
  | WorkflowCapabilityExecutionResultCompleted<
      CapabilityId,
      EvidenceId,
      ProfileId
    >
  | WorkflowCapabilityExecutionResultChangesRequested<
      CapabilityId,
      ProfileId
    >
  | WorkflowCapabilityExecutionResultClarificationRequested<CapabilityId>
  | WorkflowCapabilityExecutionResultFailed<CapabilityId, ProfileId>
  | WorkflowCapabilityExecutionResultBlocked<CapabilityId, ProfileId>;

export type WorkflowCapabilityAttemptStatus =
  | "planned"
  | "started"
  | "completed"
  | "changes_requested"
  | "failed"
  | "blocked";

export type WorkflowCapabilityAttempt<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> = {
  executionId: string;
  capabilityId: CapabilityId;
  modelProfileId: ProfileId;
  workEpoch: number;
  attempt: number;
  status: WorkflowCapabilityAttemptStatus;
  summary: string;
  startedAt: string;
  completedAt: string | null;
  retryable: boolean | null;
  reasonCode: string | null;
  failureKind: string | null;
  evidenceProduced: WorkflowEvidenceRecord<EvidenceId>[];
};

export type WorkflowCompletionReadiness =
  | "not_ready"
  | "ready_for_manual_completion"
  | "ready_for_auto_completion";

export type WorkflowCompletionGateEvaluation<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
> = {
  workEpoch: number;
  result: WorkflowCompletionReadiness;
  satisfiedCapabilityIds: CapabilityId[];
  missingCapabilityIds: CapabilityId[];
  satisfiedEvidenceIds: EvidenceId[];
  missingEvidenceIds: EvidenceId[];
  reasons: string[];
};

export type WorkflowCapabilityProjection<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> = {
  workflowId: string;
  phase: WorkflowCapabilityPhase;
  workEpoch: number;
  pendingClarification: WorkflowClarificationRequest<CapabilityId> | null;
  blockedReason: string | null;
  latestAttempts: WorkflowCapabilityAttempt<CapabilityId, EvidenceId, ProfileId>[];
  completionReadiness: WorkflowCompletionReadiness;
};

export type WorkflowCapabilityPlanExecute<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> = {
  kind: "execute";
  candidate: WorkflowCapabilityCandidate<CapabilityId, ProfileId>;
  decision: WorkflowCapabilityDecision<CapabilityId, ProfileId>;
};

export type WorkflowCapabilityPlanAwaitingInput<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
> = {
  kind: "awaiting_input";
  clarification: WorkflowClarificationRequest<CapabilityId>;
};

export type WorkflowCapabilityPlanBlocked = {
  kind: "blocked";
  reason: string;
};

export type WorkflowCapabilityPlanReady<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
> = {
  kind: "ready_for_manual_completion" | "ready_for_auto_completion";
  evaluation: WorkflowCompletionGateEvaluation<CapabilityId, EvidenceId>;
};

export type WorkflowCapabilityPlan<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> =
  | WorkflowCapabilityPlanExecute<CapabilityId, ProfileId>
  | WorkflowCapabilityPlanAwaitingInput<CapabilityId>
  | WorkflowCapabilityPlanBlocked
  | WorkflowCapabilityPlanReady<CapabilityId, EvidenceId>;

export type WorkflowCapabilityPreset<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> = {
  capabilities: WorkflowCapabilityDefinition<
    CapabilityId,
    EvidenceId,
    ProfileId
  >[];
  modelProfiles: ProfileId[];
  defaultPolicy: WorkflowResolvedRoutingPolicy<
    CapabilityId,
    EvidenceId,
    ProfileId
  >;
};

export type WorkflowCapabilityPlannerInput<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> = {
  contract: WorkflowTicketExecutionContract<CapabilityId, EvidenceId, ProfileId>;
  resolvedPolicy: WorkflowResolvedRoutingPolicy<
    CapabilityId,
    EvidenceId,
    ProfileId
  >;
  projection: WorkflowCapabilityProjection<
    CapabilityId,
    EvidenceId,
    ProfileId
  >;
  candidates: WorkflowCapabilityCandidate<CapabilityId, ProfileId>[];
  completionGate: WorkflowCompletionGateEvaluation<CapabilityId, EvidenceId>;
};

export type WorkflowCapabilityPlanner<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> = {
  plan(
    input: WorkflowCapabilityPlannerInput<
      CapabilityId,
      EvidenceId,
      ProfileId
    >
  ): WorkflowCapabilityPlan<CapabilityId, EvidenceId, ProfileId>;
};
