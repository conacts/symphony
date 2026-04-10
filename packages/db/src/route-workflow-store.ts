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
  WorkflowCommand,
  WorkflowJournalEvent,
  WorkflowNodeId,
  WorkflowProjection,
  WorkflowRouteResult,
  WorkflowSignalSource,
  WorkflowTraceEntry
} from "@symphony/router";
import {
  SymphonyRouteWorkflowExistsError,
  SymphonyRouteWorkflowNotFoundError
} from "./errors.js";
import {
  routeDecisionsTable,
  routeHistoryEventsTable,
  routeProjectionSnapshotsTable,
  routeWorkflowsTable
} from "./schema.js";

type RouteHistoryEventKind =
  | "signal_recorded"
  | "decision_recorded"
  | "command_emitted"
  | "command_settled";

export type RouteWorkflowRecord = {
  workflowId: string;
  repositoryKey: string;
  issueIdentifier: string;
  routerName: string;
  routerVersion: string;
  archivedAt: string | null;
  insertedAt: string;
  updatedAt: string;
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
    repositoryKey: string;
    issueIdentifier: string;
    routerName: string;
    routerVersion: string;
    createdAt: string;
  }): Promise<string>;
  getWorkflow(workflowId: string): Promise<RouteWorkflowRecord | null>;
  getWorkflowForIssue(issueIdentifier: string): Promise<RouteWorkflowRecord | null>;
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
    repositoryKey: string;
    issueIdentifier: string;
    routerName: string;
    routerVersion: string;
    createdAt: string;
  }): Promise<string> {
    const workflowId = randomUUID();
    const repositoryKey = sanitizeRequiredText(input.repositoryKey, "repositoryKey");
    const issueIdentifier = sanitizeRequiredText(input.issueIdentifier, "issueIdentifier");
    const routerName = sanitizeRequiredText(input.routerName, "routerName");
    const routerVersion = sanitizeRequiredText(input.routerVersion, "routerVersion");
    const now = sanitizeRequiredText(input.createdAt, "createdAt");

    try {
      this.#db.insert(routeWorkflowsTable)
        .values({
          workflowId,
          repositoryKey,
          issueIdentifier,
          routerName,
          routerVersion,
          archivedAt: null,
          insertedAt: now,
          updatedAt: now
        })
        .run();
    } catch (error) {
      if (isLiveWorkflowConstraintError(error)) {
        const existing = this.#db
          .select({
            workflowId: routeWorkflowsTable.workflowId
          })
          .from(routeWorkflowsTable)
          .where(
            and(
              eq(routeWorkflowsTable.issueIdentifier, issueIdentifier),
              isNull(routeWorkflowsTable.archivedAt)
            )
          )
          .get();

        if (existing) {
          throw new SymphonyRouteWorkflowExistsError({
            issueIdentifier,
            existingWorkflowId: existing.workflowId
          });
        }
      }

      throw error;
    }

    return workflowId;
  }

  async getWorkflow(workflowId: string): Promise<RouteWorkflowRecord | null> {
    const row = this.#db
      .select()
      .from(routeWorkflowsTable)
      .where(eq(routeWorkflowsTable.workflowId, sanitizeRequiredText(workflowId, "workflowId")))
      .get();

    return row ? mapWorkflowRow(row) : null;
  }

  async getWorkflowForIssue(issueIdentifier: string): Promise<RouteWorkflowRecord | null> {
    const row = this.#db
      .select()
      .from(routeWorkflowsTable)
      .where(
        and(
          eq(
            routeWorkflowsTable.issueIdentifier,
            sanitizeRequiredText(issueIdentifier, "issueIdentifier")
          ),
          isNull(routeWorkflowsTable.archivedAt)
        )
      )
      .get();

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
      const workflowRow = tx
        .select()
        .from(routeWorkflowsTable)
        .where(eq(routeWorkflowsTable.workflowId, normalizedWorkflowId))
        .get();

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
    const normalizedIssueIdentifier = sanitizeRequiredText(issueIdentifier, "issueIdentifier");

    return this.#db.transaction((tx) => {
      const workflowRow = tx
        .select()
        .from(routeWorkflowsTable)
        .where(
          and(
            eq(routeWorkflowsTable.issueIdentifier, normalizedIssueIdentifier),
            isNull(routeWorkflowsTable.archivedAt)
          )
        )
        .get();

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
        const nextSnapshot = buildSnapshotRecord({
          workflowId,
          eventSequence,
          projection: input.projection,
          updatedAt: now
        });

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
    workflowRow: typeof routeWorkflowsTable.$inferSelect
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

function mapWorkflowRow(
  row: typeof routeWorkflowsTable.$inferSelect
): RouteWorkflowRecord {
  return {
    workflowId: row.workflowId,
    repositoryKey: row.repositoryKey,
    issueIdentifier: row.issueIdentifier,
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
  return error instanceof Error && /route_workflows_live_issue_idx|UNIQUE constraint failed: route_workflows.issue_identifier/.test(error.message);
}
