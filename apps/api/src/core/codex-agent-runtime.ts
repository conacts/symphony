import { execFileSync } from "node:child_process";
import path from "node:path";
import type {
  AgentRuntime,
  SymphonyAgentRuntimeCompletion,
  SymphonyAgentRuntimeConfig,
  SymphonyAgentRuntimeUpdate,
  SymphonyStartupFailureOrigin,
  SymphonyStartupFailureStage
} from "@symphony/orchestrator";
import {
  renderSymphonyPromptContract,
  type SymphonyLoadedPromptContract
} from "@symphony/runtime-contract";
import type {
  SymphonyCodexAnalyticsEvent,
  SymphonyCodexThreadItem,
  SymphonyCodexUsage,
  SymphonyJsonObject,
  SymphonyJsonValue,
  SymphonyRunJournal
} from "@symphony/run-journal";
import type {
  SymphonyTracker,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import type { SymphonyRuntimeLogStore } from "@symphony/db";
import type { SymphonyLogger } from "@symphony/logger";
import {
  CodexSdkClient
} from "./codex-sdk-client.js";
import {
  CodexAppServerError,
  type CodexAppServerSessionClient
} from "./codex-app-server-types.js";
import { captureRepoSnapshot } from "./codex-repo-snapshot.js";
import {
  resolveCodexRuntimeLaunchTarget,
  type CodexRuntimeLaunchTarget
} from "./codex-runtime-launch-target.js";
import {
  buildSymphonyContinuationPrompt
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
  promptContract: SymphonyLoadedPromptContract;
  githubRepository?: string | null;
  tracker: SymphonyTracker;
  runJournal: SymphonyRunJournal;
  runtimeLogs: SymphonyRuntimeLogStore;
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
        runInput.runtimePolicy.workspace.root
      );

      void executeRun({
        promptTemplate: input.promptContract.template,
        promptContract: input.promptContract,
        githubRepository: input.githubRepository ?? null,
        tracker: input.tracker,
        runJournal: input.runJournal,
        runtimeLogs: input.runtimeLogs,
        runtimePolicy: runInput.runtimePolicy,
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
  promptContract: SymphonyLoadedPromptContract;
  githubRepository: string | null;
  tracker: SymphonyTracker;
  runJournal: SymphonyRunJournal;
  runtimeLogs: SymphonyRuntimeLogStore;
  runtimePolicy: SymphonyAgentRuntimeConfig;
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
        input.runtimePolicy.hooks.timeoutMs
      );
      await input.runJournal.updateRun(input.runId, {
        commitHashStart: repoStart.commitHash,
        repoStart: repoStart.snapshot
      });
    }

    const session = await CodexSdkClient.startSession({
      launchTarget: input.launchTarget,
      env: {
        ...input.workspace.envBundle.values,
        ...input.codexHostLaunchEnv
      },
      hostCommandEnvSource: input.hostCommandEnvSource,
      runtimePolicy: input.runtimePolicy,
      issue: input.issue,
      logger: input.logger
    });
    input.activeRun.client = session.client;

    await input.runtimeLogs.record({
      level: "info",
      source: "codex_runtime",
      eventType: "runtime_session_started",
      message: "Started the Codex SDK session.",
      issueId: input.issue.id,
      issueIdentifier: input.issue.identifier,
      runId: input.runId,
      payload: {
        threadId: session.threadId,
        processId: session.processId,
        model: session.model,
        reasoningEffort: session.reasoningEffort,
        profile: session.profile,
        providerId: session.providerId,
        providerName: session.providerName,
        launchTarget: describeLaunchTarget(session.launchTarget)
      }
    });

    let currentIssue = input.issue;
    const promptRepoName = resolvePromptRepoName(
      input.githubRepository,
      input.promptContract.repoRoot
    );
    const promptRepoDefaultBranch = resolvePromptRepoDefaultBranch(
      input.promptContract.repoRoot
    );

    for (
      let turnNumber = 1;
      turnNumber <= input.runtimePolicy.agent.maxTurns;
      turnNumber += 1
    ) {
      if (input.activeRun.stopped) {
        await finalizeStoppedTurn(input.runJournal, input.runId, turnJournalId);
        return;
      }

      const prompt =
        turnNumber === 1
          ? renderSymphonyPromptContract({
              template: input.promptTemplate,
              promptPath: input.promptContract.promptPath,
              payload: {
                issue: {
                  id: currentIssue.id,
                  identifier: currentIssue.identifier,
                  title: currentIssue.title,
                  description: currentIssue.description,
                  state: currentIssue.state,
                  labels: currentIssue.labels,
                  url: currentIssue.url,
                  branch_name: currentIssue.branchName
                },
                repo: {
                  name: promptRepoName,
                  default_branch: promptRepoDefaultBranch
                },
                run: {
                  id: input.runId ?? `attempt-${input.attempt}`
                },
                workspace: {
                  path: input.workspace.executionTarget.workspacePath,
                  branch: currentIssue.branchName
                },
                attempt: input.attempt
              }
            })
          : buildSymphonyContinuationPrompt({
              turnNumber,
              maxTurns: input.runtimePolicy.agent.maxTurns
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
        sandboxPolicy: input.runtimePolicy.codex.turnSandboxPolicy,
        toolExecutor: async () => ({
          success: false,
          output: "Dynamic tool execution is not enabled for the SDK transport.",
          contentItems: []
        }),
        turnTimeoutMs: input.runtimePolicy.codex.turnTimeoutMs,
        onMessage: async (message) => {
          const analyticsEvent = normalizeCodexAnalyticsEvent(message);
          const eventName = analyticsEvent?.type ?? "notification";
          const timestamp = new Date().toISOString();
          const turnUsage = extractTurnUsage(analyticsEvent, message);

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
            if (turnUsage) {
              await input.runJournal.updateTurn(turnJournalId, {
                usage: turnUsage
              });
            }

            if (analyticsEvent) {
              await input.runJournal.recordEvent(input.runId, turnJournalId, {
                eventType: analyticsEvent.type,
                recordedAt: timestamp,
                payload: analyticsEvent,
                summary: summarizeAnalyticsEvent(analyticsEvent),
                codexThreadId:
                  getString(message, "thread_id") ??
                  getString(message, "threadId") ??
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
        input.runtimePolicy,
        currentIssue
      );

      if (!refreshedIssue || !isActiveIssueState(input.runtimePolicy, refreshedIssue.state)) {
        break;
      }

      if (turnNumber >= input.runtimePolicy.agent.maxTurns) {
        maxTurnsReached = true;
        break;
      }

      currentIssue = refreshedIssue;
    }

    if (!input.activeRun.stopped) {
      if (input.runId) {
        const repoEnd = await captureRepoSnapshot(
          input.launchTarget,
          input.runtimePolicy.hooks.timeoutMs
        );
        await input.runJournal.updateRun(input.runId, {
          commitHashEnd: repoEnd.commitHash,
          repoEnd: repoEnd.snapshot
        });
      }

      if (maxTurnsReached) {
        await input.callbacks.onComplete(input.issue.id, {
          kind: "max_turns_reached",
          reason: `Reached the configured ${input.runtimePolicy.agent.maxTurns}-turn limit while the issue remained active.`,
          maxTurns: input.runtimePolicy.agent.maxTurns
        });
      } else {
        await input.callbacks.onComplete(input.issue.id, {
          kind: "normal"
        });
      }
    }
  } catch (error) {
    if (input.activeRun.stopped) {
      await finalizeStoppedTurn(input.runJournal, input.runId, turnJournalId);
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
        input.runtimePolicy.hooks.timeoutMs
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

function resolvePromptRepoName(
  configuredGitHubRepo: string | null,
  repoRoot: string
): string {
  const configuredName = configuredGitHubRepo?.split("/").pop()?.trim();

  if (configuredName) {
    return configuredName;
  }

  const basename = path.basename(repoRoot).trim();
  return basename === "" ? "repository" : basename;
}

function resolvePromptRepoDefaultBranch(repoRoot: string): string {
  try {
    const ref = execFileSync(
      "git",
      ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      }
    ).trim();
    const branch = ref.replace(/^origin\//, "").trim();

    if (branch !== "") {
      return branch;
    }
  } catch {
    // Ignore missing/non-git repos and fall back to the conventional default.
  }

  return "main";
}

function describeLaunchTarget(target: CodexRuntimeLaunchTarget): SymphonyJsonObject {
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
  runtimePolicy: SymphonyAgentRuntimeConfig,
  issue: SymphonyTrackerIssue
): Promise<SymphonyTrackerIssue | null> {
  const refreshed = await tracker.fetchIssueStatesByIds(runtimePolicy.tracker, [
    issue.id
  ]);

  return refreshed[0] ?? null;
}

function isActiveIssueState(
  runtimePolicy: SymphonyAgentRuntimeConfig,
  state: string
): boolean {
  const normalizedState = state.trim().toLowerCase();

  return runtimePolicy.tracker.dispatchableStates.some(
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

async function finalizeStoppedTurn(
  runJournal: SymphonyRunJournal,
  runId: string | null,
  turnJournalId: string | null
): Promise<void> {
  if (!runId || !turnJournalId) {
    return;
  }

  await runJournal.finalizeTurn(turnJournalId, {
    status: "stopped",
    endedAt: new Date().toISOString(),
    metadata: {
      stopReason: "runtime_stopped"
    }
  });
}

function summarizeAnalyticsEvent(
  event: SymphonyCodexAnalyticsEvent
): string | null {
  switch (event.type) {
    case "session.started":
      return "session started";
    case "thread.started":
      return "thread started";
    case "turn.started":
      return "turn started";
    case "turn.completed":
      return "turn completed";
    case "turn.failed":
      return event.error.message;
    case "error":
      return event.message;
    case "item.started":
    case "item.updated":
    case "item.completed":
      return null;
  }

  return null;
}

function extractTurnUsage(
  event: SymphonyCodexAnalyticsEvent | null,
  fallback: Record<string, unknown> | null | undefined
): SymphonyCodexUsage | null {
  if (event?.type === "turn.completed") {
    return event.usage;
  }

  if (!fallback) {
    return null;
  }

  const usage = getRecord(fallback, "usage");
  if (!usage) {
    return null;
  }

  return normalizeCodexUsage(usage);
}

function normalizeCodexAnalyticsEvent(
  value: Record<string, unknown> | null | undefined
): SymphonyCodexAnalyticsEvent | null {
  if (!value) {
    return null;
  }

  if (value.event === "session_started") {
    return {
      type: "session.started",
      session_id: getString(value, "session_id") ?? "unknown-session",
      thread_id: getString(value, "thread_id"),
      turn_id: getString(value, "turn_id") ?? "unknown-turn",
      codex_app_server_pid: getString(value, "codex_app_server_pid"),
      model: getString(value, "model"),
      reasoning_effort: getString(value, "reasoning_effort")
    };
  }

  const type = getString(value, "type");
  switch (type) {
    case "thread.started":
      return {
        type,
        thread_id: getString(value, "thread_id") ?? "unknown-thread"
      };
    case "turn.started":
      return { type };
    case "turn.completed": {
      const usage = normalizeCodexUsage(getRecord(value, "usage"));
      if (!usage) {
        return null;
      }

      return {
        type,
        usage
      };
    }
    case "turn.failed":
      return {
        type,
        error: {
          message: getString(getRecord(value, "error"), "message") ?? "Turn failed"
        }
      };
    case "item.started":
    case "item.updated":
    case "item.completed": {
      const item = normalizeCodexItem(getRecord(value, "item"));
      if (!item) {
        return null;
      }

      return {
        type,
        item
      };
    }
    case "error":
      return {
        type,
        message: getString(value, "message") ?? "Codex stream error"
      };
    default:
      return null;
  }
}

function normalizeCodexUsage(
  value: Record<string, unknown> | null
): SymphonyCodexUsage | null {
  if (!value) {
    return null;
  }

  return {
    input_tokens: getFiniteNumber(value.input_tokens),
    cached_input_tokens: getFiniteNumber(value.cached_input_tokens),
    output_tokens: getFiniteNumber(value.output_tokens)
  };
}

function normalizeCodexItem(
  value: Record<string, unknown> | null
): SymphonyCodexThreadItem | null {
  const type = getString(value, "type");
  const id = getString(value, "id");

  if (!value || !type || !id) {
    return null;
  }

  switch (type) {
    case "agent_message":
      return {
        id,
        type,
        text: getString(value, "text") ?? ""
      };
    case "reasoning":
      return {
        id,
        type,
        text: getString(value, "text") ?? ""
      };
    case "command_execution":
      return {
        id,
        type,
        command: getString(value, "command") ?? "",
        aggregated_output: getString(value, "aggregated_output") ?? "",
        exit_code:
          typeof value.exit_code === "number" ? Math.floor(value.exit_code) : undefined,
        status: normalizeCommandExecutionStatus(getString(value, "status"))
      };
    case "file_change":
      return {
        id,
        type,
        changes: normalizeFileChanges(value.changes),
        status: normalizePatchApplyStatus(getString(value, "status"))
      };
    case "mcp_tool_call":
      return {
        id,
        type,
        server: getString(value, "server") ?? "unknown",
        tool: getString(value, "tool") ?? "unknown",
        arguments: normalizeJsonValue(value.arguments),
        result: normalizeMcpResult(getRecord(value, "result")) ?? undefined,
        error: normalizeMcpError(getRecord(value, "error")) ?? undefined,
        status: normalizeMcpToolCallStatus(getString(value, "status"))
      };
    case "web_search":
      return {
        id,
        type,
        query: getString(value, "query") ?? ""
      };
    case "todo_list":
      return {
        id,
        type,
        items: normalizeTodoItems(value.items)
      };
    case "error":
      return {
        id,
        type,
        message: getString(value, "message") ?? ""
      };
    default:
      return null;
  }
}

function normalizeFileChanges(value: unknown): Array<{ path: string; kind: "add" | "delete" | "update" }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const record = entry !== null && typeof entry === "object" && !Array.isArray(entry)
      ? (entry as Record<string, unknown>)
      : null;
    const path = getString(record, "path");
    const kind = getString(record, "kind");
    if (!path || (kind !== "add" && kind !== "delete" && kind !== "update")) {
      return [];
    }

    return [{ path, kind }];
  });
}

function normalizeTodoItems(value: unknown): Array<{ text: string; completed: boolean }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const record = entry !== null && typeof entry === "object" && !Array.isArray(entry)
      ? (entry as Record<string, unknown>)
      : null;
    const text = getString(record, "text");
    if (!text) {
      return [];
    }

    return [{
      text,
      completed: record?.completed === true
    }];
  });
}

function normalizeMcpResult(
  value: Record<string, unknown> | null
): { content: SymphonyJsonValue[]; structured_content: SymphonyJsonValue } | null {
  if (!value) {
    return null;
  }

  return {
    content: Array.isArray(value.content)
      ? value.content.map((entry) => normalizeJsonValue(entry))
      : [],
    structured_content: normalizeJsonValue(value.structured_content)
  };
}

function normalizeMcpError(
  value: Record<string, unknown> | null
): { message: string } | null {
  const message = getString(value, "message");
  return message ? { message } : null;
}

function normalizeCommandExecutionStatus(
  value: string | null
): "in_progress" | "completed" | "failed" {
  if (value === "completed" || value === "failed" || value === "in_progress") {
    return value;
  }

  return "in_progress";
}

function normalizePatchApplyStatus(
  value: string | null
): "completed" | "failed" {
  return value === "failed" ? "failed" : "completed";
}

function normalizeMcpToolCallStatus(
  value: string | null
): "in_progress" | "completed" | "failed" {
  if (value === "completed" || value === "failed" || value === "in_progress") {
    return value;
  }

  return "in_progress";
}

function getFiniteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 0;
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
