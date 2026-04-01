import type {
  SymphonyOrchestratorObserver
} from "@symphony/core/orchestration";
import type {
  SymphonyJsonValue,
  SymphonyRunJournal
} from "@symphony/core/journal";
import type { SymphonyIssueTimelineStore } from "@symphony/db";

export function createDbBackedOrchestratorObserver(input: {
  runJournal: SymphonyRunJournal;
  issueTimelineStore: SymphonyIssueTimelineStore;
}): SymphonyOrchestratorObserver {
  return {
    async startRun({ issue, attempt, workspace, workerHost, startedAt }) {
      return await input.runJournal.recordRunStarted({
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        attempt,
        status: "dispatching",
        workerHost,
        workspacePath: workspaceHostPath(workspace),
        startedAt,
        metadata: {
          runtime: "typescript",
          workspace: workspaceMetadata(workspace)
        }
      });
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
        await input.runJournal.updateRun(runId, {
          workspacePath: workspaceHostPath(workspacePayload),
          workerHost: workspaceWorkerHost(workspacePayload),
          metadata: {
            workspace: workspaceMetadata(workspacePayload)
          }
        });
      }

      if (runId && eventType === "run_launched") {
        const launchPayload = asRecord(payload);
        const workspacePayload = extractWorkspaceMetadata(payload);
        await input.runJournal.updateRun(runId, {
          status: "running",
          workspacePath: workspaceHostPath(workspacePayload),
          workerHost:
            typeof launchPayload?.workerHost === "string"
              ? launchPayload.workerHost
              : workspaceWorkerHost(workspacePayload),
          metadata: {
            workspace: workspaceMetadata(workspacePayload),
            sessionId:
              typeof launchPayload?.sessionId === "string"
                ? launchPayload.sessionId
                : null
          }
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

      await input.runJournal.finalizeRun(runId, {
        status: completionStatus(completion),
        outcome: completionOutcome(completion),
        endedAt,
        metadata: {
          turnCount,
          workerHost,
          workspacePath: workspaceHostPath(workspace),
          workspace: workspaceMetadata(workspace),
          tokens: {
            inputTokens,
            outputTokens,
            totalTokens
          }
        },
        errorClass:
          completion.kind === "normal" ? null : completionErrorClass(completion),
        errorMessage:
          completion.kind === "normal" ? null : completion.reason
      });
    }
  };
}

type ObserverWorkspace = Parameters<SymphonyOrchestratorObserver["startRun"]>[0]["workspace"];

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

function extractWorkspaceMetadata(payload: unknown): ObserverWorkspace {
  const record = asRecord(payload);
  const nestedWorkspace = asRecord(record?.workspace);
  const workspaceRecord = nestedWorkspace ?? record;

  return isWorkspaceRecord(workspaceRecord)
    ? (workspaceRecord as NonNullable<ObserverWorkspace>)
    : null;
}

function isWorkspaceRecord(value: Record<string, unknown> | null): boolean {
  return (
    value !== null &&
    typeof value.issueIdentifier === "string" &&
    typeof value.workspaceKey === "string" &&
    typeof value.backendKind === "string"
  );
}

function workspaceHostPath(workspace: ObserverWorkspace): string | null {
  if (!workspace) {
    return null;
  }

  if (workspace.executionTarget.kind === "host_path") {
    return workspace.executionTarget.path;
  }

  if (workspace.executionTarget.hostPath) {
    return workspace.executionTarget.hostPath;
  }

  switch (workspace.materialization.kind) {
    case "directory":
      return workspace.materialization.hostPath;
    case "bind_mount":
      return workspace.materialization.hostPath;
    case "volume":
      return workspace.materialization.hostPath;
  }

  return null;
}

function workspaceWorkerHost(workspace: ObserverWorkspace): string | null {
  return workspace?.workerHost ?? null;
}

function workspaceMetadata(workspace: ObserverWorkspace): SymphonyJsonValue {
  if (!workspace) {
    return null;
  }

  return {
    issueIdentifier: workspace.issueIdentifier,
    workspaceKey: workspace.workspaceKey,
    backendKind: workspace.backendKind,
    created: workspace.created,
    workerHost: workspace.workerHost,
    path: workspace.path,
    executionTarget: {
      ...workspace.executionTarget
    },
    materialization: {
      ...workspace.materialization
    }
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
