import type { SymphonyJsonObject } from "@symphony/run-journal";
import type { SymphonyTracker, SymphonyTrackerIssue } from "../tracker/symphony-tracker.js";
import type { SymphonyResolvedWorkflowConfig } from "../workflow/symphony-workflow.js";
import type {
  PreparedWorkspace,
  WorkspaceBackend
} from "../workspace/workspace-backend.js";
import {
  buildFailureCommentBody,
  type SymphonyStartupFailureTransition
} from "./symphony-orchestrator-comments.js";
import {
  buildWorkspaceLifecyclePayload,
  createWorkspaceLifecycleRecorder,
  createWorkspaceRunnerOptions,
  recordDockerContainerCleanupEvent
} from "./symphony-orchestrator-workspace.js";
import type {
  SymphonyAgentRuntimeCompletion,
  SymphonyOrchestratorObserver
} from "./symphony-orchestrator-types.js";

export async function leaveFailureComment(input: {
  tracker: SymphonyTracker;
  observer: SymphonyOrchestratorObserver | null;
  issue: SymphonyTrackerIssue;
  reason: string;
  outcome: string;
  runId: string | null;
  options?: {
    rateLimits?: SymphonyJsonObject | null;
    startupFailureTransition?: SymphonyStartupFailureTransition;
  };
}): Promise<void> {
  const comment = buildFailureCommentBody(
    input.issue,
    input.reason,
    input.outcome,
    input.options
  );

  try {
    await input.tracker.createComment(input.issue.id, comment);
    await input.observer?.recordLifecycleEvent({
      issue: input.issue,
      runId: input.runId,
      source: "tracker",
      eventType: "tracker_comment_created",
      message: "Failure comment posted to tracker.",
      payload: {
        outcome: input.outcome
      }
    });
  } catch {
    return;
  }
}

export async function cleanupWorkspaceAndRecordLifecycle(input: {
  observer: SymphonyOrchestratorObserver | null;
  workspaceBackend: WorkspaceBackend;
  workflowConfig: SymphonyResolvedWorkflowConfig;
  runnerEnv: Record<string, string | undefined> | undefined;
  issue: SymphonyTrackerIssue;
  runId: string | null;
  workspace: PreparedWorkspace | null;
  workerHost: string | null;
  reason: "startup_failure" | "issue_stopped";
  startupFailure?: Extract<SymphonyAgentRuntimeCompletion, { kind: "startup_failure" }>;
}): Promise<void> {
  try {
    const cleanup = await input.workspaceBackend.cleanupWorkspace({
      issueIdentifier: input.issue.identifier,
      runId: input.runId,
      workspace: input.workspace,
      config: input.workflowConfig.workspace,
      hooks: input.workflowConfig.hooks,
      lifecycleRecorder: createWorkspaceLifecycleRecorder(
        input.observer,
        input.issue,
        input.runId
      ),
      ...createWorkspaceRunnerOptions(input.runnerEnv, input.workerHost)
    });

    await input.observer?.recordLifecycleEvent({
      issue: input.issue,
      runId: input.runId,
      source: "workspace",
      eventType: "workspace_cleanup_completed",
      message:
        input.reason === "startup_failure"
          ? "Workspace cleanup completed after startup failure."
          : "Workspace cleanup completed after the run stopped.",
      payload: {
        cleanup
      }
    });

    await recordDockerContainerCleanupEvent({
      observer: input.observer,
      issue: input.issue,
      runId: input.runId,
      cleanup
    });
  } catch (error) {
    await input.observer?.recordLifecycleEvent({
      issue: input.issue,
      runId: input.runId,
      source: "workspace",
      eventType: "workspace_cleanup_failed",
      message:
        input.reason === "startup_failure"
          ? "Workspace cleanup failed after startup failure."
          : "Workspace cleanup failed after the run stopped.",
      payload: {
        reason: error instanceof Error ? error.message : String(error),
        workspace: buildWorkspaceLifecyclePayload(input.workspace),
        startupFailure: input.startupFailure
          ? {
              failureStage: input.startupFailure.failureStage,
              failureOrigin: input.startupFailure.failureOrigin
            }
          : null
      }
    });
    throw error;
  }
}

export async function handleStartupFailure(input: {
  workflowConfig: SymphonyResolvedWorkflowConfig;
  tracker: SymphonyTracker;
  workspaceBackend: WorkspaceBackend;
  observer: SymphonyOrchestratorObserver | null;
  runnerEnv: Record<string, string | undefined> | undefined;
  issue: SymphonyTrackerIssue;
  workerHost: string | null;
  workspace: PreparedWorkspace | null;
  reason: string;
  runId: string | null;
  completion: Extract<SymphonyAgentRuntimeCompletion, { kind: "startup_failure" }>;
}): Promise<void> {
  const targetState =
    input.workflowConfig.tracker.startupFailureTransitionToState;
  let transition: SymphonyStartupFailureTransition = {
    kind: "none"
  };

  if (targetState) {
    try {
      await input.tracker.updateIssueState(input.issue.id, targetState);
      transition = {
        kind: "moved",
        targetState
      };
      await input.observer?.recordLifecycleEvent({
        issue: {
          ...input.issue,
          state: targetState
        },
        runId: input.runId,
        source: "tracker",
        eventType: "startup_failure_transition",
        message: `Issue moved to ${targetState} after startup failure.`,
        payload: {
          fromState: input.issue.state,
          toState: targetState
        }
      });
    } catch (error) {
      transition = {
        kind: "failed",
        targetState,
        reason: error instanceof Error ? error.message : String(error)
      };
      await input.observer?.recordLifecycleEvent({
        issue: input.issue,
        runId: input.runId,
        source: "tracker",
        eventType: "startup_failure_transition_failed",
        message: `Issue could not be moved to ${targetState} after startup failure.`,
        payload: {
          fromState: input.issue.state,
          toState: targetState,
          reason: transition.reason
        }
      });
    }
  }

  await leaveFailureComment({
    tracker: input.tracker,
    observer: input.observer,
    issue: input.issue,
    reason: input.reason,
    outcome: targetState ? "startup_failed_backlog" : "startup_failed",
    runId: input.runId,
    options: {
      startupFailureTransition: transition
    }
  });

  await cleanupWorkspaceAndRecordLifecycle({
    observer: input.observer,
    workspaceBackend: input.workspaceBackend,
    workflowConfig: input.workflowConfig,
    runnerEnv: input.runnerEnv,
    issue: input.issue,
    runId: input.runId,
    workspace: input.workspace,
    workerHost: input.workerHost,
    reason: "startup_failure",
    startupFailure: input.completion
  });
}
