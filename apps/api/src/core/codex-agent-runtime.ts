import type {
  SymphonyResolvedWorkflowConfig,
  AgentRuntime
} from "@symphony/core";
import type {
  SymphonyAgentRuntimeCompletion,
  SymphonyAgentRuntimeUpdate,
  SymphonyStartupFailureOrigin,
  SymphonyStartupFailureStage
} from "@symphony/core/orchestration";
import type {
  SymphonyJsonObject,
  SymphonyJsonValue,
  SymphonyRunJournal
} from "@symphony/core/journal";
import type {
  SymphonyTracker,
  SymphonyTrackerIssue
} from "@symphony/core/tracker";
import type { SymphonyRuntimeLogStore } from "@symphony/db";
import type { SymphonyLogger } from "@symphony/logger";
import {
  CodexAppServerClient
} from "./codex-app-server-client.js";
import {
  CodexAppServerError,
  type CodexAppServerSessionClient,
  type CodexAppServerToolExecutor
} from "./codex-app-server-types.js";
import { buildLinearGraphqlToolExecutor } from "./codex-linear-graphql-tool.js";
import { captureRepoSnapshot } from "./codex-repo-snapshot.js";
import {
  resolveCodexRuntimeLaunchTarget,
  type CodexRuntimeLaunchTarget
} from "./codex-runtime-launch-target.js";
import {
  buildSymphonyContinuationPrompt,
  renderSymphonyPrompt
} from "./symphony-prompt.js";

type RunCallbacks = {
  onUpdate(issueId: string, update: SymphonyAgentRuntimeUpdate): void | Promise<void>;
  onComplete(
    issueId: string,
    completion: SymphonyAgentRuntimeCompletion
  ): void | Promise<void>;
};

type ActiveRun = {
  stopped: boolean;
  client: CodexAppServerSessionClient | null;
};

export function createCodexSymphonyAgentRuntime(input: {
  promptTemplate: string;
  tracker: SymphonyTracker;
  runJournal: SymphonyRunJournal;
  runtimeLogs: SymphonyRuntimeLogStore;
  workflowConfig: SymphonyResolvedWorkflowConfig;
  hostCommandEnvSource: Record<string, string | undefined>;
  codexHostLaunchEnv?: Record<string, string>;
  logger: SymphonyLogger;
  callbacks: RunCallbacks;
}): AgentRuntime {
  const activeRuns = new Map<string, ActiveRun>();

  return {
    async startRun(runInput) {
      const activeRun: ActiveRun = {
        stopped: false,
        client: null
      };
      activeRuns.set(runInput.issue.id, activeRun);
      const launchTarget = resolveCodexRuntimeLaunchTarget(
        runInput.workspace,
        runInput.workflowConfig.workspace.root
      );

      void executeRun({
        promptTemplate: input.promptTemplate,
        tracker: input.tracker,
        runJournal: input.runJournal,
        runtimeLogs: input.runtimeLogs,
        workflowConfig: runInput.workflowConfig,
        logger: input.logger.child({
          component: "codex_runtime",
          issueId: runInput.issue.id,
          issueIdentifier: runInput.issue.identifier
        }),
        hostCommandEnvSource: input.hostCommandEnvSource,
        codexHostLaunchEnv: input.codexHostLaunchEnv ?? {},
        callbacks: input.callbacks,
        issue: runInput.issue,
        runId: runInput.runId,
        attempt: runInput.attempt,
        workspace: runInput.workspace,
        launchTarget,
        activeRun,
        toolExecutor: buildLinearGraphqlToolExecutor(
          runInput.workflowConfig,
          input.logger
        )
      }).finally(() => {
        activeRuns.delete(runInput.issue.id);
      });

      return {
        sessionId: null,
        workerHost: runInput.workspace.workerHost ?? null,
        launchTarget
      };
    },

    async stopRun(stopInput) {
      const activeRun = activeRuns.get(stopInput.issue.id);
      if (!activeRun) {
        return;
      }

      activeRun.stopped = true;
      activeRun.client?.close();
    }
  };
}

export const createLocalCodexSymphonyAgentRuntime =
  createCodexSymphonyAgentRuntime;

async function executeRun(input: {
  promptTemplate: string;
  tracker: SymphonyTracker;
  runJournal: SymphonyRunJournal;
  runtimeLogs: SymphonyRuntimeLogStore;
  workflowConfig: SymphonyResolvedWorkflowConfig;
  logger: SymphonyLogger;
  hostCommandEnvSource: Record<string, string | undefined>;
  codexHostLaunchEnv: Record<string, string>;
  callbacks: RunCallbacks;
  issue: SymphonyTrackerIssue;
  runId: string | null;
  attempt: number;
  workspace: Parameters<AgentRuntime["startRun"]>[0]["workspace"];
  launchTarget: CodexRuntimeLaunchTarget;
  activeRun: ActiveRun;
  toolExecutor: CodexAppServerToolExecutor;
}): Promise<void> {
  let turnJournalId: string | null = null;
  let maxTurnsReached = false;

  try {
    await input.runtimeLogs.record({
      level: "info",
      source: "codex_runtime",
      eventType: "runtime_launch_target_resolved",
      message: "Resolved the Codex runtime launch target.",
      issueId: input.issue.id,
      issueIdentifier: input.issue.identifier,
      runId: input.runId,
      payload: {
        launchTarget: describeLaunchTarget(input.launchTarget)
      }
    });

    if (input.runId) {
      const repoStart = await captureRepoSnapshot(
        input.launchTarget,
        input.workflowConfig.hooks.timeoutMs
      );
      await input.runJournal.updateRun(input.runId, {
        commitHashStart: repoStart.commitHash,
        repoStart: repoStart.snapshot
      });
    }

    const session = await CodexAppServerClient.startSession({
      launchTarget: input.launchTarget,
      env: {
        ...input.workspace.envBundle.values,
        ...input.codexHostLaunchEnv
      },
      hostCommandEnvSource: input.hostCommandEnvSource,
      workflowConfig: input.workflowConfig,
      issue: input.issue,
      logger: input.logger
    });
    input.activeRun.client = session.client;

    await input.runtimeLogs.record({
      level: "info",
      source: "codex_runtime",
      eventType: "runtime_session_started",
      message: "Started the Codex app-server session.",
      issueId: input.issue.id,
      issueIdentifier: input.issue.identifier,
      runId: input.runId,
      payload: {
        threadId: session.threadId,
        processId: session.processId,
        model: session.model,
        reasoningEffort: session.reasoningEffort,
        launchTarget: describeLaunchTarget(session.launchTarget)
      }
    });

    let currentIssue = input.issue;

    for (
      let turnNumber = 1;
      turnNumber <= input.workflowConfig.agent.maxTurns;
      turnNumber += 1
    ) {
      if (input.activeRun.stopped) {
        return;
      }

      const prompt =
        turnNumber === 1
          ? renderSymphonyPrompt({
              template: input.promptTemplate,
              issue: currentIssue,
              attempt: input.attempt
            })
          : buildSymphonyContinuationPrompt({
              turnNumber,
              maxTurns: input.workflowConfig.agent.maxTurns
            });

      turnJournalId = input.runId
        ? await input.runJournal.recordTurnStarted(input.runId, {
            promptText: prompt,
            status: "running"
          })
        : null;

      const turnResult = await session.client.runTurn(session, {
        prompt,
        title: `${currentIssue.identifier}: ${currentIssue.title}`,
        sandboxPolicy: input.workflowConfig.codex.turnSandboxPolicy,
        toolExecutor: input.toolExecutor,
        turnTimeoutMs: input.workflowConfig.codex.turnTimeoutMs,
        onMessage: async (message) => {
          const eventName =
            typeof message.event === "string" ? message.event : "notification";
          const timestamp = new Date().toISOString();
          const turnTokens = extractTurnTokens(message);

          await input.callbacks.onUpdate(currentIssue.id, {
            event: eventName,
            payload: message,
            timestamp,
            sessionId:
              getString(message, "session_id") ??
              getString(message, "sessionId") ??
              null,
            codexAppServerPid:
              getString(message, "codex_app_server_pid") ?? session.processId
          });

          if (input.runId && turnJournalId) {
            if (turnTokens) {
              await input.runJournal.updateTurn(turnJournalId, {
                tokens: turnTokens
              });
            }

            await input.runJournal.recordEvent(input.runId, turnJournalId, {
              eventType: eventName,
              recordedAt: timestamp,
              payload: normalizeJsonValue(message),
              summary:
                eventName === "session_started"
                  ? "session started"
                  : eventName === "turn_completed"
                    ? "turn completed"
                    : eventName === "approval_auto_approved"
                      ? "approval request auto-approved"
                    : null,
              codexThreadId:
                getString(message, "thread_id") ??
                getStringPath(message, ["params", "threadId"]),
              codexTurnId:
                getString(message, "turn_id") ??
                getStringPath(message, ["params", "turnId"]),
              codexSessionId:
                getString(message, "session_id") ??
                getString(message, "sessionId")
            });
          }
        }
      });

      if (input.runId && turnJournalId) {
        await input.runJournal.finalizeTurn(turnJournalId, {
          status: "completed",
          endedAt: new Date().toISOString(),
          codexThreadId: turnResult.threadId,
          codexTurnId: turnResult.turnId,
          codexSessionId: turnResult.sessionId
        });
        turnJournalId = null;
      }

      const refreshedIssue = await refreshIssueState(
        input.tracker,
        input.workflowConfig,
        currentIssue
      );

      if (!refreshedIssue || !isActiveIssueState(input.workflowConfig, refreshedIssue.state)) {
        break;
      }

      if (turnNumber >= input.workflowConfig.agent.maxTurns) {
        maxTurnsReached = true;
        break;
      }

      currentIssue = refreshedIssue;
    }

    if (!input.activeRun.stopped) {
      if (input.runId) {
        const repoEnd = await captureRepoSnapshot(
          input.launchTarget,
          input.workflowConfig.hooks.timeoutMs
        );
        await input.runJournal.updateRun(input.runId, {
          commitHashEnd: repoEnd.commitHash,
          repoEnd: repoEnd.snapshot
        });
      }

      if (maxTurnsReached) {
        await input.callbacks.onComplete(input.issue.id, {
          kind: "max_turns_reached",
          reason: `Reached the configured ${input.workflowConfig.agent.maxTurns}-turn limit while the issue remained active.`,
          maxTurns: input.workflowConfig.agent.maxTurns
        });
      } else {
        await input.callbacks.onComplete(input.issue.id, {
          kind: "normal"
        });
      }
    }
  } catch (error) {
    if (input.activeRun.stopped) {
      return;
    }

    const reason = error instanceof Error ? error.message : String(error);

    if (input.runId && turnJournalId) {
      await input.runJournal.finalizeTurn(turnJournalId, {
        status: "failed",
        endedAt: new Date().toISOString(),
        metadata: {
          reason
        }
      });
    }

    if (input.runId) {
      const repoEnd = await captureRepoSnapshot(
        input.launchTarget,
        input.workflowConfig.hooks.timeoutMs
      );
      await input.runJournal.updateRun(input.runId, {
        commitHashEnd: repoEnd.commitHash,
        repoEnd: repoEnd.snapshot
      });
    }

    const startupFailure = classifyStartupFailure(error);
    await input.runtimeLogs.record({
      level: "error",
      source: "codex_runtime",
      eventType: startupFailure
        ? "runtime_startup_failed"
        : "runtime_execution_failed",
      message: startupFailure
        ? "Codex runtime startup failed."
        : "Codex runtime execution failed.",
      issueId: input.issue.id,
      issueIdentifier: input.issue.identifier,
      runId: input.runId,
      payload: {
        reason,
        failureStage: startupFailure?.failureStage ?? null,
        failureOrigin: startupFailure?.failureOrigin ?? null,
        launchTarget: describeLaunchTarget(input.launchTarget)
      }
    });

    await input.callbacks.onComplete(input.issue.id, {
      ...(startupFailure
        ? {
            kind: "startup_failure" as const,
            reason,
            failureStage: startupFailure.failureStage,
            failureOrigin: startupFailure.failureOrigin,
            launchTarget: input.launchTarget
          }
        : isRateLimitedError(error)
          ? {
              kind: "rate_limited" as const,
              reason
            }
          : {
              kind: "failure" as const,
              reason
            })
    });
  } finally {
    input.activeRun.client?.close();
  }
}

function describeLaunchTarget(target: CodexRuntimeLaunchTarget): SymphonyJsonObject {
  if (target.kind === "host_path") {
    return {
      kind: target.kind,
      hostLaunchPath: target.hostLaunchPath,
      hostWorkspacePath: target.hostWorkspacePath,
      runtimeWorkspacePath: target.runtimeWorkspacePath
    };
  }

  return {
    kind: target.kind,
    hostLaunchPath: target.hostLaunchPath,
    hostWorkspacePath: target.hostWorkspacePath,
    runtimeWorkspacePath: target.runtimeWorkspacePath,
    containerId: target.containerId,
    containerName: target.containerName,
    shell: target.shell
  };
}

async function refreshIssueState(
  tracker: SymphonyTracker,
  workflowConfig: SymphonyResolvedWorkflowConfig,
  issue: SymphonyTrackerIssue
): Promise<SymphonyTrackerIssue | null> {
  const refreshed = await tracker.fetchIssueStatesByIds(workflowConfig.tracker, [
    issue.id
  ]);

  return refreshed[0] ?? null;
}

function isActiveIssueState(
  workflowConfig: SymphonyResolvedWorkflowConfig,
  state: string
): boolean {
  const normalizedState = state.trim().toLowerCase();

  return workflowConfig.tracker.dispatchableStates.some(
    (activeState) => activeState.trim().toLowerCase() === normalizedState
  );
}

function classifyStartupFailure(error: unknown): {
  failureStage: SymphonyStartupFailureStage;
  failureOrigin: SymphonyStartupFailureOrigin;
} | null {
  if (error instanceof CodexAppServerError) {
    if (
      [
        "initialize_failed",
        "thread_start_failed",
        "invalid_workspace_cwd",
        "invalid_thread_payload",
        "invalid_turn_payload",
        "invalid_codex_command",
        "invalid_issue_label_override"
      ].includes(error.code)
    ) {
      return {
        failureStage: "runtime_session_start",
        failureOrigin: "codex_startup"
      };
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("thread/start") || message.includes("initialize")) {
    return {
      failureStage: "runtime_session_start",
      failureOrigin: "codex_startup"
    };
  }

  return null;
}

function isRateLimitedError(error: unknown): boolean {
  const messages = [
    error instanceof Error ? error.message : String(error)
  ];

  if (error instanceof CodexAppServerError && error.detail) {
    messages.push(JSON.stringify(error.detail));
  }

  return messages.some((message) => {
    const normalized = message.toLowerCase();

    return (
      normalized.includes("rate limit") ||
      normalized.includes("rate_limit") ||
      normalized.includes("ratelimit") ||
      normalized.includes("too many requests") ||
      normalized.includes("rate_limit_exceeded")
    );
  });
}

function getRecord(
  value: Record<string, unknown> | null | undefined,
  key: string
): Record<string, unknown> | null {
  const nested = value?.[key];
  return nested !== null && typeof nested === "object" && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : null;
}

function getString(
  value: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const nested = value?.[key];
  return typeof nested === "string" && nested.trim() !== "" ? nested : null;
}

function getStringPath(
  value: Record<string, unknown> | null | undefined,
  path: string[]
): string | null {
  let current: unknown = value;

  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === "string" && current.trim() !== "" ? current : null;
}

function extractTurnTokens(
  value: Record<string, unknown> | null | undefined
): SymphonyJsonObject | null {
  if (!value) {
    return null;
  }

  const usage = getRecord(value, "usage");
  if (usage) {
    return normalizeJsonValue(usage) as SymphonyJsonObject;
  }

  const tokenUsage = getRecord(getRecord(value, "params"), "tokenUsage");
  if (tokenUsage) {
    return normalizeJsonValue(tokenUsage) as SymphonyJsonObject;
  }

  return null;
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
