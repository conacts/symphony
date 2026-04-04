import type {
  SymphonyOrchestratorObserver
} from "@symphony/orchestrator";
import {
  summarizePreparedWorkspace,
  type WorkspaceLifecycleMetadata
} from "@symphony/workspace";
import type { CodexAnalyticsStore } from "@symphony/codex-analytics";
import type {
  SymphonyJsonValue
} from "@symphony/run-journal";
import type {
  SymphonyIssueTimelineStore,
  SymphonyRuntimeRunStore
} from "@symphony/db";

export function createDbBackedOrchestratorObserver(input: {
  runStore: SymphonyRuntimeRunStore;
  issueTimelineStore: SymphonyIssueTimelineStore;
  codexAnalytics?: CodexAnalyticsStore;
}): SymphonyOrchestratorObserver {
  return {
    async startRun({ issue, attempt, workspace, workerHost, startedAt }) {
      const runId = await input.runStore.recordRunStarted({
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        attempt,
        status: "dispatching",
        workerHost,
        workspacePath: workspaceHostPath(summarizePreparedWorkspace(workspace)),
        startedAt,
        metadata: {
          runtime: "typescript",
          workspace: workspaceMetadata(summarizePreparedWorkspace(workspace))
        }
      });

      await input.codexAnalytics?.startRun({
        runId,
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        startedAt,
        status: "dispatching"
      });

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
            sessionId:
              typeof launchPayload?.sessionId === "string"
                ? launchPayload.sessionId
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
        await input.runStore.finalizeRun(runId, {
          status: "stopped",
          outcome: eventType,
          endedAt: recordedAt,
          metadata: {
            stopEventType: eventType,
            stopPayload: normalizeJsonValue(payload)
          }
        });
        await input.codexAnalytics?.finalizeRun({
          runId,
          status: "stopped",
          endedAt: recordedAt ?? new Date().toISOString(),
          failureKind: eventType,
          failureOrigin: "runtime",
          failureMessagePreview: previewRuntimeFailure(eventType)
        });
      }

      await input.issueTimelineStore.record({
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        runId,
        source,
        eventType,
        message: message ?? null,
        payload: normalizeJsonValue(payload),
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
          completion.kind === "normal" ? null : completionErrorClass(completion),
        errorMessage:
          completion.kind === "normal" ? null : completion.reason
      });

      await input.codexAnalytics?.finalizeRun({
        runId,
        status: completionStatus(completion),
        endedAt,
        failureKind: completion.kind === "normal" ? null : completion.kind,
        failureOrigin: completion.kind === "startup_failure" ? "runtime" : "codex",
        failureMessagePreview:
          completion.kind === "normal" ? null : previewRuntimeFailure(completion.reason)
      });
    }
  };
}

function previewRuntimeFailure(value: string): string {
  return value.length <= 280 ? value : `${value.slice(0, 279)}…`;
}

type ObserverWorkspaceMetadata = WorkspaceLifecycleMetadata | null;

function completionStatus(
  completion: Parameters<SymphonyOrchestratorObserver["finalizeRun"]>[0]["completion"]
): string {
  switch (completion.kind) {
    case "normal":
      return "finished";
    case "max_turns_reached":
      return "paused";
    case "startup_failure":
      return "startup_failed";
    case "rate_limited":
      return "rate_limited";
    case "stalled":
      return "stalled";
    case "failure":
      return "failed";
  }
}

function completionOutcome(
  completion: Parameters<SymphonyOrchestratorObserver["finalizeRun"]>[0]["completion"]
): string {
  switch (completion.kind) {
    case "normal":
      return "completed_turn_batch";
    case "max_turns_reached":
      return "paused_max_turns";
    case "startup_failure":
      return "startup_failed";
    case "rate_limited":
      return "rate_limited";
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
    case "normal":
      return "normal";
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

function workspaceMetadata(workspace: ObserverWorkspaceMetadata): SymphonyJsonValue {
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

function normalizeJsonValue(value: unknown): SymphonyJsonValue {
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
    ) as SymphonyJsonValue;
  }

  return String(value);
}
