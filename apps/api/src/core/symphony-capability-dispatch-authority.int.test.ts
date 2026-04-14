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

  it("fails malformed capability contracts once and does not keep redispatching bootstrapping work", async () => {
    const harness = await createHarness({
      state: "Todo",
      description: buildCapabilityTicketDescription({
        objective: null
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
          body: expect.stringContaining("ticket contract was not strong enough")
        })
      );
      expect(failureComment?.body).toContain("`objective is required.`");
      expect(failureComment?.body).toContain("`## Objective`");
      expect(failureComment?.body).toContain("`## Done Definition`");
      expect(failureComment?.body).toContain("`## Merge Policy`");
      expect(failureComment?.body).toContain("move the issue back to `Todo`");
      expect(repeated).toEqual({
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
  mergePolicy?: string | null;
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

  if (input.mergePolicy !== null) {
    sections.push("## Merge Policy");
    sections.push(input.mergePolicy ?? "manual");
  }

  return sections.join("\n");
}
