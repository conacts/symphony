import type {
  SymphonyJsonValue,
  SymphonyOrchestratorObserver,
  SymphonyRunJournal
} from "@symphony/core";
import type { SymphonyIssueTimelineStore } from "@symphony/db";

export function createDbBackedOrchestratorObserver(input: {
  runJournal: SymphonyRunJournal;
  issueTimelineStore: SymphonyIssueTimelineStore;
}): SymphonyOrchestratorObserver {
  return {
    async startRun({ issue, attempt, workspacePath, workerHost, startedAt }) {
      return await input.runJournal.recordRunStarted({
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        attempt,
        status: "dispatching",
        workerHost,
        workspacePath,
        startedAt,
        metadata: {
          runtime: "typescript"
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
        const workspacePayload = asRecord(payload);
        await input.runJournal.updateRun(runId, {
          workspacePath:
            typeof workspacePayload?.workspacePath === "string"
              ? workspacePayload.workspacePath
              : null,
          workerHost:
            typeof workspacePayload?.workerHost === "string"
              ? workspacePayload.workerHost
              : null
        });
      }

      if (runId && eventType === "run_launched") {
        const launchPayload = asRecord(payload);
        await input.runJournal.updateRun(runId, {
          status: "running",
          workspacePath:
            typeof launchPayload?.workspacePath === "string"
              ? launchPayload.workspacePath
              : null,
          workerHost:
            typeof launchPayload?.workerHost === "string"
              ? launchPayload.workerHost
              : null,
          metadata: {
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
      workspacePath,
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
          workspacePath,
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
