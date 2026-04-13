import type {
  SymphonyDispatchHandling
} from "@symphony/orchestrator";
import type { SymphonyRunMode } from "@symphony/runtime-contract";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import type { SymphonyTrackerStateDispatchRequest } from "./runtime-tracker-state-observation-routing.js";
import type {
  SymphonyRuntimeWorkflowSessionLoader
} from "./runtime-workflow-session-loader.js";
import type {
  SymphonyCapabilityContractIntake
} from "./symphony-capability-contract-intake.js";
import type {
  SymphonyCapabilityExecutionService
} from "./symphony-capability-execution.js";

const capabilityManagedRunModes = new Set<SymphonyRunMode>([
  "implementation",
  "rework"
]);

export type SymphonyCapabilityDispatchAuthorityService = {
  handleDispatchRequest(
    input: SymphonyTrackerStateDispatchRequest
  ): Promise<SymphonyDispatchHandling>;
};

export function createSymphonyCapabilityDispatchAuthorityService(input: {
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
  contractIntake: SymphonyCapabilityContractIntake;
  capabilityExecution: SymphonyCapabilityExecutionService;
  maxAdvanceSteps?: number;
}): SymphonyCapabilityDispatchAuthorityService {
  const maxAdvanceSteps = input.maxAdvanceSteps ?? 16;

  return {
    async handleDispatchRequest(dispatchInput) {
      if (!capabilityManagedRunModes.has(dispatchInput.runMode)) {
        return "external_run";
      }

      await ensureExecutionContract({
        sessionLoader: input.sessionLoader,
        contractIntake: input.contractIntake,
        workflowId: dispatchInput.workflowId,
        issue: dispatchInput.trackerIssue,
        recordedAt: dispatchInput.recordedAt
      });

      let recordedAt = dispatchInput.recordedAt;

      for (let step = 0; step < maxAdvanceSteps; step += 1) {
        const advanced = await input.capabilityExecution.advanceByWorkflowId({
          workflowId: dispatchInput.workflowId,
          recordedAt
        });

        if (advanced.kind === "not_executed") {
          return "handled_in_process";
        }

        if (advanced.nextPlanning.plan.kind !== "execute") {
          return "handled_in_process";
        }

        recordedAt = incrementIsoTimestamp(dispatchInput.recordedAt, step + 1);
      }

      throw new TypeError(
        `Capability dispatch authority exceeded ${maxAdvanceSteps} advancement steps for workflow ${dispatchInput.workflowId}.`
      );
    }
  };
}

async function ensureExecutionContract(input: {
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
  contractIntake: SymphonyCapabilityContractIntake;
  workflowId: string;
  issue: Pick<SymphonyTrackerIssue, "identifier" | "title" | "description">;
  recordedAt: string;
}) {
  const existing = await input.contractIntake.loadByWorkflowId(input.workflowId);
  if (existing) {
    return existing;
  }

  const loaded = await input.sessionLoader.loadHydrationByWorkflowId({
    workflowId: input.workflowId
  });
  if (!loaded) {
    throw new TypeError(
      `Capability dispatch authority cannot load route workflow ${input.workflowId}.`
    );
  }

  return await input.contractIntake.createAndPersistForWorkflow({
    workflowId: input.workflowId,
    issue: input.issue,
    repositoryKey: loaded.hydrationState.workflow.repositoryKey,
    recordedAt: input.recordedAt
  });
}

function incrementIsoTimestamp(value: string, stepMs: number): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new TypeError(`Invalid ISO timestamp ${JSON.stringify(value)}.`);
  }

  return new Date(timestamp + stepMs).toISOString();
}
