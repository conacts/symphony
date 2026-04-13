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
  buildSymphonyReworkHandoff,
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
  createSymphonyCapabilityExecutionService
} from "./symphony-capability-execution.js";
import {
  createSymphonyCapabilityContractIntake
} from "./symphony-capability-contract-intake.js";
import {
  createSymphonyCapabilityDispatchAuthorityService
} from "./symphony-capability-dispatch-authority.js";
import {
  createSymphonyInProcessCapabilityExecutionEngine
} from "./symphony-in-process-capability-execution.js";

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
  it("handles Todo capability routing without an external dispatch callback", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      const observed = await harness.service.observeNonRunningTrackerStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-13T08:00:00.000Z"
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
      expect(commands.map((command) => command.command.payload.capabilityId)).toEqual([
        "implement.spec",
        "critic.code_review"
      ]);
    } finally {
      harness.close();
    }
  });

  it("handles review rework routing without an external dispatch callback", async () => {
    const harness = await createHarness({
      state: "In Review"
    });

    try {
      const seeded = await harness.service.observeNonRunningTrackerStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-13T08:05:00.000Z"
      });
      const routed = await harness.service.routeReviewReworkRequest({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-13T08:05:10.000Z",
        handoff: buildSymphonyReworkHandoff({
          triggerKind: "changes_requested_review",
          recordedAt: "2026-04-13T08:05:10.000Z"
        })
      });
      const workflowId = await harness.requireWorkflowId();
      const commands =
        await harness.routeWorkflowStore.listCapabilityPlannerCommands(workflowId);

      expect(seeded).toEqual({
        issueIdentifier: harness.issue.identifier,
        observedTrackerState: "In Review",
        workflowTrackerState: "In Review",
        observed: true,
        disposition: "observed"
      });
      expect(routed).toBe(true);
      expect(harness.tracker.getIssue(harness.issue.id)?.state).toBe("Bootstrapping");
      expect(commands.map((command) => command.command.payload.capabilityId)).toEqual([
        "implement.spec",
        "critic.code_review"
      ]);
    } finally {
      harness.close();
    }
  });

  it("keeps bootstrap redispatch under planner authority after restart", async () => {
    const harness = await createHarness({
      state: "Todo"
    });

    try {
      await harness.service.observeNonRunningTrackerStateByIdentifier({
        issueIdentifier: harness.issue.identifier,
        recordedAt: "2026-04-13T08:10:00.000Z"
      });
      const workflowId = await harness.requireWorkflowId();
      const commandsBefore =
        await harness.routeWorkflowStore.listCapabilityPlannerCommands(workflowId);

      await harness.restartService("2026-04-13T08:10:05.000Z");

      const bootstrappingIssue =
        harness.tracker.getIssue(harness.issue.id) ??
        (() => {
          throw new TypeError("Expected Bootstrapping tracker issue after capability routing.");
        })();
      const routed = await harness.service.workflowRoutingAdapter.routeDispatchBootstrap({
        issue: bootstrappingIssue,
        attempt: 2,
        preferredWorkerHost: null,
        startedAt: "2026-04-13T08:10:10.000Z"
      });
      const commandsAfter =
        await harness.routeWorkflowStore.listCapabilityPlannerCommands(workflowId);

      expect(routed.issue.state).toBe("Bootstrapping");
      expect(routed.runMode).toBe("implementation");
      expect(routed.dispatchHandling).toBe("handled_in_process");
      expect(commandsAfter).toEqual(commandsBefore);
    } finally {
      harness.close();
    }
  });
});

async function createHarness(input: {
  state: string;
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
    description: buildCapabilityTicketDescription()
  });
  const tracker = createMemorySymphonyTracker([issue]);

  await issueStore.upsert({
    issueIdentifier: issue.identifier,
    trackerIssueId: issue.id,
    repositoryKey: "openai/symphony",
    latestRunStartedAt: null,
    recordedAt: "2026-04-13T07:59:00.000Z"
  });

  async function buildService(nowIso: string) {
    const sessionLoader = await createRuntimeWorkflowSessionLoader({
      routeWorkflows,
      trackerConfig: runtimePolicy.tracker,
      now: () => new Date(nowIso)
    });
    const capabilityPlanning = createSymphonyCapabilityPlanningService({
      routeWorkflowStore
    });
    const capabilityExecution = createSymphonyCapabilityExecutionService({
      capabilityPlanning,
      routeWorkflowStore,
      routeWorkflows,
      sessionLoader,
      engine: createSymphonyInProcessCapabilityExecutionEngine()
    });
    const contractIntake = createSymphonyCapabilityContractIntake({
      routeWorkflows
    });
    const capabilityDispatchAuthority =
      createSymphonyCapabilityDispatchAuthorityService({
        sessionLoader,
        contractIntake,
        capabilityExecution
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

  let service = await buildService("2026-04-13T08:00:00.000Z");

  return {
    issue,
    tracker,
    routeWorkflowStore,
    get service() {
      return service;
    },
    async restartService(nowIso: string) {
      service = await buildService(nowIso);
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

function buildCapabilityTicketDescription(): string {
  return [
    "## Objective",
    "Implement the requested slice through the capability router.",
    "",
    "## Done Definition",
    "- The capability planner owns the next executable work.",
    "- Control-plane history records every planner-visible state change.",
    "",
    "## Merge Policy",
    "manual"
  ].join("\n");
}
