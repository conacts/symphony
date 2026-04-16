import type {
  SymphonyDispatchHandling
} from "@symphony/orchestrator";
import type { SymphonyRunMode } from "@symphony/runtime-contract";
import type {
  SymphonyTracker
} from "@symphony/tracker";
import type { SymphonyRouteWorkflowPort } from "./runtime-route-workflows.js";
import type { SymphonyTrackerStateDispatchRequest } from "./runtime-tracker-state-observation-routing.js";
import type {
  SymphonyRuntimeWorkflowSessionLoader
} from "./runtime-workflow-session-loader.js";
import type {
  SymphonyCapabilityContractIntake
} from "./symphony-capability-contract-intake.js";
import type {
  SymphonyCapabilityPlanningService
} from "./symphony-capability-planning.js";
import {
  createSymphonyIntakeReviewModuleService
} from "./symphony-intake-review-module.js";

const capabilityManagedRunModes = new Set<SymphonyRunMode>(["implementation"]);

export type SymphonyCapabilityDispatchAuthorityService = {
  handleDispatchRequest(
    input: SymphonyTrackerStateDispatchRequest
  ): Promise<SymphonyDispatchHandling>;
};

export function createSymphonyCapabilityDispatchAuthorityService(input: {
  sessionLoader: SymphonyRuntimeWorkflowSessionLoader;
  routeWorkflows: SymphonyRouteWorkflowPort;
  tracker: SymphonyTracker;
  contractIntake: SymphonyCapabilityContractIntake;
  capabilityPlanning: SymphonyCapabilityPlanningService;
}): SymphonyCapabilityDispatchAuthorityService {
  const intakeReview = createSymphonyIntakeReviewModuleService({
    sessionLoader: input.sessionLoader,
    routeWorkflows: input.routeWorkflows,
    tracker: input.tracker,
    contractIntake: input.contractIntake
  });

  return {
    async handleDispatchRequest(dispatchInput) {
      if (!capabilityManagedRunModes.has(dispatchInput.runMode)) {
        return "external_run";
      }

      const intakeReviewResult = await intakeReview.executeIfNeeded({
        workflowId: dispatchInput.workflowId,
        issue: dispatchInput.trackerIssue,
        runMode: dispatchInput.runMode,
        recordedAt: dispatchInput.recordedAt,
        causationId: dispatchInput.commandId
      });
      switch (intakeReviewResult.kind) {
        case "clarification_requested":
        case "failed":
          return "handled_in_process";
        case "not_needed":
        case "completed":
          break;
      }

      const planning = await input.capabilityPlanning.planByWorkflowId({
        workflowId: dispatchInput.workflowId,
        recordedAt: dispatchInput.recordedAt
      });

      if (planning.plan.kind !== "execute") {
        return "handled_in_process";
      }

      return "external_run";
    }
  };
}
