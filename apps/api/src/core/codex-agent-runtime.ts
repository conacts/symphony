import { execFile } from "node:child_process";
import type {
  SymphonyAgentRuntime,
  SymphonyAgentRuntimeCompletion,
  SymphonyJsonObject,
  SymphonyAgentRuntimeUpdate,
  SymphonyJsonValue,
  SymphonyResolvedWorkflowConfig,
  SymphonyRunJournal,
  SymphonyTracker,
  SymphonyTrackerIssue
} from "@symphony/core";
import type { SymphonyRuntimeLogStore } from "@symphony/db";
import type { SymphonyLogger } from "@symphony/logger";
import {
  CodexAppServerClient,
  CodexAppServerError,
  type CodexAppServerToolExecutor
} from "./codex-app-server-client.js";
import {
  buildSymphonyContinuationPrompt,
  renderSymphonyPrompt
} from "./symphony-prompt.js";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const defaultPatchMaxBytes = 64 * 1024;

type RunCallbacks = {
  onUpdate(issueId: string, update: SymphonyAgentRuntimeUpdate): void | Promise<void>;
  onComplete(
    issueId: string,
    completion: SymphonyAgentRuntimeCompletion
  ): void | Promise<void>;
};

type ActiveRun = {
  stopped: boolean;
  client: CodexAppServerClient | null;
};

export function createLocalCodexSymphonyAgentRuntime(input: {
  promptTemplate: string;
  tracker: SymphonyTracker;
  runJournal: SymphonyRunJournal;
  runtimeLogs: SymphonyRuntimeLogStore;
  workflowConfig: SymphonyResolvedWorkflowConfig;
  logger: SymphonyLogger;
  callbacks: RunCallbacks;
}): SymphonyAgentRuntime {
  const activeRuns = new Map<string, ActiveRun>();

  return {
    async startRun(runInput) {
      const activeRun: ActiveRun = {
        stopped: false,
        client: null
      };
      activeRuns.set(runInput.issue.id, activeRun);

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
        callbacks: input.callbacks,
        issue: runInput.issue,
        runId: runInput.runId,
        attempt: runInput.attempt,
        workspacePath: runInput.workspace.path,
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
        workerHost: null,
        workspacePath: runInput.workspace.path
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

async function executeRun(input: {
  promptTemplate: string;
  tracker: SymphonyTracker;
  runJournal: SymphonyRunJournal;
  runtimeLogs: SymphonyRuntimeLogStore;
  workflowConfig: SymphonyResolvedWorkflowConfig;
  logger: SymphonyLogger;
  callbacks: RunCallbacks;
  issue: SymphonyTrackerIssue;
  runId: string | null;
  attempt: number;
  workspacePath: string;
  activeRun: ActiveRun;
  toolExecutor: CodexAppServerToolExecutor;
}): Promise<void> {
  let turnJournalId: string | null = null;
  let maxTurnsReached = false;

  try {
    if (input.runId) {
      const repoStart = await captureRepoSnapshot(
        input.workspacePath,
        input.workflowConfig.hooks.timeoutMs
      );
      await input.runJournal.updateRun(input.runId, {
        commitHashStart: repoStart.commitHash,
        repoStart: repoStart.snapshot
      });
    }

    const session = await CodexAppServerClient.startSession({
      workspacePath: input.workspacePath,
      workflowConfig: input.workflowConfig,
      issue: input.issue,
      logger: input.logger
    });
    input.activeRun.client = session.client;

    await input.runtimeLogs.record({
      level: "info",
      source: "codex_runtime",
      eventType: "session_initialized",
      message: "Started Codex app-server session.",
      issueId: input.issue.id,
      issueIdentifier: input.issue.identifier,
      runId: input.runId,
      payload: {
        threadId: session.threadId,
        processId: session.processId,
        model: session.model,
        reasoningEffort: session.reasoningEffort
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
          input.workspacePath,
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
        input.workspacePath,
        input.workflowConfig.hooks.timeoutMs
      );
      await input.runJournal.updateRun(input.runId, {
        commitHashEnd: repoEnd.commitHash,
        repoEnd: repoEnd.snapshot
      });
    }

    await input.runtimeLogs.record({
      level: "error",
      source: "codex_runtime",
      eventType: "run_failed",
      message: "Codex runtime execution failed.",
      issueId: input.issue.id,
      issueIdentifier: input.issue.identifier,
      runId: input.runId,
      payload: {
        reason
      }
    });

    await input.callbacks.onComplete(input.issue.id, {
      kind: isStartupFailure(error)
        ? "startup_failure"
        : isRateLimitedError(error)
          ? "rate_limited"
          : "failure",
      reason
    });
  } finally {
    input.activeRun.client?.close();
  }
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

function buildLinearGraphqlToolExecutor(
  workflowConfig: SymphonyResolvedWorkflowConfig,
  logger: SymphonyLogger
): CodexAppServerToolExecutor {
  return async (toolName, argumentsPayload) => {
    if (toolName !== "linear_graphql") {
      return {
        success: false,
        output: JSON.stringify(
          {
            error: {
              message: `Unsupported dynamic tool: ${JSON.stringify(toolName)}.`,
              supportedTools: ["linear_graphql"]
            }
          },
          null,
          2
        ),
        contentItems: [
          {
            type: "inputText",
            text: JSON.stringify(
              {
                error: {
                  message: `Unsupported dynamic tool: ${JSON.stringify(toolName)}.`,
                  supportedTools: ["linear_graphql"]
                }
              },
              null,
              2
            )
          }
        ]
      };
    }

    const normalizedArguments = normalizeLinearGraphqlArguments(argumentsPayload);
    if (!normalizedArguments.ok) {
      return {
        success: false,
        output: JSON.stringify(
          {
            error: {
              message: normalizedArguments.message
            }
          },
          null,
          2
        ),
        contentItems: [
          {
            type: "inputText",
            text: JSON.stringify(
              {
                error: {
                  message: normalizedArguments.message
                }
              },
              null,
              2
            )
          }
        ]
      };
    }

    if (!workflowConfig.tracker.apiKey) {
      return {
        success: false,
        output: JSON.stringify(
          {
            error: {
              message:
                "Symphony is missing Linear auth. Set `linear.api_key` in `WORKFLOW.md` or export `LINEAR_API_KEY`."
            }
          },
          null,
          2
        ),
        contentItems: [
          {
            type: "inputText",
            text: JSON.stringify(
              {
                error: {
                  message:
                    "Symphony is missing Linear auth. Set `linear.api_key` in `WORKFLOW.md` or export `LINEAR_API_KEY`."
                }
              },
              null,
              2
            )
          }
        ]
      };
    }

    try {
      const response = await fetch(workflowConfig.tracker.endpoint, {
        method: "POST",
        headers: {
          Authorization: workflowConfig.tracker.apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: normalizedArguments.query,
          variables: normalizedArguments.variables
        })
      });
      const body = (await response.json()) as Record<string, unknown>;
      const output = JSON.stringify(body, null, 2);
      const responseErrors = Array.isArray(body.errors) ? body.errors : null;

      return {
        success: response.ok && (!responseErrors || responseErrors.length === 0),
        output,
        contentItems: [
          {
            type: "inputText",
            text: output
          }
        ]
      };
    } catch (error) {
      logger.error("linear_graphql tool execution failed", {
        error
      });

      const output = JSON.stringify(
        {
          error: {
            message:
              "Linear GraphQL request failed before receiving a successful response.",
            reason: error instanceof Error ? error.message : String(error)
          }
        },
        null,
        2
      );
      return {
        success: false,
        output,
        contentItems: [
          {
            type: "inputText",
            text: output
          }
        ]
      };
    }
  };
}

type RepoSnapshot = {
  commitHash: string | null;
  snapshot: SymphonyJsonObject;
};

async function captureRepoSnapshot(
  workspacePath: string,
  timeoutMs: number
): Promise<RepoSnapshot> {
  const capturedAt = new Date().toISOString();

  try {
    const head = await gitCapture(workspacePath, ["rev-parse", "HEAD"], timeoutMs);
    const statusShort = await gitCapture(
      workspacePath,
      ["status", "--short"],
      timeoutMs
    );
    const diffstat = await gitCapture(
      workspacePath,
      ["diff", "--stat", "--no-ext-diff", "HEAD"],
      timeoutMs
    );
    const patchOutput = await gitCapture(
      workspacePath,
      ["diff", "--no-ext-diff", "HEAD"],
      timeoutMs
    );
    const patch = truncateText(patchOutput, defaultPatchMaxBytes);

    return {
      commitHash: blankToNull(head),
      snapshot: {
        captured_at: capturedAt,
        available: true,
        worker_host: null,
        commit_hash: blankToNull(head),
        dirty: statusShort.trim() !== "",
        status_short: blankToNull(statusShort),
        diffstat: blankToNull(diffstat),
        patch: patch.content,
        patch_truncated: patch.truncated
      }
    };
  } catch (error) {
    return {
      commitHash: null,
      snapshot: {
        captured_at: capturedAt,
        available: false,
        worker_host: null,
        error: formatRepoSnapshotError(error)
      }
    };
  }
}

async function gitCapture(
  workspacePath: string,
  args: string[],
  timeoutMs: number
): Promise<string> {
  const { stdout, stderr } = await execFileAsync("git", args, {
    cwd: workspacePath,
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024
  });

  const output = `${stdout ?? ""}${stderr ?? ""}`.trimEnd();
  return output;
}

function truncateText(
  content: string,
  maxBytes: number
): {
  content: string | null;
  truncated: boolean;
} {
  const buffer = Buffer.from(content, "utf8");

  if (buffer.byteLength <= maxBytes) {
    return {
      content: blankToNull(content),
      truncated: false
    };
  }

  return {
    content: blankToNull(buffer.subarray(0, maxBytes).toString("utf8")),
    truncated: true
  };
}

function blankToNull(value: string): string | null {
  return value.trim() === "" ? null : value;
}

function formatRepoSnapshotError(error: unknown): string {
  if (error instanceof Error) {
    return `git exception: ${error.message}`;
  }

  return String(error);
}

function isStartupFailure(error: unknown): boolean {
  if (error instanceof CodexAppServerError) {
    return [
      "initialize_failed",
      "thread_start_failed",
      "invalid_workspace_cwd",
      "invalid_thread_payload",
      "invalid_turn_payload",
      "invalid_codex_command",
      "invalid_issue_label_override"
    ].includes(error.code);
  }

  const message = error instanceof Error ? error.message : String(error);
  return message.includes("thread/start") || message.includes("initialize");
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

function normalizeLinearGraphqlArguments(
  argumentsPayload: unknown
):
  | {
      ok: true;
      query: string;
      variables: Record<string, unknown>;
    }
  | {
      ok: false;
      message: string;
    } {
  if (typeof argumentsPayload === "string") {
    const query = argumentsPayload.trim();

    return query === ""
      ? {
          ok: false,
          message: "`linear_graphql` requires a non-empty `query` string."
        }
      : {
          ok: true,
          query,
          variables: {}
        };
  }

  if (!argumentsPayload || typeof argumentsPayload !== "object" || Array.isArray(argumentsPayload)) {
    return {
      ok: false,
      message:
        "`linear_graphql` expects either a GraphQL query string or an object with `query` and optional `variables`."
    };
  }

  const record = argumentsPayload as Record<string, unknown>;
  const query = getString(record, "query");
  if (!query) {
    return {
      ok: false,
      message: "`linear_graphql` requires a non-empty `query` string."
    };
  }

  const rawVariables = record.variables;
  if (
    rawVariables !== undefined &&
    rawVariables !== null &&
    (typeof rawVariables !== "object" || Array.isArray(rawVariables))
  ) {
    return {
      ok: false,
      message: "`linear_graphql.variables` must be a JSON object when provided."
    };
  }

  return {
    ok: true,
    query,
    variables:
      rawVariables && typeof rawVariables === "object"
        ? (rawVariables as Record<string, unknown>)
        : {}
  };
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
