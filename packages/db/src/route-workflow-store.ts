import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  isNull
} from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type {
  SymphonyIntelligentFlowRouterDecision,
  WorkflowCommand,
  WorkflowCapabilityExecutionCommand,
  WorkflowCapabilityId,
  WorkflowCapabilityPlan,
  WorkflowEvidenceId,
  WorkflowJournalEvent,
  WorkflowModelProfileId,
  WorkflowNodeId,
  WorkflowProjection,
  WorkflowRouteResult,
  WorkflowSignalSource,
  WorkflowTicketExecutionContract,
  WorkflowTraceEntry
} from "@symphony/router";
import {
  SymphonyRouteWorkflowExistsError,
  SymphonyRouteWorkflowNotFoundError
} from "./errors.js";
import {
  assertMatchingLifecycleBindingScope,
  mapLifecycleBindingScope,
  normalizeLifecycleBindingScope,
  type SymphonyLifecycleBindingScope
} from "./lifecycle-binding-scope.js";
import {
  routeWorkflowCapabilityPlannerCommandsTable,
  routeWorkflowCapabilityPlannerDecisionsTable,
  routeDecisionsTable,
  routeHistoryEventsTable,
  routeProjectionSnapshotsTable,
  routeWorkflowExecutionContractsTable,
  routeWorkflowsTable,
  symphonyIssuesTable
} from "./schema.js";

type RouteHistoryEventKind =
  | "signal_recorded"
  | "decision_recorded"
  | "command_emitted"
  | "command_settled";

export type RouteWorkflowBindingScope = SymphonyLifecycleBindingScope;

export type RouteWorkflowRecord = {
  workflowId: string;
  trackerIssueId: string;
  repositoryKey: string;
  issueIdentifier: string;
  bindingScope: RouteWorkflowBindingScope | null;
  routerPresetId: string;
  routerName: string;
  routerVersion: string;
  archivedAt: string | null;
  insertedAt: string;
  updatedAt: string;
};

type CanonicalIssueBindingRow = {
  trackerIssueId: string;
  issueIdentifier: string;
  repositoryKey: string;
  organizationId: string | null;
  linearWorkspaceIdentityId: string | null;
};

type RouteWorkflowRecordRow = {
  workflowId: string;
  trackerIssueId: string;
  repositoryKey: string;
  issueIdentifier: string;
  organizationId: string | null;
  linearWorkspaceIdentityId: string | null;
  routerPresetId: string;
  routerName: string;
  routerVersion: string;
  archivedAt: string | null;
  insertedAt: string;
  updatedAt: string;
};

type RouteWorkflowExecutionContractRow = {
  workflowId: string;
  contractId: string;
  issueIdentifier: string;
  repositoryKey: string;
  summary: string;
  objective: string;
  doneDefinition: string;
  mergePolicy: string;
  requiredCapabilityIdsJson: unknown;
  preferredCapabilityIdsJson: unknown;
  forbiddenCapabilityIdsJson: unknown;
  requiredEvidenceIdsJson: unknown;
  allowedModelProfileIdsJson: unknown;
  completionMode: string;
  clarificationMode: string;
  reviewStrictness: string;
  maxRetryCount: number;
  insertedAt: string;
  updatedAt: string;
};

type RouteWorkflowCapabilityPlannerDecisionRow = {
  decisionId: string;
  workflowId: string;
  contractId: string;
  contractUpdatedAt: string;
  policyId: string;
  historyEventSequence: number;
  lifecycleProjectionSequence: number;
  lifecycleCurrentNode: string | null;
  planKind: string;
  planJson: unknown;
  intelligentFlowRouterDecisionJson: unknown;
  recordedAt: string;
  insertedAt: string;
};

type RouteWorkflowCapabilityPlannerCommandRow = {
  commandId: string;
  workflowId: string;
  decisionId: string;
  contractId: string;
  historyEventSequence: number;
  dedupeKey: string | null;
  kind: string;
  commandJson: unknown;
  emittedAt: string;
  insertedAt: string;
};

export type RouteHistoryEventRecord<
  Node extends WorkflowNodeId = WorkflowNodeId,
> = {
  eventId: string;
  workflowId: string;
  eventSequence: number;
  kind: RouteHistoryEventKind;
  recordedAt: string;
  signalId: string | null;
  signalType: string | null;
  signalSource: WorkflowSignalSource | null;
  decisionId: string | null;
  commandId: string | null;
  fromNode: Node | null;
  toNode: Node | null;
  edgeId: string | null;
  reasonCode: string | null;
  event: WorkflowJournalEvent<Node>;
  insertedAt: string;
};

export type RouteDecisionRecord<
  Node extends WorkflowNodeId = WorkflowNodeId,
  Data = unknown,
  Policy = unknown,
> = {
  decisionId: string;
  workflowId: string;
  eventSequence: number;
  signalId: string;
  fromNode: Node | null;
  toNode: Node | null;
  edgeId: string | null;
  reasonCode: string;
  policy: Policy;
  projectionBefore: WorkflowProjection<Node, Data>;
  projectionAfter: WorkflowProjection<Node, Data>;
  commands: WorkflowCommand[];
  trace: WorkflowTraceEntry[];
  selectionMetadata: Record<string, unknown> | null;
  recordedAt: string;
  insertedAt: string;
};

export type RouteProjectionSnapshotRecord<
  Node extends WorkflowNodeId = WorkflowNodeId,
  Data = unknown,
> = {
  workflowId: string;
  eventSequence: number;
  currentNode: Node | null;
  terminal: boolean;
  lastSignalId: string | null;
  lastDecisionId: string | null;
  projection: WorkflowProjection<Node, Data>;
  updatedAt: string;
};

export type RouteWorkflowExecutionContractRecord<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> = WorkflowTicketExecutionContract<CapabilityId, EvidenceId, ProfileId> & {
  insertedAt: string;
};

export type RouteWorkflowCapabilityPlannerPlanKind =
  | "execute"
  | "awaiting_input"
  | "blocked"
  | "ready_for_manual_completion"
  | "ready_for_auto_completion";

export type RouteWorkflowCapabilityPlannerDecisionRecord<
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> = {
  decisionId: string;
  workflowId: string;
  contractId: string;
  contractUpdatedAt: string;
  policyId: string;
  historyEventSequence: number;
  lifecycleProjectionSequence: number;
  lifecycleCurrentNode: string | null;
  planKind: RouteWorkflowCapabilityPlannerPlanKind;
  plan: WorkflowCapabilityPlan<CapabilityId, EvidenceId, ProfileId>;
  intelligentFlowRouterDecision: SymphonyIntelligentFlowRouterDecision | null;
  recordedAt: string;
  insertedAt: string;
};

export type RouteWorkflowCapabilityPlannerCommandRecord<
  Contract extends WorkflowTicketExecutionContract = WorkflowTicketExecutionContract,
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> = {
  commandId: string;
  workflowId: string;
  decisionId: string;
  contractId: string;
  historyEventSequence: number;
  dedupeKey: string | null;
  kind: "capability.execute";
  command: WorkflowCapabilityExecutionCommand<Contract, CapabilityId, ProfileId>;
  emittedAt: string;
  insertedAt: string;
};

export type RouteWorkflowHydrationState<
  Node extends WorkflowNodeId = WorkflowNodeId,
  Data = unknown,
  Policy = unknown,
> = {
  workflow: RouteWorkflowRecord;
  snapshot: RouteProjectionSnapshotRecord<Node, Data> | null;
  tailHistory: RouteHistoryEventRecord<Node>[];
  latestDecision: RouteDecisionRecord<Node, Data, Policy> | null;
  tailAfterEventSequence: number;
};

export interface RouteWorkflowStore {
  createWorkflow(input: {
    trackerIssueId: string;
    repositoryKey: string;
    issueIdentifier: string;
    bindingScope?: RouteWorkflowBindingScope | null;
    routerPresetId: string;
    routerName: string;
    routerVersion: string;
    createdAt: string;
  }): Promise<string>;
  getWorkflow(workflowId: string): Promise<RouteWorkflowRecord | null>;
  getExecutionContract<
    CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
    EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
    ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
  >(
    workflowId: string
  ): Promise<
    RouteWorkflowExecutionContractRecord<CapabilityId, EvidenceId, ProfileId> | null
  >;
  getCapabilityPlannerDecisionForState<
    CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
    EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
    ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
  >(input: {
    workflowId: string;
    historyEventSequence: number;
    contractUpdatedAt: string;
    policyId: string;
  }): Promise<
    RouteWorkflowCapabilityPlannerDecisionRecord<CapabilityId, EvidenceId, ProfileId> | null
  >;
  getCapabilityPlannerCommandByDecisionId<
    Contract extends WorkflowTicketExecutionContract = WorkflowTicketExecutionContract,
    CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
    ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
  >(decisionId: string): Promise<
    RouteWorkflowCapabilityPlannerCommandRecord<Contract, CapabilityId, ProfileId> | null
  >;
  listCapabilityPlannerCommands<
    Contract extends WorkflowTicketExecutionContract = WorkflowTicketExecutionContract,
    CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
    ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
  >(workflowId: string): Promise<
    RouteWorkflowCapabilityPlannerCommandRecord<Contract, CapabilityId, ProfileId>[]
  >;
  getWorkflowForTrackerIssueId(trackerIssueId: string): Promise<RouteWorkflowRecord | null>;
  getWorkflowForIssue(issueIdentifier: string): Promise<RouteWorkflowRecord | null>;
  getWorkflowForScopedIssue(input: {
    issueIdentifier: string;
    bindingScope: RouteWorkflowBindingScope;
  }): Promise<RouteWorkflowRecord | null>;
  listHistory<Node extends WorkflowNodeId = WorkflowNodeId>(
    workflowId: string
  ): Promise<RouteHistoryEventRecord<Node>[]>;
  listHistoryAfter<Node extends WorkflowNodeId = WorkflowNodeId>(input: {
    workflowId: string;
    afterEventSequence: number;
  }): Promise<RouteHistoryEventRecord<Node>[]>;
  listDecisions<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(workflowId: string): Promise<RouteDecisionRecord<Node, Data, Policy>[]>;
  getLatestDecision<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(workflowId: string): Promise<RouteDecisionRecord<Node, Data, Policy> | null>;
  getLatestSnapshot<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
  >(workflowId: string): Promise<RouteProjectionSnapshotRecord<Node, Data> | null>;
  loadWorkflowHydrationState<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(workflowId: string): Promise<RouteWorkflowHydrationState<Node, Data, Policy> | null>;
  loadWorkflowHydrationStateByIssue<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(issueIdentifier: string): Promise<RouteWorkflowHydrationState<Node, Data, Policy> | null>;
  loadWorkflowHydrationStateByScopedIssue<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(input: {
    issueIdentifier: string;
    bindingScope: RouteWorkflowBindingScope;
  }): Promise<RouteWorkflowHydrationState<Node, Data, Policy> | null>;
  recordRouteResult<
    Node extends WorkflowNodeId,
    Data,
    Policy,
  >(input: {
    workflowId: string;
    policy: Policy;
    result: WorkflowRouteResult<Node, Data>;
  }): Promise<{
    history: RouteHistoryEventRecord<Node>[];
    decision: RouteDecisionRecord<Node, Data, Policy>;
    snapshot: RouteProjectionSnapshotRecord<Node, Data>;
  }>;
  appendHistoryEvent<
    Node extends WorkflowNodeId,
  >(input: {
    workflowId: string;
    event: WorkflowJournalEvent<Node>;
  }): Promise<{
    historyEvent: RouteHistoryEventRecord<Node>;
  }>;
  appendHistoryEventWithSnapshot<
    Node extends WorkflowNodeId,
    Data = unknown,
  >(input: {
    workflowId: string;
    event: WorkflowJournalEvent<Node>;
    projection: WorkflowProjection<Node, Data>;
  }): Promise<{
    historyEvent: RouteHistoryEventRecord<Node>;
    snapshot: RouteProjectionSnapshotRecord<Node, Data>;
  }>;
  saveExecutionContract<
    CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
    EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
    ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
  >(input: {
    workflowId: string;
    contract: WorkflowTicketExecutionContract<CapabilityId, EvidenceId, ProfileId>;
    recordedAt: string;
  }): Promise<RouteWorkflowExecutionContractRecord<CapabilityId, EvidenceId, ProfileId>>;
  saveCapabilityPlannerDecision<
    CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
    EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
    ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
  >(input: {
    workflowId: string;
    decisionId: string;
    policyId: string;
    contract: WorkflowTicketExecutionContract<CapabilityId, EvidenceId, ProfileId>;
    historyEventSequence: number;
    lifecycleProjectionSequence: number;
    lifecycleCurrentNode: string | null;
    plan: WorkflowCapabilityPlan<CapabilityId, EvidenceId, ProfileId>;
    intelligentFlowRouterDecision?: SymphonyIntelligentFlowRouterDecision | null;
    command?: WorkflowCapabilityExecutionCommand<
      WorkflowTicketExecutionContract<CapabilityId, EvidenceId, ProfileId>,
      CapabilityId,
      ProfileId
    > | null;
    recordedAt: string;
  }): Promise<{
    decision: RouteWorkflowCapabilityPlannerDecisionRecord<
      CapabilityId,
      EvidenceId,
      ProfileId
    >;
    command: RouteWorkflowCapabilityPlannerCommandRecord<
      WorkflowTicketExecutionContract<CapabilityId, EvidenceId, ProfileId>,
      CapabilityId,
      ProfileId
    > | null;
  }>;
}

export function createRouteWorkflowStore(
  db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>
): RouteWorkflowStore {
  return new SqliteRouteWorkflowStore(db);
}

class SqliteRouteWorkflowStore implements RouteWorkflowStore {
  readonly #db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;

  constructor(
    db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>
  ) {
    this.#db = db;
  }

  async createWorkflow(input: {
    trackerIssueId: string;
    repositoryKey: string;
    issueIdentifier: string;
    bindingScope?: RouteWorkflowBindingScope | null;
    routerPresetId: string;
    routerName: string;
    routerVersion: string;
    createdAt: string;
  }): Promise<string> {
    const workflowId = randomUUID();
    const trackerIssueId = sanitizeRequiredText(input.trackerIssueId, "trackerIssueId");
    const repositoryKey = sanitizeRequiredText(input.repositoryKey, "repositoryKey");
    const issueIdentifier = sanitizeRequiredText(input.issueIdentifier, "issueIdentifier");
    const bindingScope = normalizeLifecycleBindingScope(input.bindingScope);
    const routerPresetId = sanitizeRequiredText(input.routerPresetId, "routerPresetId");
    const routerName = sanitizeRequiredText(input.routerName, "routerName");
    const routerVersion = sanitizeRequiredText(input.routerVersion, "routerVersion");
    const now = sanitizeRequiredText(input.createdAt, "createdAt");
    const canonicalIssue = this.#selectCanonicalIssueBindingByTrackerIssueId({
      trackerIssueId
    });

    if (!canonicalIssue) {
      throw new TypeError(
        `Issue binding not found for route workflow create: ${trackerIssueId}.`
      );
    }

    assertCanonicalWorkflowIssueCompatibility({
      trackerIssueId,
      issueIdentifier,
      repositoryKey,
      bindingScope,
      issue: canonicalIssue
    });

    try {
      this.#db.insert(routeWorkflowsTable)
        .values({
          workflowId,
          trackerIssueId,
          routerPresetId,
          routerName,
          routerVersion,
          archivedAt: null,
          insertedAt: now,
          updatedAt: now
        })
        .run();
    } catch (error) {
      if (isLiveWorkflowConstraintError(error)) {
        const existing = this.#selectLiveWorkflowRecordByTrackerIssueId(
          trackerIssueId
        );

        if (existing) {
          throw new SymphonyRouteWorkflowExistsError({
            issueIdentifier: existing.issueIdentifier,
            existingWorkflowId: existing.workflowId
          });
        }
      }

      throw error;
    }

    return workflowId;
  }

  async getWorkflow(workflowId: string): Promise<RouteWorkflowRecord | null> {
    const row = this.#selectWorkflowRecordByWorkflowId(
      sanitizeRequiredText(workflowId, "workflowId")
    );

    return row ? mapWorkflowRow(row) : null;
  }

  async getExecutionContract<
    CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
    EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
    ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
  >(
    workflowId: string
  ): Promise<
    RouteWorkflowExecutionContractRecord<CapabilityId, EvidenceId, ProfileId> | null
  > {
    const row = this.#selectExecutionContractByWorkflowId(
      sanitizeRequiredText(workflowId, "workflowId")
    );

    return row
      ? mapExecutionContractRow<CapabilityId, EvidenceId, ProfileId>(row)
      : null;
  }

  async getCapabilityPlannerDecisionForState<
    CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
    EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
    ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
  >(input: {
    workflowId: string;
    historyEventSequence: number;
    contractUpdatedAt: string;
    policyId: string;
  }): Promise<
    RouteWorkflowCapabilityPlannerDecisionRecord<CapabilityId, EvidenceId, ProfileId> | null
  > {
    const row = this.#selectCapabilityPlannerDecisionByState({
      workflowId: sanitizeRequiredText(input.workflowId, "workflowId"),
      historyEventSequence: sanitizeEventSequence(
        input.historyEventSequence,
        "historyEventSequence"
      ),
      contractUpdatedAt: sanitizeRequiredText(
        input.contractUpdatedAt,
        "contractUpdatedAt"
      ),
      policyId: sanitizeRequiredText(input.policyId, "policyId")
    });

    return row
      ? mapCapabilityPlannerDecisionRow<CapabilityId, EvidenceId, ProfileId>(row)
      : null;
  }

  async getCapabilityPlannerCommandByDecisionId<
    Contract extends WorkflowTicketExecutionContract = WorkflowTicketExecutionContract,
    CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
    ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
  >(decisionId: string): Promise<
    RouteWorkflowCapabilityPlannerCommandRecord<Contract, CapabilityId, ProfileId> | null
  > {
    const row = this.#selectCapabilityPlannerCommandByDecisionId(
      sanitizeRequiredText(decisionId, "decisionId")
    );

    return row
      ? mapCapabilityPlannerCommandRow<Contract, CapabilityId, ProfileId>(row)
      : null;
  }

  async listCapabilityPlannerCommands<
    Contract extends WorkflowTicketExecutionContract = WorkflowTicketExecutionContract,
    CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
    ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
  >(workflowId: string): Promise<
    RouteWorkflowCapabilityPlannerCommandRecord<Contract, CapabilityId, ProfileId>[]
  > {
    const normalizedWorkflowId = sanitizeRequiredText(workflowId, "workflowId");

    return this.#db
      .select({
        commandId: routeWorkflowCapabilityPlannerCommandsTable.commandId,
        workflowId: routeWorkflowCapabilityPlannerCommandsTable.workflowId,
        decisionId: routeWorkflowCapabilityPlannerCommandsTable.decisionId,
        contractId: routeWorkflowCapabilityPlannerCommandsTable.contractId,
        historyEventSequence:
          routeWorkflowCapabilityPlannerCommandsTable.historyEventSequence,
        dedupeKey: routeWorkflowCapabilityPlannerCommandsTable.dedupeKey,
        kind: routeWorkflowCapabilityPlannerCommandsTable.kind,
        commandJson: routeWorkflowCapabilityPlannerCommandsTable.commandJson,
        emittedAt: routeWorkflowCapabilityPlannerCommandsTable.emittedAt,
        insertedAt: routeWorkflowCapabilityPlannerCommandsTable.insertedAt
      })
      .from(routeWorkflowCapabilityPlannerCommandsTable)
      .where(eq(routeWorkflowCapabilityPlannerCommandsTable.workflowId, normalizedWorkflowId))
      .orderBy(asc(routeWorkflowCapabilityPlannerCommandsTable.emittedAt))
      .all()
      .map((row) =>
        mapCapabilityPlannerCommandRow<Contract, CapabilityId, ProfileId>(row)
      );
  }

  async getWorkflowForTrackerIssueId(
    trackerIssueId: string
  ): Promise<RouteWorkflowRecord | null> {
    const row = this.#selectLiveWorkflowRecordByTrackerIssueId(
      sanitizeRequiredText(trackerIssueId, "trackerIssueId")
    );

    return row ? mapWorkflowRow(row) : null;
  }

  async getWorkflowForIssue(issueIdentifier: string): Promise<RouteWorkflowRecord | null> {
    const row = this.#selectLiveWorkflowRecordByIssue({
      issueIdentifier,
      bindingScope: null
    });

    return row ? mapWorkflowRow(row) : null;
  }

  async getWorkflowForScopedIssue(input: {
    issueIdentifier: string;
    bindingScope: RouteWorkflowBindingScope;
  }): Promise<RouteWorkflowRecord | null> {
    const row = this.#selectLiveWorkflowRecordByIssue({
      issueIdentifier: input.issueIdentifier,
      bindingScope: input.bindingScope
    });

    return row ? mapWorkflowRow(row) : null;
  }

  async listHistory<Node extends WorkflowNodeId = WorkflowNodeId>(
    workflowId: string
  ): Promise<RouteHistoryEventRecord<Node>[]> {
    const normalizedWorkflowId = sanitizeRequiredText(workflowId, "workflowId");

    return this.#db
      .select()
      .from(routeHistoryEventsTable)
      .where(eq(routeHistoryEventsTable.workflowId, normalizedWorkflowId))
      .orderBy(asc(routeHistoryEventsTable.eventSequence))
      .all()
      .map((row) => mapHistoryRow<Node>(row));
  }

  async listHistoryAfter<Node extends WorkflowNodeId = WorkflowNodeId>(input: {
    workflowId: string;
    afterEventSequence: number;
  }): Promise<RouteHistoryEventRecord<Node>[]> {
    const workflowId = sanitizeRequiredText(input.workflowId, "workflowId");
    const afterEventSequence = sanitizeEventSequence(
      input.afterEventSequence,
      "afterEventSequence"
    );

    return this.#db
      .select()
      .from(routeHistoryEventsTable)
      .where(
        and(
          eq(routeHistoryEventsTable.workflowId, workflowId),
          gt(routeHistoryEventsTable.eventSequence, afterEventSequence)
        )
      )
      .orderBy(asc(routeHistoryEventsTable.eventSequence))
      .all()
      .map((row) => mapHistoryRow<Node>(row));
  }

  async listDecisions<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(workflowId: string): Promise<RouteDecisionRecord<Node, Data, Policy>[]> {
    const normalizedWorkflowId = sanitizeRequiredText(workflowId, "workflowId");

    return this.#db
      .select()
      .from(routeDecisionsTable)
      .where(eq(routeDecisionsTable.workflowId, normalizedWorkflowId))
      .orderBy(asc(routeDecisionsTable.eventSequence))
      .all()
      .map((row) => mapDecisionRow<Node, Data, Policy>(row));
  }

  async getLatestDecision<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(workflowId: string): Promise<RouteDecisionRecord<Node, Data, Policy> | null> {
    const row = this.#db
      .select()
      .from(routeDecisionsTable)
      .where(eq(routeDecisionsTable.workflowId, sanitizeRequiredText(workflowId, "workflowId")))
      .orderBy(desc(routeDecisionsTable.eventSequence))
      .limit(1)
      .get();

    return row ? mapDecisionRow<Node, Data, Policy>(row) : null;
  }

  async getLatestSnapshot<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
  >(workflowId: string): Promise<RouteProjectionSnapshotRecord<Node, Data> | null> {
    const row = this.#db
      .select()
      .from(routeProjectionSnapshotsTable)
      .where(eq(routeProjectionSnapshotsTable.workflowId, sanitizeRequiredText(workflowId, "workflowId")))
      .get();

    return row ? mapSnapshotRow<Node, Data>(row) : null;
  }

  async loadWorkflowHydrationState<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(workflowId: string): Promise<RouteWorkflowHydrationState<Node, Data, Policy> | null> {
    const normalizedWorkflowId = sanitizeRequiredText(workflowId, "workflowId");

    return this.#db.transaction((tx) => {
      const workflowRow = this.#selectWorkflowRecordByWorkflowId(
        normalizedWorkflowId,
        tx
      );

      if (!workflowRow) {
        return null;
      }

      return this.#loadHydrationStateByWorkflowRow<Node, Data, Policy>(tx, workflowRow);
    });
  }

  async loadWorkflowHydrationStateByIssue<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(issueIdentifier: string): Promise<RouteWorkflowHydrationState<Node, Data, Policy> | null> {
    return this.#db.transaction((tx) => {
      const workflowRow = this.#selectLiveWorkflowRecordByIssue(
        {
          issueIdentifier,
          bindingScope: null
        },
        tx
      );

      if (!workflowRow) {
        return null;
      }

      return this.#loadHydrationStateByWorkflowRow<Node, Data, Policy>(tx, workflowRow);
    });
  }

  async loadWorkflowHydrationStateByScopedIssue<
    Node extends WorkflowNodeId = WorkflowNodeId,
    Data = unknown,
    Policy = unknown,
  >(input: {
    issueIdentifier: string;
    bindingScope: RouteWorkflowBindingScope;
  }): Promise<RouteWorkflowHydrationState<Node, Data, Policy> | null> {
    return this.#db.transaction((tx) => {
      const workflowRow = this.#selectLiveWorkflowRecordByIssue(input, tx);

      if (!workflowRow) {
        return null;
      }

      return this.#loadHydrationStateByWorkflowRow<Node, Data, Policy>(tx, workflowRow);
    });
  }

  async recordRouteResult<
    Node extends WorkflowNodeId,
    Data,
    Policy,
  >(input: {
    workflowId: string;
    policy: Policy;
    result: WorkflowRouteResult<Node, Data>;
  }): Promise<{
    history: RouteHistoryEventRecord<Node>[];
    decision: RouteDecisionRecord<Node, Data, Policy>;
    snapshot: RouteProjectionSnapshotRecord<Node, Data>;
  }> {
    const workflowId = sanitizeRequiredText(input.workflowId, "workflowId");
    assertProjectionWorkflowId(input.result.projectionBefore.workflowId, workflowId);
    assertProjectionWorkflowId(input.result.projectionAfter.workflowId, workflowId);

    const signalId = requireSignalId(input.result.signalEvent);
    const decisionEvent = input.result.events.find(
      (event): event is Extract<WorkflowJournalEvent<Node>, { kind: "decision_recorded" }> =>
        event.kind === "decision_recorded"
    );

    if (!decisionEvent) {
      throw new TypeError("Route result must include a decision_recorded event.");
    }

    if (decisionEvent.decision.id !== input.result.decision.id) {
      throw new TypeError("Route result decision does not match its decision_recorded event.");
    }

    const now = new Date().toISOString();

    return this.#db.transaction((tx) => {
      this.#requireWorkflow(tx, workflowId);
      const startingSequence = this.#latestEventSequence(tx, workflowId);
      const historyRows = input.result.events.map((event, index) =>
        buildHistoryRow<Node>({
          workflowId,
          event,
          eventSequence: startingSequence + index + 1
        })
      );

      tx.insert(routeHistoryEventsTable)
        .values(historyRows.map((row) => row.insert))
        .run();

      const decisionHistoryRow = historyRows.find(
        (row) => row.record.kind === "decision_recorded"
      );

      if (!decisionHistoryRow) {
        throw new TypeError("Route result must persist a decision history row.");
      }

      const decisionRecord: RouteDecisionRecord<Node, Data, Policy> = {
        decisionId: input.result.decision.id,
        workflowId,
        eventSequence: decisionHistoryRow.record.eventSequence,
        signalId,
        fromNode: input.result.decision.fromNode,
        toNode: input.result.decision.toNode,
        edgeId: input.result.decision.edgeId,
        reasonCode: input.result.decision.reasonCode,
        policy: input.policy,
        projectionBefore: input.result.projectionBefore,
        projectionAfter: input.result.projectionAfter,
        commands: input.result.decision.commands,
        trace: input.result.decision.trace,
        selectionMetadata: requireNullableRecord(
          input.result.decision.selectionMetadata,
          "decision.selectionMetadata"
        ),
        recordedAt: decisionEvent.recordedAt,
        insertedAt: now
      };

      tx.insert(routeDecisionsTable)
        .values({
          decisionId: decisionRecord.decisionId,
          workflowId,
          eventSequence: decisionRecord.eventSequence,
          signalId: decisionRecord.signalId,
          fromNode: decisionRecord.fromNode,
          toNode: decisionRecord.toNode,
          edgeId: decisionRecord.edgeId,
          reasonCode: decisionRecord.reasonCode,
          policyJson: decisionRecord.policy,
          projectionBeforeJson: decisionRecord.projectionBefore,
          projectionAfterJson: decisionRecord.projectionAfter,
          commandsJson: decisionRecord.commands,
          traceJson: decisionRecord.trace,
          selectionMetadataJson: decisionRecord.selectionMetadata,
          recordedAt: decisionRecord.recordedAt,
          insertedAt: decisionRecord.insertedAt
        })
        .run();

      const snapshot = buildSnapshotRecord({
        workflowId,
        eventSequence: historyRows.at(-1)!.record.eventSequence,
        projection: input.result.projectionAfter,
        updatedAt: now
      });

      tx.insert(routeProjectionSnapshotsTable)
        .values(snapshot.insert)
        .onConflictDoUpdate({
          target: routeProjectionSnapshotsTable.workflowId,
          set: {
            eventSequence: snapshot.insert.eventSequence,
            currentNode: snapshot.insert.currentNode,
            terminal: snapshot.insert.terminal,
            lastSignalId: snapshot.insert.lastSignalId,
            lastDecisionId: snapshot.insert.lastDecisionId,
            projectionJson: snapshot.insert.projectionJson,
            updatedAt: snapshot.insert.updatedAt
          }
        })
        .run();

      tx.update(routeWorkflowsTable)
        .set({
          updatedAt: now
        })
        .where(eq(routeWorkflowsTable.workflowId, workflowId))
        .run();

      return {
        history: historyRows.map((row) => row.record),
        decision: decisionRecord,
        snapshot: snapshot.record
      };
    });
  }

  async appendHistoryEvent<
    Node extends WorkflowNodeId,
  >(input: {
    workflowId: string;
    event: WorkflowJournalEvent<Node>;
  }): Promise<{
    historyEvent: RouteHistoryEventRecord<Node>;
  }> {
    return await this.#appendHistoryEvent({
      workflowId: input.workflowId,
      event: input.event
    });
  }

  async appendHistoryEventWithSnapshot<
    Node extends WorkflowNodeId,
    Data = unknown,
  >(input: {
    workflowId: string;
    event: WorkflowJournalEvent<Node>;
    projection: WorkflowProjection<Node, Data>;
  }): Promise<{
    historyEvent: RouteHistoryEventRecord<Node>;
    snapshot: RouteProjectionSnapshotRecord<Node, Data>;
  }> {
    const appended = await this.#appendHistoryEvent({
      workflowId: input.workflowId,
      event: input.event,
      projection: input.projection
    });

    return {
      historyEvent: appended.historyEvent,
      snapshot: appended.snapshot ?? (() => {
        throw new TypeError(
          `Route workflow ${input.workflowId} did not persist a snapshot for appendHistoryEventWithSnapshot.`
        );
      })()
    };
  }

  async saveExecutionContract<
    CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
    EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
    ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
  >(input: {
    workflowId: string;
    contract: WorkflowTicketExecutionContract<CapabilityId, EvidenceId, ProfileId>;
    recordedAt: string;
  }): Promise<RouteWorkflowExecutionContractRecord<CapabilityId, EvidenceId, ProfileId>> {
    const workflowId = sanitizeRequiredText(input.workflowId, "workflowId");
    const contract = input.contract;
    const recordedAt = sanitizeRequiredText(input.recordedAt, "recordedAt");

    if (sanitizeRequiredText(contract.workflowId, "contract.workflowId") !== workflowId) {
      throw new TypeError(
        `Execution contract workflowId ${contract.workflowId} does not match route workflow ${workflowId}.`
      );
    }

    const contractId = sanitizeRequiredText(contract.contractId, "contract.contractId");
    const summary = sanitizeRequiredText(contract.summary, "contract.summary");
    const objective = sanitizeRequiredText(contract.objective, "contract.objective");
    const doneDefinition = sanitizeRequiredText(
      contract.doneDefinition,
      "contract.doneDefinition"
    );
    const existing = this.#selectExecutionContractByWorkflowId(workflowId);

    if (existing && existing.contractId !== contractId) {
      throw new TypeError(
        `Route workflow ${workflowId} already has execution contract ${existing.contractId}, not ${contractId}.`
      );
    }

    const requiredCapabilityIds = requireStringArray(
      contract.routingDirectives.requiredCapabilityIds,
      "contract.routingDirectives.requiredCapabilityIds"
    );
    const preferredCapabilityIds = requireStringArray(
      contract.routingDirectives.preferredCapabilityIds,
      "contract.routingDirectives.preferredCapabilityIds"
    );
    const forbiddenCapabilityIds = requireStringArray(
      contract.routingDirectives.forbiddenCapabilityIds,
      "contract.routingDirectives.forbiddenCapabilityIds"
    );
    const requiredEvidenceIds = requireStringArray(
      contract.routingDirectives.requiredEvidenceIds,
      "contract.routingDirectives.requiredEvidenceIds"
    );
    const allowedModelProfileIds = requireStringArray(
      contract.routingDirectives.allowedModelProfileIds,
      "contract.routingDirectives.allowedModelProfileIds"
    );
    const maxRetryCount = sanitizeNonNegativeInteger(
      contract.routingDirectives.maxRetryCount,
      "contract.routingDirectives.maxRetryCount"
    );

    this.#db.transaction((tx) => {
      this.#requireWorkflow(tx, workflowId);

      tx.insert(routeWorkflowExecutionContractsTable)
        .values({
          workflowId,
          contractId,
          summary,
          objective,
          doneDefinition,
          mergePolicy: contract.mergePolicy,
          requiredCapabilityIdsJson: requiredCapabilityIds,
          preferredCapabilityIdsJson: preferredCapabilityIds,
          forbiddenCapabilityIdsJson: forbiddenCapabilityIds,
          requiredEvidenceIdsJson: requiredEvidenceIds,
          allowedModelProfileIdsJson: allowedModelProfileIds,
          completionMode: contract.routingDirectives.completionPolicy.mode,
          clarificationMode: contract.routingDirectives.clarificationPolicy.mode,
          reviewStrictness: contract.routingDirectives.reviewStrictness,
          maxRetryCount,
          insertedAt: existing?.insertedAt ?? recordedAt,
          updatedAt: recordedAt
        })
        .onConflictDoUpdate({
          target: routeWorkflowExecutionContractsTable.workflowId,
          set: {
            summary,
            objective,
            doneDefinition,
            mergePolicy: contract.mergePolicy,
            requiredCapabilityIdsJson: requiredCapabilityIds,
            preferredCapabilityIdsJson: preferredCapabilityIds,
            forbiddenCapabilityIdsJson: forbiddenCapabilityIds,
            requiredEvidenceIdsJson: requiredEvidenceIds,
            allowedModelProfileIdsJson: allowedModelProfileIds,
            completionMode: contract.routingDirectives.completionPolicy.mode,
            clarificationMode: contract.routingDirectives.clarificationPolicy.mode,
            reviewStrictness: contract.routingDirectives.reviewStrictness,
            maxRetryCount,
            updatedAt: recordedAt
          }
        })
        .run();

      tx.update(routeWorkflowsTable)
        .set({
          updatedAt: recordedAt
        })
        .where(eq(routeWorkflowsTable.workflowId, workflowId))
        .run();
    });

    const saved = this.#selectExecutionContractByWorkflowId(workflowId);
    if (!saved) {
      throw new TypeError(
        `Route workflow ${workflowId} did not persist an execution contract.`
      );
    }

  return mapExecutionContractRow<CapabilityId, EvidenceId, ProfileId>(saved);
  }

  async saveCapabilityPlannerDecision<
    CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
    EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
    ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
  >(input: {
    workflowId: string;
    decisionId: string;
    policyId: string;
    contract: WorkflowTicketExecutionContract<CapabilityId, EvidenceId, ProfileId>;
    historyEventSequence: number;
    lifecycleProjectionSequence: number;
    lifecycleCurrentNode: string | null;
    plan: WorkflowCapabilityPlan<CapabilityId, EvidenceId, ProfileId>;
    intelligentFlowRouterDecision?: SymphonyIntelligentFlowRouterDecision | null;
    command?: WorkflowCapabilityExecutionCommand<
      WorkflowTicketExecutionContract<CapabilityId, EvidenceId, ProfileId>,
      CapabilityId,
      ProfileId
    > | null;
    recordedAt: string;
  }): Promise<{
    decision: RouteWorkflowCapabilityPlannerDecisionRecord<
      CapabilityId,
      EvidenceId,
      ProfileId
    >;
    command: RouteWorkflowCapabilityPlannerCommandRecord<
      WorkflowTicketExecutionContract<CapabilityId, EvidenceId, ProfileId>,
      CapabilityId,
      ProfileId
    > | null;
  }> {
    const workflowId = sanitizeRequiredText(input.workflowId, "workflowId");
    const decisionId = sanitizeRequiredText(input.decisionId, "decisionId");
    const policyId = sanitizeRequiredText(input.policyId, "policyId");
    const contract = input.contract;
    const recordedAt = sanitizeRequiredText(input.recordedAt, "recordedAt");

    if (sanitizeRequiredText(contract.workflowId, "contract.workflowId") !== workflowId) {
      throw new TypeError(
        `Capability planner contract workflowId ${contract.workflowId} does not match route workflow ${workflowId}.`
      );
    }

    const contractId = sanitizeRequiredText(contract.contractId, "contract.contractId");
    const contractUpdatedAt = sanitizeRequiredText(
      contract.updatedAt,
      "contract.updatedAt"
    );
    const historyEventSequence = sanitizeEventSequence(
      input.historyEventSequence,
      "historyEventSequence"
    );
    const lifecycleProjectionSequence = sanitizeEventSequence(
      input.lifecycleProjectionSequence,
      "lifecycleProjectionSequence"
    );
    const lifecycleCurrentNode = sanitizeOptionalText(input.lifecycleCurrentNode);
    const planKind = sanitizeCapabilityPlannerPlanKind(input.plan.kind);
    const intelligentFlowRouterDecision =
      input.intelligentFlowRouterDecision === undefined
        ? null
        : validateIntelligentFlowRouterDecision({
            decision: input.intelligentFlowRouterDecision,
            decisionId,
            workflowId,
            policyId,
            recordedAt,
            plan: input.plan
          });

    if (planKind === "execute") {
      if (!input.command) {
        throw new TypeError(
          "Capability planner execute decisions must persist a capability.execute command."
        );
      }
    } else if (input.command) {
      throw new TypeError(
        `Capability planner decision kind ${planKind} cannot persist a command.`
      );
    }

    if (input.command) {
      if (input.command.kind !== "capability.execute") {
        throw new TypeError(
          `Unsupported capability planner command kind ${input.command.kind}.`
        );
      }
      if (
        sanitizeRequiredText(
          input.command.payload.workflowId,
          "command.payload.workflowId"
        ) !== workflowId
      ) {
        throw new TypeError(
          `Capability planner command workflowId ${input.command.payload.workflowId} does not match route workflow ${workflowId}.`
        );
      }
      if (
        sanitizeRequiredText(
          input.command.payload.contract.contractId,
          "command.payload.contract.contractId"
        ) !== contractId
      ) {
        throw new TypeError(
          `Capability planner command contract ${input.command.payload.contract.contractId} does not match planner contract ${contractId}.`
        );
      }
      if (input.plan.kind !== "execute") {
        throw new TypeError(
          "Capability planner command persistence requires an execute plan."
        );
      }
      if (
        input.command.payload.capabilityId !== input.plan.decision.capabilityId ||
        input.command.payload.modelProfileId !== input.plan.decision.modelProfileId
      ) {
        throw new TypeError(
          "Capability planner command does not match the execute decision."
        );
      }
    }

    return this.#db.transaction((tx) => {
      this.#requireWorkflow(tx, workflowId);

      const existingDecision = this.#selectCapabilityPlannerDecisionByState(
        {
          workflowId,
          historyEventSequence,
          contractUpdatedAt,
          policyId
        },
        tx
      );
      if (existingDecision) {
        return {
          decision: mapCapabilityPlannerDecisionRow<
            CapabilityId,
            EvidenceId,
            ProfileId
          >(existingDecision),
          command: existingDecision.planKind === "execute"
            ? (() => {
                const existingCommand = this.#selectCapabilityPlannerCommandByDecisionId(
                  existingDecision.decisionId,
                  tx
                );
                if (!existingCommand) {
                  throw new TypeError(
                    `Capability planner decision ${existingDecision.decisionId} is missing its emitted command.`
                  );
                }

                return mapCapabilityPlannerCommandRow<
                  WorkflowTicketExecutionContract<CapabilityId, EvidenceId, ProfileId>,
                  CapabilityId,
                  ProfileId
                >(existingCommand);
              })()
            : null
        };
      }

      tx.insert(routeWorkflowCapabilityPlannerDecisionsTable)
        .values({
          decisionId,
          workflowId,
          contractId,
          contractUpdatedAt,
          policyId,
          historyEventSequence,
          lifecycleProjectionSequence,
          lifecycleCurrentNode,
          planKind,
          planJson: input.plan,
          intelligentFlowRouterDecisionJson: intelligentFlowRouterDecision,
          recordedAt,
          insertedAt: recordedAt
        })
        .run();

      let command: RouteWorkflowCapabilityPlannerCommandRecord<
        WorkflowTicketExecutionContract<CapabilityId, EvidenceId, ProfileId>,
        CapabilityId,
        ProfileId
      > | null = null;

      if (input.command) {
        const commandId = sanitizeRequiredText(input.command.id, "command.id");

        tx.insert(routeWorkflowCapabilityPlannerCommandsTable)
          .values({
            commandId,
            workflowId,
            decisionId,
            contractId,
            historyEventSequence,
            dedupeKey: input.command.dedupeKey,
            kind: input.command.kind,
            commandJson: input.command,
            emittedAt: recordedAt,
            insertedAt: recordedAt
          })
          .run();

        command = {
          commandId,
          workflowId,
          decisionId,
          contractId,
          historyEventSequence,
          dedupeKey: input.command.dedupeKey,
          kind: "capability.execute",
          command: input.command,
          emittedAt: recordedAt,
          insertedAt: recordedAt
        };
      }

      tx.update(routeWorkflowsTable)
        .set({
          updatedAt: recordedAt
        })
        .where(eq(routeWorkflowsTable.workflowId, workflowId))
        .run();

      return {
        decision: {
          decisionId,
          workflowId,
          contractId,
          contractUpdatedAt,
          policyId,
          historyEventSequence,
          lifecycleProjectionSequence,
          lifecycleCurrentNode,
          planKind,
          plan: input.plan,
          intelligentFlowRouterDecision,
          recordedAt,
          insertedAt: recordedAt
        },
        command
      };
    });
  }

  async #appendHistoryEvent<
    Node extends WorkflowNodeId,
    Data = unknown,
  >(input: {
    workflowId: string;
    event: WorkflowJournalEvent<Node>;
    projection?: WorkflowProjection<Node, Data>;
  }): Promise<{
    historyEvent: RouteHistoryEventRecord<Node>;
    snapshot: RouteProjectionSnapshotRecord<Node, Data> | null;
  }> {
    const workflowId = sanitizeRequiredText(input.workflowId, "workflowId");
    if (input.projection) {
      assertProjectionWorkflowId(input.projection.workflowId, workflowId);
    }

    const now = new Date().toISOString();

    return this.#db.transaction((tx) => {
      this.#requireWorkflow(tx, workflowId);
      const eventSequence = this.#latestEventSequence(tx, workflowId) + 1;
      const historyRow = buildHistoryRow<Node>({
        workflowId,
        event: input.event,
        eventSequence
      });

      tx.insert(routeHistoryEventsTable)
        .values(historyRow.insert)
        .run();

      let snapshot: RouteProjectionSnapshotRecord<Node, Data> | null = null;
      if (input.projection) {
        const currentSnapshotRow = tx
          .select()
          .from(routeProjectionSnapshotsTable)
          .where(eq(routeProjectionSnapshotsTable.workflowId, workflowId))
          .get();
        const currentSnapshot = currentSnapshotRow
          ? mapSnapshotRow<Node, Data>(currentSnapshotRow)
          : null;
        const nextSnapshot = buildSnapshotRecord({
          workflowId,
          eventSequence,
          projection: input.projection,
          updatedAt: now
        });
        if (
          currentSnapshot &&
          currentSnapshot.projection.sequence > nextSnapshot.record.projection.sequence
        ) {
          snapshot = currentSnapshot;
        } else {
          tx.insert(routeProjectionSnapshotsTable)
            .values(nextSnapshot.insert)
            .onConflictDoUpdate({
              target: routeProjectionSnapshotsTable.workflowId,
              set: {
                eventSequence: nextSnapshot.insert.eventSequence,
                currentNode: nextSnapshot.insert.currentNode,
                terminal: nextSnapshot.insert.terminal,
                lastSignalId: nextSnapshot.insert.lastSignalId,
                lastDecisionId: nextSnapshot.insert.lastDecisionId,
                projectionJson: nextSnapshot.insert.projectionJson,
                updatedAt: nextSnapshot.insert.updatedAt
              }
            })
            .run();
          snapshot = nextSnapshot.record;
        }
      }

      tx.update(routeWorkflowsTable)
        .set({
          updatedAt: now
        })
        .where(eq(routeWorkflowsTable.workflowId, workflowId))
        .run();

      return {
        historyEvent: historyRow.record,
        snapshot
      };
    });
  }

  #selectCanonicalIssueBindingByTrackerIssueId(
    input: {
      trackerIssueId: string;
    },
    db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema> = this.#db
  ): CanonicalIssueBindingRow | undefined {
    const trackerIssueId = sanitizeRequiredText(input.trackerIssueId, "trackerIssueId");

    return db
      .select({
        trackerIssueId: symphonyIssuesTable.trackerIssueId,
        issueIdentifier: symphonyIssuesTable.issueIdentifier,
        repositoryKey: symphonyIssuesTable.repositoryKey,
        organizationId: symphonyIssuesTable.organizationId,
        linearWorkspaceIdentityId: symphonyIssuesTable.linearWorkspaceIdentityId
      })
      .from(symphonyIssuesTable)
      .where(eq(symphonyIssuesTable.trackerIssueId, trackerIssueId))
      .get();
  }

  #selectWorkflowRecordByWorkflowId(
    workflowId: string,
    db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema> = this.#db
  ): RouteWorkflowRecordRow | undefined {
    return db
      .select({
        workflowId: routeWorkflowsTable.workflowId,
        trackerIssueId: routeWorkflowsTable.trackerIssueId,
        repositoryKey: symphonyIssuesTable.repositoryKey,
        issueIdentifier: symphonyIssuesTable.issueIdentifier,
        organizationId: symphonyIssuesTable.organizationId,
        linearWorkspaceIdentityId: symphonyIssuesTable.linearWorkspaceIdentityId,
        routerPresetId: routeWorkflowsTable.routerPresetId,
        routerName: routeWorkflowsTable.routerName,
        routerVersion: routeWorkflowsTable.routerVersion,
        archivedAt: routeWorkflowsTable.archivedAt,
        insertedAt: routeWorkflowsTable.insertedAt,
        updatedAt: routeWorkflowsTable.updatedAt
      })
      .from(routeWorkflowsTable)
      .innerJoin(
        symphonyIssuesTable,
        eq(routeWorkflowsTable.trackerIssueId, symphonyIssuesTable.trackerIssueId)
      )
      .where(eq(routeWorkflowsTable.workflowId, workflowId))
      .get();
  }

  #selectLiveWorkflowRecordByTrackerIssueId(
    trackerIssueId: string,
    db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema> = this.#db
  ): RouteWorkflowRecordRow | undefined {
    return db
      .select({
        workflowId: routeWorkflowsTable.workflowId,
        trackerIssueId: routeWorkflowsTable.trackerIssueId,
        repositoryKey: symphonyIssuesTable.repositoryKey,
        issueIdentifier: symphonyIssuesTable.issueIdentifier,
        organizationId: symphonyIssuesTable.organizationId,
        linearWorkspaceIdentityId: symphonyIssuesTable.linearWorkspaceIdentityId,
        routerPresetId: routeWorkflowsTable.routerPresetId,
        routerName: routeWorkflowsTable.routerName,
        routerVersion: routeWorkflowsTable.routerVersion,
        archivedAt: routeWorkflowsTable.archivedAt,
        insertedAt: routeWorkflowsTable.insertedAt,
        updatedAt: routeWorkflowsTable.updatedAt
      })
      .from(routeWorkflowsTable)
      .innerJoin(
        symphonyIssuesTable,
        eq(routeWorkflowsTable.trackerIssueId, symphonyIssuesTable.trackerIssueId)
      )
      .where(
        and(
          eq(routeWorkflowsTable.trackerIssueId, trackerIssueId),
          isNull(routeWorkflowsTable.archivedAt)
        )
      )
      .get();
  }

  #selectLiveWorkflowRecordByIssue(
    input: {
      issueIdentifier: string;
      bindingScope: RouteWorkflowBindingScope | null;
    },
    db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema> = this.#db
  ): RouteWorkflowRecordRow | undefined {
    const issueIdentifier = sanitizeRequiredText(
      input.issueIdentifier,
      "issueIdentifier"
    );
    const bindingScope = normalizeLifecycleBindingScope(input.bindingScope);

    const whereClause = bindingScope
      ? and(
          eq(symphonyIssuesTable.issueIdentifier, issueIdentifier),
          eq(symphonyIssuesTable.organizationId, bindingScope.organizationId),
          eq(
            symphonyIssuesTable.linearWorkspaceIdentityId,
            bindingScope.linearWorkspaceIdentityId
          ),
          isNull(routeWorkflowsTable.archivedAt)
        )
      : and(
          eq(symphonyIssuesTable.issueIdentifier, issueIdentifier),
          isNull(symphonyIssuesTable.organizationId),
          isNull(symphonyIssuesTable.linearWorkspaceIdentityId),
          isNull(routeWorkflowsTable.archivedAt)
        );

    return db
      .select({
        workflowId: routeWorkflowsTable.workflowId,
        trackerIssueId: routeWorkflowsTable.trackerIssueId,
        repositoryKey: symphonyIssuesTable.repositoryKey,
        issueIdentifier: symphonyIssuesTable.issueIdentifier,
        organizationId: symphonyIssuesTable.organizationId,
        linearWorkspaceIdentityId: symphonyIssuesTable.linearWorkspaceIdentityId,
        routerPresetId: routeWorkflowsTable.routerPresetId,
        routerName: routeWorkflowsTable.routerName,
        routerVersion: routeWorkflowsTable.routerVersion,
        archivedAt: routeWorkflowsTable.archivedAt,
        insertedAt: routeWorkflowsTable.insertedAt,
        updatedAt: routeWorkflowsTable.updatedAt
      })
      .from(routeWorkflowsTable)
      .innerJoin(
        symphonyIssuesTable,
        eq(routeWorkflowsTable.trackerIssueId, symphonyIssuesTable.trackerIssueId)
      )
      .where(whereClause)
      .get();
  }

  #selectExecutionContractByWorkflowId(
    workflowId: string,
    db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema> = this.#db
  ): RouteWorkflowExecutionContractRow | undefined {
    return db
      .select({
        workflowId: routeWorkflowExecutionContractsTable.workflowId,
        contractId: routeWorkflowExecutionContractsTable.contractId,
        issueIdentifier: symphonyIssuesTable.issueIdentifier,
        repositoryKey: symphonyIssuesTable.repositoryKey,
        summary: routeWorkflowExecutionContractsTable.summary,
        objective: routeWorkflowExecutionContractsTable.objective,
        doneDefinition: routeWorkflowExecutionContractsTable.doneDefinition,
        mergePolicy: routeWorkflowExecutionContractsTable.mergePolicy,
        requiredCapabilityIdsJson:
          routeWorkflowExecutionContractsTable.requiredCapabilityIdsJson,
        preferredCapabilityIdsJson:
          routeWorkflowExecutionContractsTable.preferredCapabilityIdsJson,
        forbiddenCapabilityIdsJson:
          routeWorkflowExecutionContractsTable.forbiddenCapabilityIdsJson,
        requiredEvidenceIdsJson:
          routeWorkflowExecutionContractsTable.requiredEvidenceIdsJson,
        allowedModelProfileIdsJson:
          routeWorkflowExecutionContractsTable.allowedModelProfileIdsJson,
        completionMode: routeWorkflowExecutionContractsTable.completionMode,
        clarificationMode: routeWorkflowExecutionContractsTable.clarificationMode,
        reviewStrictness: routeWorkflowExecutionContractsTable.reviewStrictness,
        maxRetryCount: routeWorkflowExecutionContractsTable.maxRetryCount,
        insertedAt: routeWorkflowExecutionContractsTable.insertedAt,
        updatedAt: routeWorkflowExecutionContractsTable.updatedAt
      })
      .from(routeWorkflowExecutionContractsTable)
      .innerJoin(
        routeWorkflowsTable,
        eq(
          routeWorkflowExecutionContractsTable.workflowId,
          routeWorkflowsTable.workflowId
        )
      )
      .innerJoin(
        symphonyIssuesTable,
        eq(routeWorkflowsTable.trackerIssueId, symphonyIssuesTable.trackerIssueId)
      )
      .where(eq(routeWorkflowExecutionContractsTable.workflowId, workflowId))
      .get();
  }

  #selectCapabilityPlannerDecisionByState(
    input: {
      workflowId: string;
      historyEventSequence: number;
      contractUpdatedAt: string;
      policyId: string;
    },
    db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema> = this.#db
  ): RouteWorkflowCapabilityPlannerDecisionRow | undefined {
    return db
      .select({
        decisionId: routeWorkflowCapabilityPlannerDecisionsTable.decisionId,
        workflowId: routeWorkflowCapabilityPlannerDecisionsTable.workflowId,
        contractId: routeWorkflowCapabilityPlannerDecisionsTable.contractId,
        contractUpdatedAt: routeWorkflowCapabilityPlannerDecisionsTable.contractUpdatedAt,
        policyId: routeWorkflowCapabilityPlannerDecisionsTable.policyId,
        historyEventSequence:
          routeWorkflowCapabilityPlannerDecisionsTable.historyEventSequence,
        lifecycleProjectionSequence:
          routeWorkflowCapabilityPlannerDecisionsTable.lifecycleProjectionSequence,
        lifecycleCurrentNode:
          routeWorkflowCapabilityPlannerDecisionsTable.lifecycleCurrentNode,
        planKind: routeWorkflowCapabilityPlannerDecisionsTable.planKind,
        planJson: routeWorkflowCapabilityPlannerDecisionsTable.planJson,
        intelligentFlowRouterDecisionJson:
          routeWorkflowCapabilityPlannerDecisionsTable.intelligentFlowRouterDecisionJson,
        recordedAt: routeWorkflowCapabilityPlannerDecisionsTable.recordedAt,
        insertedAt: routeWorkflowCapabilityPlannerDecisionsTable.insertedAt
      })
      .from(routeWorkflowCapabilityPlannerDecisionsTable)
      .where(
        and(
          eq(routeWorkflowCapabilityPlannerDecisionsTable.workflowId, input.workflowId),
          eq(
            routeWorkflowCapabilityPlannerDecisionsTable.historyEventSequence,
            input.historyEventSequence
          ),
          eq(
            routeWorkflowCapabilityPlannerDecisionsTable.contractUpdatedAt,
            input.contractUpdatedAt
          ),
          eq(routeWorkflowCapabilityPlannerDecisionsTable.policyId, input.policyId)
        )
      )
      .get();
  }

  #selectCapabilityPlannerCommandByDecisionId(
    decisionId: string,
    db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema> = this.#db
  ): RouteWorkflowCapabilityPlannerCommandRow | undefined {
    return db
      .select({
        commandId: routeWorkflowCapabilityPlannerCommandsTable.commandId,
        workflowId: routeWorkflowCapabilityPlannerCommandsTable.workflowId,
        decisionId: routeWorkflowCapabilityPlannerCommandsTable.decisionId,
        contractId: routeWorkflowCapabilityPlannerCommandsTable.contractId,
        historyEventSequence:
          routeWorkflowCapabilityPlannerCommandsTable.historyEventSequence,
        dedupeKey: routeWorkflowCapabilityPlannerCommandsTable.dedupeKey,
        kind: routeWorkflowCapabilityPlannerCommandsTable.kind,
        commandJson: routeWorkflowCapabilityPlannerCommandsTable.commandJson,
        emittedAt: routeWorkflowCapabilityPlannerCommandsTable.emittedAt,
        insertedAt: routeWorkflowCapabilityPlannerCommandsTable.insertedAt
      })
      .from(routeWorkflowCapabilityPlannerCommandsTable)
      .where(eq(routeWorkflowCapabilityPlannerCommandsTable.decisionId, decisionId))
      .get();
  }

  #requireWorkflow(
    tx: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>,
    workflowId: string
  ) {
    const workflow = tx
      .select({
        workflowId: routeWorkflowsTable.workflowId
      })
      .from(routeWorkflowsTable)
      .where(eq(routeWorkflowsTable.workflowId, workflowId))
      .get();

    if (!workflow) {
      throw new SymphonyRouteWorkflowNotFoundError({
        workflowId
      });
    }
  }

  #latestEventSequence(
    tx: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>,
    workflowId: string
  ): number {
    const lastEvent = tx
      .select({
        eventSequence: routeHistoryEventsTable.eventSequence
      })
      .from(routeHistoryEventsTable)
      .where(eq(routeHistoryEventsTable.workflowId, workflowId))
      .orderBy(desc(routeHistoryEventsTable.eventSequence))
      .limit(1)
      .get();

    return lastEvent?.eventSequence ?? 0;
  }

  #loadHydrationStateByWorkflowRow<
    Node extends WorkflowNodeId,
    Data,
    Policy,
  >(
    tx: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>,
    workflowRow: RouteWorkflowRecordRow
  ): RouteWorkflowHydrationState<Node, Data, Policy> {
    const workflow = mapWorkflowRow(workflowRow);
    const snapshotRow = tx
      .select()
      .from(routeProjectionSnapshotsTable)
      .where(eq(routeProjectionSnapshotsTable.workflowId, workflow.workflowId))
      .get();
    const snapshot = snapshotRow ? mapSnapshotRow<Node, Data>(snapshotRow) : null;
    const tailAfterEventSequence = snapshot?.eventSequence ?? 0;

    const tailHistory = tx
      .select()
      .from(routeHistoryEventsTable)
      .where(
        and(
          eq(routeHistoryEventsTable.workflowId, workflow.workflowId),
          gt(routeHistoryEventsTable.eventSequence, tailAfterEventSequence)
        )
      )
      .orderBy(asc(routeHistoryEventsTable.eventSequence))
      .all()
      .map((row) => mapHistoryRow<Node>(row));

    const latestDecisionRow = tx
      .select()
      .from(routeDecisionsTable)
      .where(eq(routeDecisionsTable.workflowId, workflow.workflowId))
      .orderBy(desc(routeDecisionsTable.eventSequence))
      .limit(1)
      .get();

    return {
      workflow,
      snapshot,
      tailHistory,
      latestDecision: latestDecisionRow
        ? mapDecisionRow<Node, Data, Policy>(latestDecisionRow)
        : null,
      tailAfterEventSequence
    };
  }
}

function buildHistoryRow<Node extends WorkflowNodeId>(input: {
  workflowId: string;
  event: WorkflowJournalEvent<Node>;
  eventSequence: number;
}): {
  insert: typeof routeHistoryEventsTable.$inferInsert;
  record: RouteHistoryEventRecord<Node>;
} {
  const metadata = extractHistoryMetadata(input.event);
  const insertedAt = new Date().toISOString();

  const record: RouteHistoryEventRecord<Node> = {
    eventId: randomUUID(),
    workflowId: input.workflowId,
    eventSequence: input.eventSequence,
    kind: metadata.kind,
    recordedAt: input.event.recordedAt,
    signalId: metadata.signalId,
    signalType: metadata.signalType,
    signalSource: metadata.signalSource,
    decisionId: metadata.decisionId,
    commandId: metadata.commandId,
    fromNode: metadata.fromNode as Node | null,
    toNode: metadata.toNode as Node | null,
    edgeId: metadata.edgeId,
    reasonCode: metadata.reasonCode,
    event: input.event,
    insertedAt
  };

  return {
    insert: {
      eventId: record.eventId,
      workflowId: record.workflowId,
      eventSequence: record.eventSequence,
      kind: record.kind,
      recordedAt: record.recordedAt,
      signalId: record.signalId,
      signalType: record.signalType,
      signalSource: record.signalSource,
      decisionId: record.decisionId,
      commandId: record.commandId,
      fromNode: record.fromNode,
      toNode: record.toNode,
      edgeId: record.edgeId,
      reasonCode: record.reasonCode,
      eventJson: record.event,
      insertedAt: record.insertedAt
    },
    record
  };
}

function buildSnapshotRecord<
  Node extends WorkflowNodeId,
  Data,
>(input: {
  workflowId: string;
  eventSequence: number;
  projection: WorkflowProjection<Node, Data>;
  updatedAt: string;
}): {
  insert: typeof routeProjectionSnapshotsTable.$inferInsert;
  record: RouteProjectionSnapshotRecord<Node, Data>;
} {
  const lastSignalId = input.projection.lastSignal?.id ?? null;
  const lastDecisionId = input.projection.lastDecision?.id ?? null;

  const record: RouteProjectionSnapshotRecord<Node, Data> = {
    workflowId: input.workflowId,
    eventSequence: input.eventSequence,
    currentNode: input.projection.currentNode,
    terminal: input.projection.terminal,
    lastSignalId,
    lastDecisionId,
    projection: input.projection,
    updatedAt: input.updatedAt
  };

  return {
    insert: {
      workflowId: record.workflowId,
      eventSequence: record.eventSequence,
      currentNode: record.currentNode,
      terminal: record.terminal,
      lastSignalId: record.lastSignalId,
      lastDecisionId: record.lastDecisionId,
      projectionJson: record.projection,
      updatedAt: record.updatedAt
    },
    record
  };
}

function extractHistoryMetadata<Node extends WorkflowNodeId>(
  event: WorkflowJournalEvent<Node>
): {
  kind: RouteHistoryEventKind;
  signalId: string | null;
  signalType: string | null;
  signalSource: WorkflowSignalSource | null;
  decisionId: string | null;
  commandId: string | null;
  fromNode: string | null;
  toNode: string | null;
  edgeId: string | null;
  reasonCode: string | null;
} {
  switch (event.kind) {
    case "signal_recorded":
      return {
        kind: event.kind,
        signalId: requireOptionalText(event.signal.id, "signal.id"),
        signalType: sanitizeRequiredText(event.signal.type, "signal.type"),
        signalSource: event.signal.source,
        decisionId: null,
        commandId: null,
        fromNode: null,
        toNode: null,
        edgeId: null,
        reasonCode: null
      };
    case "decision_recorded":
      return {
        kind: event.kind,
        signalId: null,
        signalType: null,
        signalSource: null,
        decisionId: sanitizeRequiredText(event.decision.id, "decision.id"),
        commandId: null,
        fromNode: sanitizeText(event.decision.fromNode),
        toNode: sanitizeText(event.decision.toNode),
        edgeId: sanitizeText(event.decision.edgeId),
        reasonCode: sanitizeRequiredText(event.decision.reasonCode, "decision.reasonCode")
      };
    case "command_emitted":
      return {
        kind: event.kind,
        signalId: null,
        signalType: null,
        signalSource: null,
        decisionId: sanitizeRequiredText(event.decisionId, "decisionId"),
        commandId: sanitizeRequiredText(event.command.id, "command.id"),
        fromNode: null,
        toNode: null,
        edgeId: null,
        reasonCode: null
      };
    case "command_settled":
      return {
        kind: event.kind,
        signalId: null,
        signalType: null,
        signalSource: null,
        decisionId: null,
        commandId: sanitizeRequiredText(event.commandId, "commandId"),
        fromNode: null,
        toNode: null,
        edgeId: null,
        reasonCode: null
      };
  }

  const exhaustiveEvent: never = event;
  throw new TypeError(
    `Unhandled route history event kind: ${JSON.stringify(exhaustiveEvent)}`
  );
}

function requireSignalId<Node extends WorkflowNodeId>(
  signalEvent: Extract<WorkflowJournalEvent<Node>, { kind: "signal_recorded" }>
): string {
  return requireOptionalText(signalEvent.signal.id, "signal.id");
}

function mapWorkflowRow(row: RouteWorkflowRecordRow): RouteWorkflowRecord {
  return {
    workflowId: row.workflowId,
    trackerIssueId: row.trackerIssueId,
    repositoryKey: row.repositoryKey,
    issueIdentifier: row.issueIdentifier,
    bindingScope: mapLifecycleBindingScope({
      organizationId: row.organizationId,
      linearWorkspaceIdentityId: row.linearWorkspaceIdentityId,
      owner: `Route workflow ${row.workflowId}`
    }),
    routerPresetId: row.routerPresetId,
    routerName: row.routerName,
    routerVersion: row.routerVersion,
    archivedAt: row.archivedAt ?? null,
    insertedAt: row.insertedAt,
    updatedAt: row.updatedAt
  };
}

function mapHistoryRow<Node extends WorkflowNodeId>(
  row: typeof routeHistoryEventsTable.$inferSelect
): RouteHistoryEventRecord<Node> {
  return {
    eventId: row.eventId,
    workflowId: row.workflowId,
    eventSequence: row.eventSequence,
    kind: normalizeRouteHistoryEventKind(row.kind),
    recordedAt: row.recordedAt,
    signalId: row.signalId ?? null,
    signalType: row.signalType ?? null,
    signalSource: normalizeRouteSignalSource(row.signalSource),
    decisionId: row.decisionId ?? null,
    commandId: row.commandId ?? null,
    fromNode: (row.fromNode ?? null) as Node | null,
    toNode: (row.toNode ?? null) as Node | null,
    edgeId: row.edgeId ?? null,
    reasonCode: row.reasonCode ?? null,
    event: row.eventJson as WorkflowJournalEvent<Node>,
    insertedAt: row.insertedAt
  };
}

function mapDecisionRow<
  Node extends WorkflowNodeId,
  Data,
  Policy,
>(
  row: typeof routeDecisionsTable.$inferSelect
): RouteDecisionRecord<Node, Data, Policy> {
  return {
    decisionId: row.decisionId,
    workflowId: row.workflowId,
    eventSequence: row.eventSequence,
    signalId: row.signalId,
    fromNode: (row.fromNode ?? null) as Node | null,
    toNode: (row.toNode ?? null) as Node | null,
    edgeId: row.edgeId ?? null,
    reasonCode: row.reasonCode,
    policy: row.policyJson as Policy,
    projectionBefore: row.projectionBeforeJson as WorkflowProjection<Node, Data>,
    projectionAfter: row.projectionAfterJson as WorkflowProjection<Node, Data>,
    commands: row.commandsJson as WorkflowCommand[],
    trace: row.traceJson as WorkflowTraceEntry[],
    selectionMetadata: (row.selectionMetadataJson ?? null) as Record<string, unknown> | null,
    recordedAt: row.recordedAt,
    insertedAt: row.insertedAt
  };
}

function mapSnapshotRow<
  Node extends WorkflowNodeId,
  Data,
>(
  row: typeof routeProjectionSnapshotsTable.$inferSelect
): RouteProjectionSnapshotRecord<Node, Data> {
  return {
    workflowId: row.workflowId,
    eventSequence: row.eventSequence,
    currentNode: (row.currentNode ?? null) as Node | null,
    terminal: row.terminal,
    lastSignalId: row.lastSignalId ?? null,
    lastDecisionId: row.lastDecisionId ?? null,
    projection: row.projectionJson as WorkflowProjection<Node, Data>,
    updatedAt: row.updatedAt
  };
}

function mapExecutionContractRow<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId,
>(
  row: RouteWorkflowExecutionContractRow
): RouteWorkflowExecutionContractRecord<CapabilityId, EvidenceId, ProfileId> {
  return {
    contractId: row.contractId,
    workflowId: row.workflowId,
    issueIdentifier: row.issueIdentifier,
    repositoryKey: row.repositoryKey,
    summary: row.summary,
    objective: row.objective,
    doneDefinition: row.doneDefinition,
    mergePolicy: row.mergePolicy as RouteWorkflowExecutionContractRecord<
      CapabilityId,
      EvidenceId,
      ProfileId
    >["mergePolicy"],
    routingDirectives: {
      requiredCapabilityIds: requireJsonStringArray<CapabilityId>(
        row.requiredCapabilityIdsJson,
        "requiredCapabilityIdsJson"
      ),
      preferredCapabilityIds: requireJsonStringArray<CapabilityId>(
        row.preferredCapabilityIdsJson,
        "preferredCapabilityIdsJson"
      ),
      forbiddenCapabilityIds: requireJsonStringArray<CapabilityId>(
        row.forbiddenCapabilityIdsJson,
        "forbiddenCapabilityIdsJson"
      ),
      requiredEvidenceIds: requireJsonStringArray<EvidenceId>(
        row.requiredEvidenceIdsJson,
        "requiredEvidenceIdsJson"
      ),
      allowedModelProfileIds: requireJsonStringArray<ProfileId>(
        row.allowedModelProfileIdsJson,
        "allowedModelProfileIdsJson"
      ),
      completionPolicy: {
        mode: row.completionMode as RouteWorkflowExecutionContractRecord<
          CapabilityId,
          EvidenceId,
          ProfileId
        >["routingDirectives"]["completionPolicy"]["mode"]
      },
      clarificationPolicy: {
        mode: row.clarificationMode as RouteWorkflowExecutionContractRecord<
          CapabilityId,
          EvidenceId,
          ProfileId
        >["routingDirectives"]["clarificationPolicy"]["mode"]
      },
      reviewStrictness: row.reviewStrictness as RouteWorkflowExecutionContractRecord<
        CapabilityId,
        EvidenceId,
        ProfileId
      >["routingDirectives"]["reviewStrictness"],
      maxRetryCount: sanitizeNonNegativeInteger(row.maxRetryCount, "maxRetryCount")
    },
    createdAt: row.insertedAt,
    updatedAt: row.updatedAt,
    insertedAt: row.insertedAt
  };
}

function mapCapabilityPlannerDecisionRow<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId,
>(
  row: RouteWorkflowCapabilityPlannerDecisionRow
): RouteWorkflowCapabilityPlannerDecisionRecord<CapabilityId, EvidenceId, ProfileId> {
  const planKind = sanitizeCapabilityPlannerPlanKind(row.planKind);
  const plan = requireJsonCapabilityPlan<CapabilityId, EvidenceId, ProfileId>(
    row.planJson,
    "planJson"
  );

  if (sanitizeCapabilityPlannerPlanKind(plan.kind) !== planKind) {
    throw new TypeError(
      `Capability planner decision ${row.decisionId} stores mismatched plan kind ${plan.kind}.`
    );
  }

  return {
    decisionId: row.decisionId,
    workflowId: row.workflowId,
    contractId: row.contractId,
    contractUpdatedAt: row.contractUpdatedAt,
    policyId: sanitizeRequiredText(row.policyId, "policyId"),
    historyEventSequence: sanitizeEventSequence(
      row.historyEventSequence,
      "historyEventSequence"
    ),
    lifecycleProjectionSequence: sanitizeEventSequence(
      row.lifecycleProjectionSequence,
      "lifecycleProjectionSequence"
    ),
    lifecycleCurrentNode: row.lifecycleCurrentNode ?? null,
    planKind,
    plan,
    intelligentFlowRouterDecision:
      row.intelligentFlowRouterDecisionJson === null
        ? null
        : readStoredIntelligentFlowRouterDecision(
            row.intelligentFlowRouterDecisionJson
          ),
    recordedAt: row.recordedAt,
    insertedAt: row.insertedAt
  };
}

function validateIntelligentFlowRouterDecision<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId,
>(input: {
  decision: SymphonyIntelligentFlowRouterDecision | null;
  decisionId: string;
  workflowId: string;
  policyId: string;
  recordedAt: string;
  plan: WorkflowCapabilityPlan<CapabilityId, EvidenceId, ProfileId>;
}): SymphonyIntelligentFlowRouterDecision | null {
  if (input.decision === null) {
    return null;
  }

  const decision = readStoredIntelligentFlowRouterDecision(input.decision);
  if (decision.decisionId !== input.decisionId) {
    throw new TypeError(
      `Intelligent-flow router decision ${decision.decisionId} does not match planner decision ${input.decisionId}.`
    );
  }
  if (decision.workflowId !== input.workflowId) {
    throw new TypeError(
      `Intelligent-flow router decision workflow ${decision.workflowId} does not match route workflow ${input.workflowId}.`
    );
  }
  if (decision.policyId !== input.policyId) {
    throw new TypeError(
      `Intelligent-flow router decision policy ${decision.policyId} does not match planner policy ${input.policyId}.`
    );
  }
  if (decision.recordedAt !== input.recordedAt) {
    throw new TypeError(
      `Intelligent-flow router decision recordedAt ${decision.recordedAt} does not match planner recordedAt ${input.recordedAt}.`
    );
  }
  if (input.plan.kind !== "execute") {
    throw new TypeError(
      `Intelligent-flow router decision ${decision.decisionId} requires an execute planner decision.`
    );
  }
  if (decision.selectedModuleId !== input.plan.candidate.capabilityId) {
    throw new TypeError(
      `Intelligent-flow router decision selected module ${decision.selectedModuleId} does not match execute candidate ${input.plan.candidate.capabilityId}.`
    );
  }
  if (decision.selectionRationale !== input.plan.decision.rationale) {
    throw new TypeError(
      `Intelligent-flow router decision rationale does not match planner decision ${input.plan.decision.decisionId}.`
    );
  }

  return decision;
}

function readStoredIntelligentFlowRouterDecision(
  value: unknown
): SymphonyIntelligentFlowRouterDecision {
  if (!isRecord(value)) {
    throw new TypeError("Stored intelligent-flow router decision must be an object.");
  }

  const candidateSetValue = value.candidateSet;
  if (!isRecord(candidateSetValue)) {
    throw new TypeError("Stored intelligent-flow router decision candidateSet is required.");
  }

  const admissible = readStoredIntelligentFlowCandidateArray(
    candidateSetValue.admissible,
    "admissible"
  );
  const rejected = readStoredIntelligentFlowCandidateArray(
    candidateSetValue.rejected,
    "rejected"
  );
  const selectedModuleId = sanitizeRequiredText(
    readStoredRecordText(value, "selectedModuleId"),
    "selectedModuleId"
  ) as SymphonyIntelligentFlowRouterDecision["selectedModuleId"];
  const selectionMode = readStoredIntelligentFlowSelectionMode(
    value.selectionMode
  );
  const confidence = readStoredIntelligentFlowConfidence(value.confidence);
  const fallbackReason = readStoredNullableText(value.fallbackReason, "fallbackReason");

  if (!admissible.some((candidate) => candidate.moduleId === selectedModuleId)) {
    throw new TypeError(
      `Stored intelligent-flow router decision selected module ${selectedModuleId} must appear in the admissible candidate set.`
    );
  }
  if (selectionMode === "llm_selected" && confidence === null) {
    throw new TypeError(
      "Stored intelligent-flow router decision requires confidence for llm_selected mode."
    );
  }
  if (selectionMode === "fallback_default" && fallbackReason === null) {
    throw new TypeError(
      "Stored intelligent-flow router decision requires a fallback reason for fallback_default mode."
    );
  }

  return {
    decisionId: sanitizeRequiredText(readStoredRecordText(value, "decisionId"), "decisionId"),
    workflowId: sanitizeRequiredText(readStoredRecordText(value, "workflowId"), "workflowId"),
    policyId: sanitizeRequiredText(readStoredRecordText(value, "policyId"), "policyId"),
    recordedAt: sanitizeRequiredText(readStoredRecordText(value, "recordedAt"), "recordedAt"),
    candidateSet: {
      admissible: admissible as SymphonyIntelligentFlowRouterDecision["candidateSet"]["admissible"],
      rejected: rejected as SymphonyIntelligentFlowRouterDecision["candidateSet"]["rejected"]
    },
    selectedModuleId,
    selectionMode,
    selectionSummary: sanitizeRequiredText(
      readStoredRecordText(value, "selectionSummary"),
      "selectionSummary"
    ),
    selectionRationale: sanitizeRequiredText(
      readStoredRecordText(value, "selectionRationale"),
      "selectionRationale"
    ),
    confidence,
    inputProjectionFingerprint: sanitizeRequiredText(
      readStoredRecordText(value, "inputProjectionFingerprint"),
      "inputProjectionFingerprint"
    ),
    fallbackReason
  };
}

function readStoredIntelligentFlowCandidateArray(
  value: unknown,
  field: "admissible" | "rejected"
) {
  if (!Array.isArray(value)) {
    throw new TypeError(`Stored intelligent-flow candidate set ${field} must be an array.`);
  }

  return value.map((candidate, index) => {
    if (!isRecord(candidate)) {
      throw new TypeError(
        `Stored intelligent-flow candidate ${field}[${index}] must be an object.`
      );
    }

    const moduleId = sanitizeRequiredText(
      readStoredRecordText(candidate, "moduleId"),
      `${field}[${index}].moduleId`
    );
    const reasonCode = sanitizeRequiredText(
      readStoredRecordText(candidate, "reasonCode"),
      `${field}[${index}].reasonCode`
    );
    const summary = sanitizeRequiredText(
      readStoredRecordText(candidate, "summary"),
      `${field}[${index}].summary`
    );

    if (field === "admissible") {
      const rank = sanitizeEventSequence(
        readStoredRecordInteger(candidate, "rank"),
        `${field}[${index}].rank`
      );

      return {
        moduleId,
        rank,
        reasonCode,
        summary
      };
    }

    return {
      moduleId,
      reasonCode,
      summary
    };
  });
}

function readStoredIntelligentFlowSelectionMode(
  value: unknown
): SymphonyIntelligentFlowRouterDecision["selectionMode"] {
  const selectionMode = sanitizeRequiredText(
    readStoredScalarText(value, "selectionMode"),
    "selectionMode"
  );
  switch (selectionMode) {
    case "deterministic":
    case "llm_selected":
    case "fallback_default":
    case "reused_cached_decision":
      return selectionMode;
    default:
      throw new TypeError(
        `Stored intelligent-flow router decision has unknown selection mode ${selectionMode}.`
      );
  }
}

function readStoredIntelligentFlowConfidence(value: unknown): number | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new TypeError("Stored intelligent-flow router decision confidence must be 0-1.");
  }

  return value;
}

function readStoredNullableText(value: unknown, field: string): string | null {
  if (value === null) {
    return null;
  }

  return sanitizeRequiredText(readStoredScalarText(value, field), field);
}

function readStoredRecordText(
  value: Record<string, unknown>,
  field: string
): string {
  return readStoredScalarText(value[field], field);
}

function readStoredRecordInteger(
  value: Record<string, unknown>,
  field: string
): number {
  const raw = value[field];
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    throw new TypeError(`Stored intelligent-flow router decision ${field} must be an integer.`);
  }

  return raw;
}

function readStoredScalarText(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`Stored intelligent-flow router decision ${field} must be text.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapCapabilityPlannerCommandRow<
  Contract extends WorkflowTicketExecutionContract,
  CapabilityId extends WorkflowCapabilityId,
  ProfileId extends WorkflowModelProfileId,
>(
  row: RouteWorkflowCapabilityPlannerCommandRow
): RouteWorkflowCapabilityPlannerCommandRecord<Contract, CapabilityId, ProfileId> {
  if (row.kind !== "capability.execute") {
    throw new TypeError(
      `Unsupported capability planner command kind ${row.kind}.`
    );
  }

  return {
    commandId: row.commandId,
    workflowId: row.workflowId,
    decisionId: row.decisionId,
    contractId: row.contractId,
    historyEventSequence: sanitizeEventSequence(
      row.historyEventSequence,
      "historyEventSequence"
    ),
    dedupeKey: row.dedupeKey ?? null,
    kind: "capability.execute",
    command: requireJsonCapabilityExecutionCommand<Contract, CapabilityId, ProfileId>(
      row.commandJson,
      "commandJson"
    ),
    emittedAt: row.emittedAt,
    insertedAt: row.insertedAt
  };
}

function normalizeRouteHistoryEventKind(value: string): RouteHistoryEventKind {
  switch (value) {
    case "signal_recorded":
    case "decision_recorded":
    case "command_emitted":
    case "command_settled":
      return value;
    default:
      throw new TypeError(`Unknown route history event kind: ${value}`);
  }
}

function sanitizeCapabilityPlannerPlanKind(
  value: string
): RouteWorkflowCapabilityPlannerPlanKind {
  switch (value) {
    case "execute":
    case "awaiting_input":
    case "blocked":
    case "ready_for_manual_completion":
    case "ready_for_auto_completion":
      return value;
    default:
      throw new TypeError(`Unknown capability planner plan kind: ${value}`);
  }
}

function normalizeRouteSignalSource(
  value: string | null
): WorkflowSignalSource | null {
  if (value === null) {
    return null;
  }

  switch (value) {
    case "tracker":
    case "runtime":
    case "review":
    case "ci":
    case "operator":
    case "router":
      return value;
    default:
      throw new TypeError(`Unknown route signal source: ${value}`);
  }
}

function assertProjectionWorkflowId(
  projectionWorkflowId: string,
  workflowId: string
) {
  if (sanitizeRequiredText(projectionWorkflowId, "projection.workflowId") !== workflowId) {
    throw new TypeError(
      `Projection workflowId ${projectionWorkflowId} does not match route workflow ${workflowId}.`
    );
  }
}

function sanitizeEventSequence(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative integer.`);
  }

  return value;
}

function requireOptionalText(value: string | undefined, field: string): string {
  const normalized = sanitizeText(value);
  if (!normalized) {
    throw new TypeError(`${field} is required.`);
  }

  return normalized;
}

function requireNullableRecord(
  value: Record<string, unknown> | null | undefined,
  field: string
): Record<string, unknown> | null {
  if (value === undefined) {
    throw new TypeError(`${field} is required.`);
  }

  return value;
}

function requireStringArray(value: string[], field: string): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${field} must be an array.`);
  }

  return value.map((entry, index) =>
    sanitizeRequiredText(entry, `${field}[${index}]`)
  );
}

function requireJsonStringArray<Value extends string>(
  value: unknown,
  field: string
): Value[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${field} must be a JSON array.`);
  }

  return value.map((entry, index) =>
    sanitizeRequiredText(
      typeof entry === "string" ? entry : null,
      `${field}[${index}]`
    ) as Value
  );
}

function requireJsonCapabilityPlan<
  CapabilityId extends WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId,
>(
  value: unknown,
  field: string
): WorkflowCapabilityPlan<CapabilityId, EvidenceId, ProfileId> {
  const normalized = requireJsonRecordObject(value, field);
  sanitizeCapabilityPlannerPlanKind(
    sanitizeRequiredText(readJsonTextField(normalized, "kind"), `${field}.kind`)
  );
  return normalized as WorkflowCapabilityPlan<CapabilityId, EvidenceId, ProfileId>;
}

function requireJsonCapabilityExecutionCommand<
  Contract extends WorkflowTicketExecutionContract,
  CapabilityId extends WorkflowCapabilityId,
  ProfileId extends WorkflowModelProfileId,
>(
  value: unknown,
  field: string
): WorkflowCapabilityExecutionCommand<Contract, CapabilityId, ProfileId> {
  const normalized = requireJsonRecordObject(value, field);
  const kind = sanitizeRequiredText(
    readJsonTextField(normalized, "kind"),
    `${field}.kind`
  );
  if (kind !== "capability.execute") {
    throw new TypeError(`${field}.kind must be capability.execute.`);
  }

  return normalized as WorkflowCapabilityExecutionCommand<
    Contract,
    CapabilityId,
    ProfileId
  >;
}

function requireJsonRecordObject(
  value: unknown,
  field: string
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${field} must be a JSON object.`);
  }

  return value as Record<string, unknown>;
}

function readJsonTextField(
  value: Record<string, unknown>,
  field: string
): string | null {
  const entry = value[field];
  return typeof entry === "string" ? entry : null;
}

function sanitizeOptionalText(value: string | null | undefined): string | null {
  return sanitizeText(value);
}

function sanitizeNonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative integer.`);
  }

  return value;
}

function sanitizeRequiredText(value: string | null | undefined, field: string): string {
  const normalized = sanitizeText(value);
  if (!normalized) {
    throw new TypeError(`${field} is required.`);
  }

  return normalized;
}

function sanitizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isLiveWorkflowConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /route_workflows_live_tracker_issue_idx|UNIQUE constraint failed: route_workflows.tracker_issue_id/.test(
      error.message
    )
  );
}

function assertCanonicalWorkflowIssueCompatibility(input: {
  trackerIssueId: string;
  issueIdentifier: string;
  repositoryKey: string;
  bindingScope: RouteWorkflowBindingScope | null;
  issue: CanonicalIssueBindingRow;
}) {
  if (input.issue.trackerIssueId !== input.trackerIssueId) {
    throw new TypeError(
      `Route workflow issue binding ${input.issue.trackerIssueId} does not match requested tracker issue ${input.trackerIssueId}.`
    );
  }

  if (input.issue.issueIdentifier !== input.issueIdentifier) {
    throw new TypeError(
      `Tracker issue ${input.trackerIssueId} is already bound to issue identifier ${input.issue.issueIdentifier}, not ${input.issueIdentifier}.`
    );
  }

  if (input.issue.repositoryKey !== input.repositoryKey) {
    throw new TypeError(
      `Issue ${input.issue.issueIdentifier} is already bound to repository ${input.issue.repositoryKey}, not ${input.repositoryKey}.`
    );
  }

  assertMatchingLifecycleBindingScope({
    owner: `Issue ${input.issue.issueIdentifier}`,
    actual: mapLifecycleBindingScope({
      organizationId: input.issue.organizationId,
      linearWorkspaceIdentityId: input.issue.linearWorkspaceIdentityId,
      owner: `Issue ${input.issue.issueIdentifier}`
    }),
    expected: input.bindingScope
  });
}
