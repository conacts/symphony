import { randomUUID } from "node:crypto";
import type {
  SymphonyOrchestratorObserver
} from "@symphony/orchestrator";
import {
  summarizePreparedWorkspace,
  type WorkspaceLifecycleMetadata
} from "@symphony/workspace";
import type { JsonValue } from "@symphony/contracts";
import type {
  SymphonyActiveRunExistsError,
  SymphonyIssueTimelineStore,
  SymphonyRuntimeLogStore,
  SymphonyRuntimeLogLevel,
  SymphonyRuntimeRunOutcome,
  SymphonyRuntimeRunStatus,
  SymphonyRuntimeRunStore
} from "@symphony/db";
import { SymphonyDispatchRefusedError } from "@symphony/orchestrator";
import type { RuntimeMachineLoadMonitor } from "./runtime-machine-load.js";
import type { AdmittedRuntimeRepository } from "./runtime-admitted-repositories.js";
import { resolveIssueRepository } from "./runtime-repository-routing.js";

export function createDbBackedOrchestratorObserver(input: {
  admittedRepositories: AdmittedRuntimeRepository[];
  runStore: SymphonyRuntimeRunStore;
  issueTimelineStore: SymphonyIssueTimelineStore;
  runtimeLogs: SymphonyRuntimeLogStore;
  machineLoad?: RuntimeMachineLoadMonitor;
}): SymphonyOrchestratorObserver {
  return {
    async startRun({ issue, attempt, workspace, workerHost, startedAt, runMode }) {
      const repositoryKey = resolveIssueRepository(
        input.admittedRepositories,
        issue
      ).repositoryKey;
      let runId: string;

      try {
        runId = randomUUID();
        runId = await input.runStore.recordRunStarted({
          repositoryKey,
          trackerIssueId: issue.id,
          issueIdentifier: issue.identifier,
          runId,
          attempt,
          runMode,
          status: "dispatching",
          workerHost,
          workspacePath: workspaceHostPath(summarizePreparedWorkspace(workspace)),
          startedAt,
          metadata: {
            runtime: "typescript",
            runMode,
            workspace: workspaceMetadata(summarizePreparedWorkspace(workspace))
          }
        });
      } catch (error) {
        if (isActiveRunExistsError(error)) {
          throw new SymphonyDispatchRefusedError({
            reason: "active_run_exists",
            issueIdentifier: issue.identifier,
            activeRunId: error.existingRunId,
            activeRunStatus: error.existingStatus
          });
        }

        throw error;
      }

      input.machineLoad?.startRun(runId);

      return runId;
    },

    async recordLifecycleEvent({
      issue,
      runId,
      source,
      eventType,
      message,
      payload,
      recordedAt
    }) {
      const normalizedPayload = normalizeJsonValue(payload);

      if (runId && source === "workspace") {
        const workspacePayload = extractWorkspaceMetadata(payload);
        if (workspacePayload) {
          await input.runStore.updateRun(runId, {
            workspacePath: workspaceHostPath(workspacePayload),
            workerHost: workspaceWorkerHost(workspacePayload),
            metadata: {
              workspace: workspaceMetadata(workspacePayload)
            }
          });
        }
      }

      if (runId && eventType === "runtime_launch_requested") {
        const launchPayload = asRecord(payload);
        const workspacePayload = extractWorkspaceMetadata(payload);
        await input.runStore.updateRun(runId, {
          status: "running",
          workspacePath: workspaceHostPath(workspacePayload),
          workerHost:
            typeof launchPayload?.workerHost === "string"
              ? launchPayload.workerHost
              : workspaceWorkerHost(workspacePayload),
          metadata: {
            workspace: workspaceMetadata(workspacePayload),
            launchTarget: normalizeJsonValue(launchPayload?.launchTarget ?? null),
            threadId:
              typeof launchPayload?.threadId === "string"
                ? launchPayload.threadId
                : null
          }
        });
      }

      if (runId && eventType === "runtime_startup_failed") {
        const failurePayload = asRecord(payload);
        await input.runStore.updateRun(runId, {
          metadata: {
            startupFailure: normalizeJsonValue({
              failureStage: failurePayload?.failureStage ?? null,
              failureOrigin: failurePayload?.failureOrigin ?? null,
              manifestLifecyclePhase:
                failurePayload?.manifestLifecyclePhase ?? null,
              manifestLifecycleStepName:
                failurePayload?.manifestLifecycleStepName ?? null,
              manifestLifecycle: failurePayload?.manifestLifecycle ?? null,
              launchTarget: failurePayload?.launchTarget ?? null
            })
          }
        });
      }

      if (runId && eventType === "workspace_cleanup_completed") {
        const cleanupPayload = asRecord(payload);
        await input.runStore.updateRun(runId, {
          metadata: {
            cleanup: normalizeJsonValue(cleanupPayload?.cleanup ?? null)
          }
        });
      }

      if (runId && (eventType === "run_stopped_inactive" || eventType === "run_stopped_terminal")) {
        const stoppedAt = recordedAt ?? new Date().toISOString();

        await input.runStore.finalizeRun(runId, {
          status: "stopped",
          outcome: eventType,
          endedAt: stoppedAt,
          machineLoadSummary: input.machineLoad?.finalizeRun(runId) ?? null,
          metadata: {
            stopEventType: eventType,
            stopPayload: normalizeJsonValue(payload)
          }
        });
      }

      await input.issueTimelineStore.record({
        issueIdentifier: issue.identifier,
        runId,
        source,
        eventType,
        message: message ?? null,
        payload: normalizedPayload,
        recordedAt
      });

      await input.runtimeLogs.record({
        level: runtimeLogLevelForLifecycleEvent(eventType),
        source,
        eventType,
        message: message ?? eventType,
        issueIdentifier: issue.identifier,
        runId,
        payload: normalizedPayload,
        recordedAt
      });
    },

    async finalizeRun({
      runId,
      completion,
      workerHost,
      workspace,
      endedAt,
      turnCount,
      inputTokens,
      outputTokens,
      totalTokens
    }) {
      if (!runId) {
        return;
      }

      await input.runStore.finalizeRun(runId, {
        status: completionStatus(completion),
        outcome: completionOutcome(completion),
        endedAt,
        machineLoadSummary: input.machineLoad?.finalizeRun(runId) ?? null,
        metadata: {
          turnCount,
          workerHost,
          workspacePath: workspaceHostPath(summarizePreparedWorkspace(workspace)),
          workspace: workspaceMetadata(summarizePreparedWorkspace(workspace)),
          launchTarget:
            completion.kind === "startup_failure"
              ? normalizeJsonValue(completion.launchTarget ?? null)
              : null,
          startupFailure:
            completion.kind === "startup_failure"
              ? {
                  failureStage: completion.failureStage,
                  failureOrigin: completion.failureOrigin,
                  manifestLifecyclePhase:
                    completion.manifestLifecyclePhase ?? null,
                  manifestLifecycleStepName:
                    completion.manifestLifecycleStepName ?? null,
                  manifestLifecycle: completion.manifestLifecycle ?? null
                }
              : null,
          usage: {
            input_tokens: inputTokens,
            cached_input_tokens: 0,
            output_tokens: outputTokens,
            total_tokens: totalTokens
          }
        },
        errorClass:
          isSuccessfulCompletion(completion) ? null : completionErrorClass(completion),
        errorMessage:
          isSuccessfulCompletion(completion) ? null : completion.reason
      });

    }
  };
}

function isActiveRunExistsError(
  error: unknown
): error is SymphonyActiveRunExistsError {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "SymphonyActiveRunExistsError"
  );
}

type ObserverWorkspaceMetadata = WorkspaceLifecycleMetadata | null;

function isSuccessfulCompletion(
  completion: Parameters<SymphonyOrchestratorObserver["finalizeRun"]>[0]["completion"]
): completion is Extract<
  Parameters<SymphonyOrchestratorObserver["finalizeRun"]>[0]["completion"],
  { kind: "delivered" | "merged" }
> {
  return completion.kind === "delivered" || completion.kind === "merged";
}

function completionStatus(
  completion: Parameters<SymphonyOrchestratorObserver["finalizeRun"]>[0]["completion"]
): SymphonyRuntimeRunStatus {
  switch (completion.kind) {
    case "delivered":
    case "merged":
      return "finished";
    case "blocked":
      return "failed";
    case "merge_blocked":
      return "failed";
    case "max_turns_reached":
      return "paused";
    case "startup_failure":
      return "startup_failed";
    case "rate_limited":
      return "rate_limited";
    case "provider_transient":
      return "failed";
    case "stalled":
      return "stalled";
    case "failure":
      return "failed";
  }
}

function completionOutcome(
  completion: Parameters<SymphonyOrchestratorObserver["finalizeRun"]>[0]["completion"]
): SymphonyRuntimeRunOutcome {
  switch (completion.kind) {
    case "delivered":
      return "completed";
    case "merged":
      return "merged";
    case "blocked":
      return "blocked";
    case "merge_blocked":
      return "merge_blocked";
    case "max_turns_reached":
      return "paused_max_turns";
    case "startup_failure":
      return "startup_failed";
    case "rate_limited":
      return "rate_limited";
    case "provider_transient":
      return "provider_transient";
    case "stalled":
      return "stalled";
    case "failure":
      return "failed";
  }
}

function completionErrorClass(
  completion: Parameters<SymphonyOrchestratorObserver["finalizeRun"]>[0]["completion"]
): string {
  switch (completion.kind) {
    case "startup_failure":
      return completion.manifestLifecyclePhase
        ? `startup_failure_${completion.failureOrigin}_${completion.failureStage}_${completion.manifestLifecyclePhase}`
        : `startup_failure_${completion.failureOrigin}_${completion.failureStage}`;
    case "max_turns_reached":
      return "max_turns_reached";
    case "delivered":
      return "delivered";
    case "merged":
      return "merged";
    default:
      return completion.kind;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractWorkspaceMetadata(payload: unknown): ObserverWorkspaceMetadata {
  const record = asRecord(payload);
  const nestedWorkspace = asRecord(record?.workspace);
  const workspaceRecord = nestedWorkspace ?? record;

  return isWorkspaceRecord(workspaceRecord)
    ? (workspaceRecord as WorkspaceLifecycleMetadata)
    : null;
}

function isWorkspaceRecord(value: Record<string, unknown> | null): boolean {
  return (
    value !== null &&
    typeof value.issueIdentifier === "string" &&
    typeof value.workspaceKey === "string" &&
    typeof value.backendKind === "string" &&
    typeof value.executionTargetKind === "string" &&
    typeof value.materializationKind === "string"
  );
}

function workspaceHostPath(workspace: ObserverWorkspaceMetadata): string | null {
  return workspace?.hostPath ?? workspace?.path ?? null;
}

function workspaceWorkerHost(workspace: ObserverWorkspaceMetadata): string | null {
  return workspace?.workerHost ?? null;
}

function workspaceMetadata(workspace: ObserverWorkspaceMetadata): JsonValue {
  if (!workspace) {
    return null;
  }

  return {
    issueIdentifier: workspace.issueIdentifier,
    workspaceKey: workspace.workspaceKey,
    backendKind: workspace.backendKind,
    workerHost: workspace.workerHost,
    executionTargetKind: workspace.executionTargetKind,
    materializationKind: workspace.materializationKind,
    hostRepoMetadataAvailable: workspace.hostRepoMetadataAvailable,
    prepareDisposition: workspace.prepareDisposition,
    containerDisposition: workspace.containerDisposition,
    networkDisposition: workspace.networkDisposition,
    afterCreateHookOutcome: workspace.afterCreateHookOutcome,
    hostPath: workspace.hostPath,
    runtimePath: workspace.runtimePath,
    containerId: workspace.containerId,
    containerName: workspace.containerName,
    networkName: workspace.networkName,
    services: workspace.services,
    envBundleSummary: workspace.envBundleSummary,
    manifestLifecycle: workspace.manifestLifecycle,
    path: workspace.path,
  };
}

function normalizeJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeJsonValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        normalizeJsonValue(nestedValue)
      ])
    ) as JsonValue;
  }

  return String(value);
}

function runtimeLogLevelForLifecycleEvent(eventType: string): SymphonyRuntimeLogLevel {
  return eventType.endsWith("_failed") ? "error" : "info";
}
