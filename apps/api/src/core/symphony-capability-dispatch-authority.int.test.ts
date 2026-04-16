import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRouteWorkflowStore,
  createSymphonyIssueStore,
  initializeSymphonyDb
} from "@symphony/db";
import {
  buildSymphonyRuntimePolicy,
  buildSymphonyTrackerIssue
} from "@symphony/test-support";
import { createMemorySymphonyTracker } from "@symphony/tracker";
import {
  createRouteWorkflowPort
} from "./runtime-route-workflows.js";
import {
  createRuntimeRouteLifecycleService
} from "./runtime-route-lifecycle-service.js";
import {
  createRuntimeWorkflowSessionLoader
} from "./runtime-workflow-session-loader.js";
import {
  createDefaultRuntimeWorkflowPresetSelection
} from "./runtime-workflow-preset-selection.js";
import {
  createSymphonyCapabilityPlanningService
} from "./symphony-capability-planning.js";
import {
  createSymphonyCapabilityContractIntake
} from "./symphony-capability-contract-intake.js";
import {
  createSymphonyCapabilityDispatchAuthorityService
} from "./symphony-capability-dispatch-authority.js";
import {
  createExternalRunDispatchAuthority
} from "../test-support/runtime-dispatch-authority-stub.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true
      })
    )
  );
});

describe("Symphony capability dispatch authority", () => {
  it("keeps Todo capability routing in bootstrapping until an external run starts", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      const dispatchRequests: Array<{
        workflowId: string;
        issueState: string;
        runMode: string;
      }> = [];
      const observed = await harness.service.observeNonRunningTrackerStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-13T08:00:00.000Z",
        onDispatchRequested: async (input) => {
          dispatchRequests.push({
            workflowId: input.workflowId,
            issueState: input.trackerIssue.state,
            runMode: input.runMode
          });
        }
      });
      const workflowId = await harness.requireWorkflowId();
      const commands =
        await harness.routeWorkflowStore.listCapabilityPlannerCommands(workflowId);
      const contract = await harness.routeWorkflowStore.getExecutionContract(workflowId);

      expect(observed).toEqual({
        issueIdentifier: harness.issue.identifier,
        observedTrackerState: "Todo",
        workflowTrackerState: "Bootstrapping",
        observed: true,
        disposition: "observed"
      });
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Bootstrapping");
      expect(contract).toEqual(
        expect.objectContaining({
          workflowId,
          issueIdentifier: harness.issue.identifier,
          repositoryKey: "openai/symphony"
        })
      );
      expect(dispatchRequests).toEqual([
        {
          workflowId,
          issueState: "Bootstrapping",
          runMode: "implementation"
        }
      ]);
      expect(commands.map((command) => command.command.payload.capabilityId)).toEqual([
        "implement.spec"
      ]);
    } finally {
      harness.close();
    }
  });

  it("keeps bootstrap redispatch under planner authority after restart", async () => {
    const harness = await createHarness({
      state: "Todo",
      dispatchAuthorityMode: "external"
    });

    try {
      const observed = await harness.service.observeNonRunningTrackerStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-13T08:10:00.000Z",
        onDispatchRequested: async () => {}
      });
      expect(observed).toEqual({
        issueIdentifier: harness.issue.identifier,
        observedTrackerState: "Todo",
        workflowTrackerState: "Bootstrapping",
        observed: true,
        disposition: "observed"
      });
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Bootstrapping");

      await harness.restartService("2026-04-13T08:10:05.000Z", "capability");
      const workflowId = await harness.requireWorkflowId();

      const bootstrappingIssue =
        harness.tracker.getIssue(harness.issue.id) ??
        (() => {
          throw new TypeError(
            "Expected tracker issue before capability redispatch."
          );
        })();
      const routed = await harness.service.workflowRoutingAdapter.routeDispatchBootstrap({
        issue: bootstrappingIssue,
        attempt: 2,
        preferredWorkerHost: null,
        startedAt: "2026-04-13T08:10:10.000Z"
      });
      const commandsAfter =
        await harness.routeWorkflowStore.listCapabilityPlannerCommands(workflowId);

      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Bootstrapping");
      expect(routed.runMode).toBe("implementation");
      expect(routed.dispatchHandling).toBe("external_run");
      expect(commandsAfter.map((command) => command.command.payload.capabilityId)).toEqual([
        "implement.spec"
      ]);
    } finally {
      harness.close();
    }
  });

  it("fails invalid capability directives once and keeps workflow-authoritative failure across restart", async () => {
    const harness = await createHarness({
      state: "Todo",
      description: buildCapabilityTicketDescription({
        maxRetryCount: "1.5"
      })
    });

    try {
      const observed = await harness.service.observeNonRunningTrackerStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-13T08:15:00.000Z"
      });
      const workflowId = await harness.requireWorkflowId();
      const contract = await harness.routeWorkflowStore.getExecutionContract(workflowId);
      const commands =
        await harness.routeWorkflowStore.listCapabilityPlannerCommands(workflowId);
      const hydration =
        await harness.routeWorkflowStore.loadWorkflowHydrationState(workflowId);
      const trackerOperations = harness.tracker.listOperations();
      const failureComment = trackerOperations.find(
        (operation) => operation.kind === "comment"
      );
      const repeated = await harness.service.observeNonRunningTrackerStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-13T08:15:05.000Z"
      });

      expect(observed).toEqual({
        issueIdentifier: harness.issue.identifier,
        observedTrackerState: "Todo",
        workflowTrackerState: "Failed",
        observed: true,
        disposition: "observed"
      });
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Failed");
      expect(contract).toBeNull();
      expect(commands).toEqual([]);
      expect(hydration?.snapshot?.projection.currentNode).toBe("failed");
      expect(failureComment).toEqual(
        expect.objectContaining({
          kind: "comment",
          issueId: harness.issue.id,
          body: expect.stringContaining("could not be normalized into a valid execution contract")
        })
      );
      expect(failureComment?.body).toContain(
        'Invalid max retry count "1.5".'
      );
      expect(failureComment?.body).toContain(
        "Update the ticket body or routing directives"
      );
      expect(failureComment?.body).toContain(
        "The issue is currently in `Failed`."
      );
      expect(failureComment?.body).toContain("move it to `Todo` to requeue");
      expect(repeated).toEqual({
        issueIdentifier: harness.issue.identifier,
        observedTrackerState: "Failed",
        workflowTrackerState: "Failed",
        observed: false,
        disposition: "skipped"
      });

      await harness.restartService("2026-04-13T08:15:10.000Z");
      const afterRestart =
        await harness.service.observeNonRunningTrackerStateByIdentifier({
          issueIdentifier: harness.issue.identifier,
          recordedAt: "2026-04-13T08:15:11.000Z"
        });
      expect(afterRestart).toEqual({
        issueIdentifier: harness.issue.identifier,
        observedTrackerState: "Failed",
        workflowTrackerState: "Failed",
        observed: false,
        disposition: "skipped"
      });
    } finally {
      harness.close();
    }
  });

  it("pauses weak intake tickets for clarification without collapsing the workflow into generic paused state", async () => {
    const harness = await createHarness({
      state: "Todo",
      description: ""
    });

    try {
      const observed = await harness.service.observeNonRunningTrackerStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-13T08:20:00.000Z"
      });
      const workflowId = await harness.requireWorkflowId();
      const contract = await harness.routeWorkflowStore.getExecutionContract(workflowId);
      const hydration =
        await harness.routeWorkflowStore.loadWorkflowHydrationState(workflowId);
      const trackerOperations = harness.tracker.listOperations();
      const initialHistory =
        await harness.routeWorkflowStore.listHistory(workflowId);
      const clarificationComment = firstTrackerCommentBody(trackerOperations);
      const pausedTransitionCount = countTrackerStateUpdates(
        trackerOperations,
        "Paused"
      );
      const clarificationSignalCount = countSignalType(
        initialHistory,
        "workflow.clarification_requested"
      );
      const repeated = await harness.service.observeNonRunningTrackerStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-13T08:20:05.000Z"
      });
      const hydrationAfterRepeat =
        await harness.routeWorkflowStore.loadWorkflowHydrationState(workflowId);
      const trackerOperationsAfterRepeat = harness.tracker.listOperations();
      const historyAfterRepeat =
        await harness.routeWorkflowStore.listHistory(workflowId);

      expect(observed).toEqual({
        issueIdentifier: harness.issue.identifier,
        observedTrackerState: "Todo",
        workflowTrackerState: "Paused",
        observed: true,
        disposition: "observed"
      });
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Paused");
      expect(contract).toBeNull();
      expect(hydration?.snapshot?.projection.currentNode).toBe("awaiting_input");
      expect(hydration?.snapshot?.projection.data).toEqual(
        expect.objectContaining({
          trackerState: "Paused"
        })
      );
      expect(clarificationComment).toContain(
        "Symphony intake.review paused before execution."
      );
      expect(clarificationComment).toContain(
        "ticket needs more detail before it can derive a valid execution contract"
      );
      expect(clarificationComment).toContain(
        "What concrete outcome should count as done for this ticket?"
      );
      expect(clarificationComment).toContain(
        "The issue is currently in `Paused`."
      );
      expect(clarificationComment).toContain("move it to `Todo` to requeue");
      expect(countTrackerComments(trackerOperations)).toBe(1);
      expect(pausedTransitionCount).toBe(1);
      expect(listTrackerStateUpdates(trackerOperations)).toEqual([
        "Bootstrapping",
        "Paused"
      ]);
      expect(clarificationSignalCount).toBe(1);
      expect(repeated).toEqual({
        issueIdentifier: harness.issue.identifier,
        observedTrackerState: "Paused",
        workflowTrackerState: "Paused",
        observed: false,
        disposition: "skipped"
      });
      expect(hydrationAfterRepeat?.snapshot?.projection.currentNode).toBe(
        "awaiting_input"
      );
      expect(trackerOperationsAfterRepeat).toEqual(trackerOperations);
      expect(historyAfterRepeat).toHaveLength(initialHistory.length);
      expect(
        countSignalType(historyAfterRepeat, "workflow.clarification_requested")
      ).toBe(clarificationSignalCount);

      await harness.restartService("2026-04-13T08:20:10.000Z");
      const afterRestart =
        await harness.service.observeNonRunningTrackerStateByIdentifier({
          issueIdentifier: harness.issue.identifier,
          recordedAt: "2026-04-13T08:20:11.000Z"
        });
      const hydrationAfterRestart =
        await harness.routeWorkflowStore.loadWorkflowHydrationState(workflowId);
      const trackerOperationsAfterRestart = harness.tracker.listOperations();
      const historyAfterRestart =
        await harness.routeWorkflowStore.listHistory(workflowId);
      expect(afterRestart).toEqual({
        issueIdentifier: harness.issue.identifier,
        observedTrackerState: "Paused",
        workflowTrackerState: "Paused",
        observed: false,
        disposition: "skipped"
      });
      expect(hydrationAfterRestart?.snapshot?.projection.currentNode).toBe(
        "awaiting_input"
      );
      expect(trackerOperationsAfterRestart).toEqual(trackerOperations);
      expect(historyAfterRestart).toHaveLength(initialHistory.length);
      expect(
        countSignalType(historyAfterRestart, "workflow.clarification_requested")
      ).toBe(clarificationSignalCount);
    } finally {
      harness.close();
    }
  });
});

async function createHarness(input: {
  state: string;
  description?: string;
  dispatchAuthorityMode?: "capability" | "external";
}) {
  const root = await mkdtemp(path.join(tmpdir(), "symphony-capability-dispatch-"));
  tempDirectories.push(root);

  const database = initializeSymphonyDb({
    dbFile: path.join(root, "symphony.db")
  });
  const issueStore = createSymphonyIssueStore(database.db);
  const routeWorkflowStore = createRouteWorkflowStore(database.db);
  const routeWorkflows = createRouteWorkflowPort({
    routeWorkflowStore
  });
  const runtimePolicy = buildSymphonyRuntimePolicy();
  const issue = buildSymphonyTrackerIssue({
    state: input.state,
    description: input.description ?? buildCapabilityTicketDescription()
  });
  const tracker = createMemorySymphonyTracker([issue]);

  await issueStore.upsert({
    issueIdentifier: issue.identifier,
    trackerIssueId: issue.id,
    repositoryKey: "openai/symphony",
    latestRunStartedAt: null,
    recordedAt: "2026-04-13T07:59:00.000Z"
  });

  async function buildService(
    nowIso: string,
    dispatchAuthorityMode: "capability" | "external"
  ) {
    const sessionLoader = await createRuntimeWorkflowSessionLoader({
      routeWorkflows,
      trackerConfig: runtimePolicy.tracker,
      now: () => new Date(nowIso)
    });
    const capabilityPlanning = createSymphonyCapabilityPlanningService({
      routeWorkflowStore
    });
    const contractIntake = createSymphonyCapabilityContractIntake({
      routeWorkflows
    });
    const capabilityDispatchAuthority =
      dispatchAuthorityMode === "external"
        ? createExternalRunDispatchAuthority()
        : createSymphonyCapabilityDispatchAuthorityService({
          sessionLoader,
          routeWorkflows,
          tracker,
          contractIntake,
          capabilityPlanning
        });

    return await createRuntimeRouteLifecycleService({
      routeWorkflows,
      tracker,
      trackerConfig: runtimePolicy.tracker,
      repositoryKey: "openai/symphony",
      async ensureIssueIdentity(observedIssue) {
        await issueStore.upsert({
          issueIdentifier: observedIssue.identifier,
          trackerIssueId: observedIssue.id,
          repositoryKey: "openai/symphony",
          latestRunStartedAt: null,
          recordedAt: nowIso
        });
      },
      presetSelection: createDefaultRuntimeWorkflowPresetSelection(),
      sessionLoader,
      capabilityDispatchAuthority,
      now: () => new Date(nowIso)
    });
  }

  let service = await buildService(
    "2026-04-13T08:00:00.000Z",
    input.dispatchAuthorityMode ?? "capability"
  );

  return {
    issue,
    tracker,
    routeWorkflowStore,
    get service() {
      return service;
    },
    async restartService(
      nowIso: string,
      dispatchAuthorityMode: "capability" | "external" = "capability"
    ) {
      service = await buildService(nowIso, dispatchAuthorityMode);
      return service;
    },
    async requireWorkflowId() {
      const hydration = await routeWorkflows.loadHydrationStateByIssueIdentifier(
        issue.identifier
      );
      if (!hydration) {
        throw new TypeError(`Expected a route workflow for ${issue.identifier}.`);
      }

      return hydration.workflow.workflowId;
    },
    close() {
      database.close();
    }
  };
}

function buildCapabilityTicketDescription(input: {
  objective?: string | null;
  doneDefinition?: string | null;
  maxRetryCount?: string | null;
} = {}): string {
  const sections: string[] = [];

  if (input.objective !== null) {
    sections.push("## Objective");
    sections.push(
      input.objective ??
        "Implement the requested slice through the capability router."
    );
    sections.push("");
  }

  if (input.doneDefinition !== null) {
    sections.push("## Done Definition");
    sections.push(
      input.doneDefinition ??
        [
          "- The capability planner owns the next executable work.",
          "- Control-plane history records every planner-visible state change."
        ].join("\n")
    );
    sections.push("");
  }

  if (input.maxRetryCount !== null && input.maxRetryCount !== undefined) {
    sections.push("## Max Retry Count");
    sections.push(input.maxRetryCount);
    sections.push("");
  }

  return sections.join("\n");
}

function firstTrackerCommentBody(
  operations: ReturnType<ReturnType<typeof createMemorySymphonyTracker>["listOperations"]>
): string {
  const comment = operations.find((operation) => operation.kind === "comment");
  if (!comment) {
    throw new TypeError("Expected a tracker comment operation.");
  }

  return comment.body;
}

function countTrackerComments(
  operations: ReturnType<ReturnType<typeof createMemorySymphonyTracker>["listOperations"]>
): number {
  return operations.filter((operation) => operation.kind === "comment").length;
}

function listTrackerStateUpdates(
  operations: ReturnType<ReturnType<typeof createMemorySymphonyTracker>["listOperations"]>
): string[] {
  return operations.flatMap((operation) =>
    operation.kind === "update_state" ? [operation.stateName] : []
  );
}

function countTrackerStateUpdates(
  operations: ReturnType<ReturnType<typeof createMemorySymphonyTracker>["listOperations"]>,
  stateName: string
): number {
  return operations.filter(
    (operation) =>
      operation.kind === "update_state" && operation.stateName === stateName
  ).length;
}

function countSignalType(
  history: Awaited<
    ReturnType<
      Awaited<ReturnType<typeof createHarness>>["routeWorkflowStore"]["listHistory"]
    >
  >,
  signalType: string
): number {
  return history.filter((entry) => entry.signalType === signalType).length;
}
