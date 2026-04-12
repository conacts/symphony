import { describe, expect, it, vi } from "vitest";
import type {
  WorkflowCommand,
  WorkflowPayload,
  WorkflowProjection
} from "@symphony/router";
import type {
  AppendedRouteCommandSettlement,
  SymphonyRouteWorkflowPort
} from "./runtime-route-workflows.js";
import type {
  SymphonyRuntimeWorkflowSettlementSession
} from "./runtime-workflow-session-types.js";
import { executeSettledRouteCommand } from "./runtime-route-workflow-command-utils.js";

type TestProjection = WorkflowProjection<string, { trackerState: string }>;

function buildProjection(): TestProjection {
  return {
    workflowId: "workflow-1",
    currentNode: "implementation",
    pendingCommands: [],
    recordedSignalIds: [],
    emittedCommandIds: [],
    terminal: false,
    sequence: 1,
    data: {
      trackerState: "Bootstrapping"
    },
    lastSignal: null,
    lastDecision: null
  };
}

function buildCommand(): WorkflowCommand {
  return {
    id: "command-1",
    kind: "tracker.transition",
    dedupeKey: null,
    payload: {
      state: "In Progress"
    }
  };
}

function createSessionDouble() {
  const settleCommandAsync = vi
    .fn<
      SymphonyRuntimeWorkflowSettlementSession<
        string,
        { trackerState: string },
        Record<string, never>
      >["settleCommandAsync"]
    >()
    .mockResolvedValue(buildProjection());
  const sessionDouble: SymphonyRuntimeWorkflowSettlementSession<
    string,
    { trackerState: string },
    Record<string, never>
  > = {
    workflowId() {
      return "workflow-1";
    },
    settleCommandAsync
  };

  return {
    session: sessionDouble,
    settleCommandAsync
  };
}

function createRouteWorkflowPortDouble(input?: {
  appendCommandSettlement?: SymphonyRouteWorkflowPort["appendCommandSettlement"];
}): SymphonyRouteWorkflowPort {
  const appendCommandSettlement: SymphonyRouteWorkflowPort["appendCommandSettlement"] =
    input?.appendCommandSettlement ??
    (async <Node extends string, Data>(settlementInput: {
      workflowId: string;
      commandId: string;
      status: "succeeded" | "failed";
      payload: WorkflowPayload;
      recordedAt: string;
      projection: WorkflowProjection<Node, Data>;
    }) => buildAppendedCommandSettlement(settlementInput));

  return {
    ensureWorkflowForIssue: vi.fn(),
    loadHydrationStateByWorkflowId: vi.fn(),
    loadHydrationStateByIssueIdentifier: vi.fn(),
    loadHydrationStateByScopedIssue: vi.fn(),
    loadReplayStateByWorkflowId: vi.fn(),
    loadReplayStateByIssueIdentifier: vi.fn(),
    loadReplayStateByScopedIssue: vi.fn(),
    rehydrateProjectionByWorkflowId: vi.fn(),
    rehydrateProjectionByIssueIdentifier: vi.fn(),
    rehydrateProjectionByScopedIssue: vi.fn(),
    resumeSessionByWorkflowId: vi.fn(),
    resumeSessionByIssueIdentifier: vi.fn(),
    resumeSessionByScopedIssue: vi.fn(),
    recordRouteResult: vi.fn(),
    appendCommandSettlement
  } as SymphonyRouteWorkflowPort;
}

describe("executeSettledRouteCommand", () => {
  it("records a failed settlement when command execution throws", async () => {
    const { session, settleCommandAsync } = createSessionDouble();
    const appendCommandSettlementSpy = vi.fn();
    const appendCommandSettlement: SymphonyRouteWorkflowPort["appendCommandSettlement"] =
      async <Node extends string, Data>(input: {
        workflowId: string;
        commandId: string;
        status: "succeeded" | "failed";
        payload: WorkflowPayload;
        recordedAt: string;
        projection: WorkflowProjection<Node, Data>;
      }): Promise<AppendedRouteCommandSettlement<Node, Data>> => {
        await appendCommandSettlementSpy(input);
        return buildAppendedCommandSettlement(input);
      };
    const routeWorkflows = createRouteWorkflowPortDouble({
      appendCommandSettlement
    });
    const command = buildCommand();

    await expect(
      executeSettledRouteCommand({
        routeWorkflows,
        workflowId: "workflow-1",
        session,
        command,
        recordedAt: "2026-04-12T22:00:00.000Z",
        async execute() {
          throw new Error("tracker unavailable");
        }
      })
    ).rejects.toThrow("tracker unavailable");

    expect(settleCommandAsync).toHaveBeenCalledTimes(1);
    expect(settleCommandAsync).toHaveBeenCalledWith({
      commandId: command.id,
      status: "failed",
      payload: {
        error: "Error: tracker unavailable"
      },
      recordedAt: "2026-04-12T22:00:00.000Z"
    });
    expect(appendCommandSettlementSpy).toHaveBeenCalledTimes(1);
    expect(appendCommandSettlementSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "workflow-1",
        commandId: command.id,
        status: "failed"
      })
    );
  });

  it("does not rewrite a successful command as failed when success settlement persistence throws", async () => {
    const { session, settleCommandAsync } = createSessionDouble();
    const appendCommandSettlementSpy = vi.fn(
      async (input: Record<string, unknown>) => {
        void input;
        throw new Error("snapshot write failed");
      }
    );
    const appendCommandSettlement: SymphonyRouteWorkflowPort["appendCommandSettlement"] =
      async <Node extends string, Data>(input: {
        workflowId: string;
        commandId: string;
        status: "succeeded" | "failed";
        payload: WorkflowPayload;
        recordedAt: string;
        projection: WorkflowProjection<Node, Data>;
      }): Promise<AppendedRouteCommandSettlement<Node, Data>> => {
        await appendCommandSettlementSpy(input);
        throw new Error("snapshot write failed");
      };
    const routeWorkflows = createRouteWorkflowPortDouble({
      appendCommandSettlement
    });
    const command = buildCommand();
    const execute = vi.fn().mockResolvedValue({
      issueId: "issue-123"
    });

    await expect(
      executeSettledRouteCommand({
        routeWorkflows,
        workflowId: "workflow-1",
        session,
        command,
        recordedAt: "2026-04-12T22:00:00.000Z",
        execute
      })
    ).rejects.toThrow(
      "Route workflow workflow-1 executed command command-1 successfully but could not record the settlement."
    );

    expect(execute).toHaveBeenCalledTimes(1);
    expect(settleCommandAsync).toHaveBeenCalledTimes(1);
    expect(settleCommandAsync).toHaveBeenCalledWith({
      commandId: command.id,
      status: "succeeded",
      payload: null,
      recordedAt: "2026-04-12T22:00:00.000Z"
    });
    expect(appendCommandSettlementSpy).toHaveBeenCalledTimes(1);
    expect(appendCommandSettlementSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "workflow-1",
        commandId: command.id,
        status: "succeeded"
      })
    );
  });

  it("surfaces failed-settlement persistence errors separately from the original command failure", async () => {
    const { session, settleCommandAsync } = createSessionDouble();
    const appendCommandSettlementSpy = vi.fn(
      async (input: Record<string, unknown>) => {
        void input;
        throw new Error("snapshot write failed");
      }
    );
    const appendCommandSettlement: SymphonyRouteWorkflowPort["appendCommandSettlement"] =
      async <Node extends string, Data>(input: {
        workflowId: string;
        commandId: string;
        status: "succeeded" | "failed";
        payload: WorkflowPayload;
        recordedAt: string;
        projection: WorkflowProjection<Node, Data>;
      }): Promise<AppendedRouteCommandSettlement<Node, Data>> => {
        await appendCommandSettlementSpy(input);
        throw new Error("snapshot write failed");
      };
    const routeWorkflows = createRouteWorkflowPortDouble({
      appendCommandSettlement
    });
    const command = buildCommand();

    await expect(
      executeSettledRouteCommand({
        routeWorkflows,
        workflowId: "workflow-1",
        session,
        command,
        recordedAt: "2026-04-12T22:00:00.000Z",
        async execute() {
          throw new Error("tracker unavailable");
        }
      })
    ).rejects.toThrow(
      "Route workflow workflow-1 failed command command-1 and could not record the failed settlement. Original command error: Error: tracker unavailable"
    );

    expect(settleCommandAsync).toHaveBeenCalledTimes(1);
    expect(settleCommandAsync).toHaveBeenCalledWith({
      commandId: command.id,
      status: "failed",
      payload: {
        error: "Error: tracker unavailable"
      },
      recordedAt: "2026-04-12T22:00:00.000Z"
    });
    expect(appendCommandSettlementSpy).toHaveBeenCalledTimes(1);
    expect(appendCommandSettlementSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: "workflow-1",
        commandId: command.id,
        status: "failed"
      })
    );
  });
});

function buildAppendedCommandSettlement<Node extends string, Data>(
  input: {
    workflowId: string;
    commandId: string;
    status: "succeeded" | "failed";
    payload: WorkflowPayload;
    recordedAt: string;
    projection: WorkflowProjection<Node, Data>;
  }
): AppendedRouteCommandSettlement<Node, Data> {
  return {
    historyEvent: {
      eventId: "history-1",
      workflowId: input.workflowId,
      eventSequence: 1,
      kind: "command_settled",
      recordedAt: input.recordedAt,
      signalId: null,
      signalType: null,
      signalSource: null,
      decisionId: null,
      commandId: input.commandId,
      fromNode: null,
      toNode: null,
      edgeId: null,
      reasonCode: null,
      event: {
        kind: "command_settled",
        commandId: input.commandId,
        status: input.status,
        payload: input.payload,
        recordedAt: input.recordedAt
      },
      insertedAt: input.recordedAt
    },
    snapshot: {
      workflowId: input.workflowId,
      eventSequence: 1,
      currentNode: input.projection.currentNode,
      terminal: input.projection.terminal,
      lastSignalId: input.projection.lastSignal?.id ?? null,
      lastDecisionId: input.projection.lastDecision?.id ?? null,
      projection: input.projection,
      updatedAt: input.recordedAt
    }
  };
}
