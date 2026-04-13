import type {
  RouteDecisionRecord,
  RouteHistoryEventRecord,
  RouteProjectionSnapshotRecord,
  RouteWorkflowHydrationState
} from "@symphony/db";
import type { WorkflowNodeId } from "@symphony/router";
import { expect } from "vitest";
import type {
  RouteWorkflowReplayState,
  SymphonyRouteWorkflowPort
} from "../core/runtime-route-workflows.js";

type AuthorityPort = Pick<
  SymphonyRouteWorkflowPort,
  "loadHydrationStateByTrackerIssueKey" | "loadReplayStateByTrackerIssueKey"
>;

export type RouteWorkflowAuthorityProof<
  Node extends WorkflowNodeId = WorkflowNodeId,
  Data = unknown,
  Policy = unknown,
> = {
  hydration: RouteWorkflowHydrationState<Node, Data, Policy>;
  replay: RouteWorkflowReplayState<Node>;
  snapshot: RouteProjectionSnapshotRecord<Node, Data>;
  latestDecision: RouteDecisionRecord<Node, Data, Policy>;
  latestSignalEvent: RouteHistoryEventRecord<Node>;
  latestDecisionEvent: RouteHistoryEventRecord<Node>;
  latestCommandEvents: RouteHistoryEventRecord<Node>[];
  latestSettlementEvents: RouteHistoryEventRecord<Node>[];
};

export async function expectRouteWorkflowAuthorityProof<
  Node extends WorkflowNodeId,
  Data,
  Policy,
>(input: {
  routeWorkflows: AuthorityPort;
  issueIdentifier: string;
  currentNode: Node;
  reasonCode?: string;
  signalType?: string;
  pendingCommandIds?: string[];
  settlementStatuses?: Record<string, "succeeded" | "failed">;
  assertData?(data: Data): void;
}): Promise<RouteWorkflowAuthorityProof<Node, Data, Policy>> {
  const proof = await loadRouteWorkflowAuthorityProof<Node, Data, Policy>({
    routeWorkflows: input.routeWorkflows,
    issueIdentifier: input.issueIdentifier
  });

  const pendingCommandIds = input.pendingCommandIds ?? [];
  const expectedSettlementStatuses = buildExpectedSettlementStatuses({
    latestDecision: proof.latestDecision,
    pendingCommandIds,
    explicitStatuses: input.settlementStatuses ?? {}
  });

  expect(proof.snapshot.projection.currentNode).toBe(input.currentNode);
  expect(proof.snapshot.projection.pendingCommands.map((command) => command.id)).toEqual(
    pendingCommandIds
  );

  if (input.reasonCode !== undefined) {
    expect(proof.latestDecision.reasonCode).toBe(input.reasonCode);
  }

  if (input.signalType !== undefined) {
    expect(proof.latestSignalEvent.signalType).toBe(input.signalType);
    expect(proof.snapshot.projection.lastSignal?.type ?? null).toBe(input.signalType);
  }

  input.assertData?.(proof.snapshot.projection.data);

  expect(proof.hydration.tailHistory).toEqual([]);
  expect(proof.hydration.tailAfterEventSequence).toBe(proof.snapshot.eventSequence);
  expect(proof.replay.history.at(-1)?.eventSequence ?? null).toBe(
    proof.snapshot.eventSequence
  );
  expect(proof.snapshot.lastSignalId).toBe(proof.latestSignalEvent.signalId);
  expect(proof.snapshot.lastDecisionId).toBe(proof.latestDecision.decisionId);
  expect(proof.snapshot.projection.lastSignal?.id ?? null).toBe(
    proof.latestSignalEvent.signalId
  );
  expect(proof.snapshot.projection.lastDecision?.id ?? null).toBe(
    proof.latestDecision.decisionId
  );
  expect(proof.latestDecisionEvent.decisionId).toBe(proof.latestDecision.decisionId);
  expect(proof.latestSignalEvent.signalId).toBe(proof.latestDecision.signalId);
  expect(proof.latestSignalEvent.eventSequence).toBeLessThan(
    proof.latestDecisionEvent.eventSequence
  );

  const expectedCommandIds = proof.latestDecision.commands.map((command) => command.id);
  expect(proof.latestCommandEvents.map((event) => event.commandId)).toEqual(
    expectedCommandIds
  );
  expect(proof.latestSettlementEvents.map((event) => event.commandId)).toEqual(
    [...expectedSettlementStatuses.keys()]
  );

  for (const emittedEvent of proof.latestCommandEvents) {
    expect(emittedEvent.eventSequence).toBeGreaterThan(
      proof.latestDecisionEvent.eventSequence
    );
  }

  for (const settlementEvent of proof.latestSettlementEvents) {
    const emittedEvent = proof.latestCommandEvents.find(
      (candidate) => candidate.commandId === settlementEvent.commandId
    );
    expect(emittedEvent).toBeDefined();
    expect(settlementEvent.eventSequence).toBeGreaterThan(emittedEvent!.eventSequence);
    if (settlementEvent.event.kind !== "command_settled") {
      throw new TypeError(
        `Expected command_settled history event for ${settlementEvent.commandId ?? "unknown-command"}.`
      );
    }
    expect(settlementEvent.event.status).toBe(
      expectedSettlementStatuses.get(settlementEvent.commandId!)
    );
  }

  for (const pendingCommandId of pendingCommandIds) {
    expect(
      proof.replay.history.some(
        (event) =>
          event.kind === "command_settled" && event.commandId === pendingCommandId
      )
    ).toBe(false);
  }

  expect(
    proof.replay.history
      .slice(proof.replay.history.indexOf(proof.latestSignalEvent))
      .map((event) => event.kind)
  ).toEqual([
    "signal_recorded",
    "decision_recorded",
    ...proof.latestDecision.commands.map(() => "command_emitted" as const),
    ...proof.latestSettlementEvents.map(() => "command_settled" as const)
  ]);

  return proof;
}

async function loadRouteWorkflowAuthorityProof<
  Node extends WorkflowNodeId,
  Data,
  Policy,
>(input: {
  routeWorkflows: AuthorityPort;
  issueIdentifier: string;
}): Promise<RouteWorkflowAuthorityProof<Node, Data, Policy>> {
  const hydration =
    await input.routeWorkflows.loadHydrationStateByTrackerIssueKey<Node, Data, Policy>(
      input.issueIdentifier
    );
  const replay =
    await input.routeWorkflows.loadReplayStateByTrackerIssueKey<Node>(
      input.issueIdentifier
    );

  expect(
    hydration,
    `Expected workflow hydration for ${input.issueIdentifier}.`
  ).not.toBeNull();
  expect(
    replay,
    `Expected workflow replay state for ${input.issueIdentifier}.`
  ).not.toBeNull();
  expect(
    hydration?.snapshot,
    `Expected workflow snapshot for ${input.issueIdentifier}.`
  ).not.toBeNull();
  expect(
    hydration?.latestDecision,
    `Expected latest workflow decision for ${input.issueIdentifier}.`
  ).not.toBeNull();

  const snapshot = hydration!.snapshot!;
  const latestDecision = hydration!.latestDecision!;
  const history = replay!.history;
  const latestSignalEvent = requireHistoryEvent(history, {
    issueIdentifier: input.issueIdentifier,
    kind: "signal_recorded",
    signalId: latestDecision.signalId
  });
  const latestDecisionEvent = requireHistoryEvent(history, {
    issueIdentifier: input.issueIdentifier,
    kind: "decision_recorded",
    decisionId: latestDecision.decisionId
  });
  const latestCommandEvents = latestDecision.commands.map((command) =>
    requireHistoryEvent(history, {
      issueIdentifier: input.issueIdentifier,
      kind: "command_emitted",
      commandId: command.id
    })
  );

  const latestSettlementEvents = latestDecision.commands.flatMap((command) => {
    const settledEvent = history.find(
      (event) => event.kind === "command_settled" && event.commandId === command.id
    );
    return settledEvent ? [settledEvent] : [];
  });

  expect(hydration!.workflow.workflowId).toBe(replay!.workflow.workflowId);
  expect(snapshot.workflowId).toBe(hydration!.workflow.workflowId);
  expect(latestDecision.workflowId).toBe(hydration!.workflow.workflowId);

  return {
    hydration: hydration!,
    replay: replay!,
    snapshot,
    latestDecision,
    latestSignalEvent,
    latestDecisionEvent,
    latestCommandEvents,
    latestSettlementEvents
  };
}

function buildExpectedSettlementStatuses<
  Node extends WorkflowNodeId,
  Data,
  Policy,
>(input: {
  latestDecision: RouteDecisionRecord<Node, Data, Policy>;
  pendingCommandIds: string[];
  explicitStatuses: Record<string, "succeeded" | "failed">;
}): Map<string, "succeeded" | "failed"> {
  const statuses = new Map<string, "succeeded" | "failed">();

  for (const command of input.latestDecision.commands) {
    if (!input.pendingCommandIds.includes(command.id)) {
      statuses.set(command.id, "succeeded");
    }
  }

  for (const [commandId, status] of Object.entries(input.explicitStatuses)) {
    statuses.set(commandId, status);
  }

  return statuses;
}

function requireHistoryEvent<Node extends WorkflowNodeId>(
  history: RouteHistoryEventRecord<Node>[],
  input:
    | {
        issueIdentifier: string;
        kind: "signal_recorded";
        signalId: string;
      }
    | {
        issueIdentifier: string;
        kind: "decision_recorded";
        decisionId: string;
      }
    | {
        issueIdentifier: string;
        kind: "command_emitted";
        commandId: string;
      }
): RouteHistoryEventRecord<Node> {
  const event =
    input.kind === "signal_recorded"
      ? history.find(
          (candidate) =>
            candidate.kind === input.kind && candidate.signalId === input.signalId
        )
      : input.kind === "decision_recorded"
        ? history.find(
            (candidate) =>
              candidate.kind === input.kind && candidate.decisionId === input.decisionId
          )
        : history.find(
            (candidate) =>
              candidate.kind === input.kind && candidate.commandId === input.commandId
          );

  expect(
    event,
    `Expected ${input.kind} history event in workflow history for ${input.issueIdentifier}.`
  ).toBeDefined();

  return event!;
}
