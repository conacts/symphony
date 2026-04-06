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
import type { JsonObject } from "@symphony/contracts";
import {
  extractUsage,
  isThreadEvent
} from "@symphony/contracts";
import type {
  SymphonyTracker,
  SymphonyTrackerIssue
} from "@symphony/tracker";
import type {
  AgentAnalyticsStore,
  SymphonyIssueDeliveryReportStore,
  SymphonyRuntimeLogStore,
  SymphonyRuntimeRunStore
} from "@symphony/db";
import type { SymphonyLogger } from "@symphony/logger";
import {
  decodePiRuntimeEvent,
  extractPiRuntimeUsage,
  HarnessSessionError,
  resolveHarnessModelRuntimePolicy,
  type HarnessSessionClient
} from "@symphony/agent-harnesses";
import { captureRepoSnapshot } from "./agent-repo-snapshot.js";
import {
  resolveRuntimeLaunchTarget,
  type SymphonyRuntimeLaunchTarget
} from "./agent-runtime-launch-target.js";
import {
  buildSymphonyContinuationPrompt
} from "./symphony-prompt.js";
import {
  createPiRuntimeHarness,
  type SymphonyRuntimeHarness
} from "./runtime-harness.js";
import {
  buildRuntimeDynamicToolExecutor,
  type RuntimeDeliveryReportResult
} from "./runtime-dynamic-tools.js";

type RunCallbacks = {
  onUpdate(issueId: string, update: SymphonyAgentRuntimeUpdate): void | Promise<void>;
  onComplete(
    issueId: string,
    completion: SymphonyAgentRuntimeCompletion
  ): void | Promise<void>;
};

type ActiveRun = {
  stopped: boolean;
  client: HarnessSessionClient | null;
};

export function createSymphonyAgentRuntime(input: {
  promptContract: SymphonyLoadedPromptContract;
  githubRepository?: string | null;
  tracker: SymphonyTracker;
  runStore: SymphonyRuntimeRunStore;
  deliveryReports: SymphonyIssueDeliveryReportStore;
  agentAnalytics: AgentAnalyticsStore;
  runtimeLogs: SymphonyRuntimeLogStore;
  hostCommandEnvSource: Record<string, string | undefined>;
  harnessLaunchEnv?: Record<string, string>;
  harnessAuthMode?: string | null;
  harnessProviderEnvKey?: string | null;
  logger: SymphonyLogger;
  callbacks: RunCallbacks;
}): AgentRuntime {
  return createHarnessBackedSymphonyAgentRuntime({
    ...input,
    harness: createPiRuntimeHarness()
  });
}

export function createHarnessBackedSymphonyAgentRuntime(input: {
  harness: SymphonyRuntimeHarness;
  promptContract: SymphonyLoadedPromptContract;
  githubRepository?: string | null;
  tracker: SymphonyTracker;
  runStore: SymphonyRuntimeRunStore;
  deliveryReports: SymphonyIssueDeliveryReportStore;
  agentAnalytics: AgentAnalyticsStore;
  runtimeLogs: SymphonyRuntimeLogStore;
  hostCommandEnvSource: Record<string, string | undefined>;
  harnessLaunchEnv?: Record<string, string>;
  harnessAuthMode?: string | null;
  harnessProviderEnvKey?: string | null;
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
      const launchTarget = resolveRuntimeLaunchTarget(
        runInput.workspace,
        runInput.runtimePolicy.workspace.root
      );

      void executeRun({
        promptTemplate: input.promptContract.template,
        harness: input.harness,
        promptContract: input.promptContract,
        githubRepository: input.githubRepository ?? null,
        tracker: input.tracker,
        runStore: input.runStore,
        deliveryReports: input.deliveryReports,
        agentAnalytics: input.agentAnalytics,
        runtimeLogs: input.runtimeLogs,
        runtimePolicy: runInput.runtimePolicy,
        logger: input.logger.child({
          component: "agent_runtime",
          issueId: runInput.issue.id,
          issueIdentifier: runInput.issue.identifier
        }),
        hostCommandEnvSource: input.hostCommandEnvSource,
        harnessLaunchEnv: input.harnessLaunchEnv ?? {},
        harnessAuthMode: input.harnessAuthMode ?? null,
        harnessProviderEnvKey: input.harnessProviderEnvKey ?? null,
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

async function executeRun(input: {
  promptTemplate: string;
  harness: SymphonyRuntimeHarness;
  promptContract: SymphonyLoadedPromptContract;
  githubRepository: string | null;
  tracker: SymphonyTracker;
  runStore: SymphonyRuntimeRunStore;
  deliveryReports: SymphonyIssueDeliveryReportStore;
  agentAnalytics: AgentAnalyticsStore;
  runtimeLogs: SymphonyRuntimeLogStore;
  runtimePolicy: SymphonyAgentRuntimeConfig;
  logger: SymphonyLogger;
  hostCommandEnvSource: Record<string, string | undefined>;
  harnessLaunchEnv: Record<string, string>;
  harnessAuthMode: string | null;
  harnessProviderEnvKey: string | null;
  callbacks: RunCallbacks;
  issue: SymphonyTrackerIssue;
  runId: string | null;
  attempt: number;
  workspace: Parameters<AgentRuntime["startRun"]>[0]["workspace"];
  launchTarget: SymphonyRuntimeLaunchTarget;
  activeRun: ActiveRun;
}): Promise<void> {
  const harnessModelPolicy = resolveHarnessModelRuntimePolicy(
    input.runtimePolicy,
    input.harness.kind
  );
  let persistedTurnId: string | null = null;
  let maxTurnsReached = false;
  let sessionModel: string | null = null;
  let sessionProviderId: string | null = null;
  let sessionProviderName: string | null = null;
  let deliveryReport: RuntimeDeliveryReportResult | null = null;
  const requiresExplicitDeliveryReport = /(?:^|\s)app-server(?=\s|$)/u.test(
    input.runtimePolicy.agentRuntime.command.trim()
  );

  try {
    await input.runtimeLogs.record({
      level: "info",
      source: "agent_runtime",
      eventType: "runtime_launch_target_resolved",
      message: "Resolved the agent runtime launch target.",
      issueId: input.issue.id,
      issueIdentifier: input.issue.identifier,
      runId: input.runId,
      payload: {
        harness: input.harness.kind,
        launchTarget: describeLaunchTarget(input.launchTarget)
      }
    });

    if (input.runId) {
      const repoStart = await captureRepoSnapshot(
        input.launchTarget,
        input.runtimePolicy.hooks.timeoutMs
      );
      await input.runStore.updateRun(input.runId, {
        commitHashStart: repoStart.commitHash,
        repoStart: repoStart.snapshot
      });
    }

    const session = await input.harness.startSession({
      launchTarget: input.launchTarget,
      env: {
        ...input.workspace.envBundle.values,
        ...input.harnessLaunchEnv
      },
      hostCommandEnvSource: input.hostCommandEnvSource,
      runtimePolicy: input.runtimePolicy,
      issue: input.issue,
      logger: input.logger
    });
    input.activeRun.client = session.client;
    sessionModel = session.model;
    sessionProviderId = session.providerId;
    sessionProviderName = session.providerName;

    if (input.runId) {
      await input.agentAnalytics.startRun({
        runId: input.runId,
        issueId: input.issue.id,
        issueIdentifier: input.issue.identifier,
        status: "running",
        threadId: session.threadId,
        harnessKind: input.harness.kind,
        model: sessionModel,
        providerId: session.providerId,
        providerName: session.providerName
      });
    }

    await input.runtimeLogs.record({
      level: "info",
      source: "agent_runtime",
      eventType: "runtime_session_started",
      message: "Started the agent harness session.",
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
        authMode: input.harnessAuthMode,
        providerEnvKey: input.harnessProviderEnvKey,
        harness: input.harness.kind,
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
        await finalizeStoppedTurn(
          input.runStore,
          input.agentAnalytics,
          input.runId,
          persistedTurnId
        );
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
                  path: session.workspacePath,
                  branch: currentIssue.branchName
                },
                attempt: input.attempt
              }
            })
          : buildSymphonyContinuationPrompt({
              turnNumber,
              maxTurns: input.runtimePolicy.agent.maxTurns
            });

      persistedTurnId = input.runId
        ? await input.runStore.recordTurnStarted(input.runId, {
            promptText: prompt,
            status: "running"
          })
        : null;

      const turnResult = await session.client.runTurn(session, {
        prompt,
        title: `${currentIssue.identifier}: ${currentIssue.title}`,
        sandboxPolicy: null,
        toolExecutor: buildRuntimeDynamicToolExecutor({
          runtimePolicy: input.runtimePolicy,
          logger: input.logger,
          deliveryReports: input.deliveryReports,
          issue: currentIssue,
          runId: input.runId,
          readTurnId: () => persistedTurnId,
          onDeliveryReportRecorded(recordedReport) {
            deliveryReport = recordedReport;
          }
        }),
        turnTimeoutMs: input.runtimePolicy.pi.turnTimeoutMs,
        onMessage: async (update) => {
          const { message, projectionLosses, rawPayload } = update;
          const threadEvent = isThreadEvent(message) ? message : null;
          const runtimePayload = rawPayload ?? message;
          const runtimePayloadRecord = asRecord(runtimePayload);
          const eventName =
            threadEvent?.type ??
            normalizeRuntimeUpdateEventName(
              getString(message, "event") ?? getString(runtimePayloadRecord, "type")
            ) ??
            "notification";
          const timestamp = new Date().toISOString();
          const turnUsage = extractRuntimeUsage(threadEvent, runtimePayloadRecord);
          const threadId =
            getString(message, "thread_id") ??
            getString(message, "threadId") ??
            getStringPath(message, ["params", "threadId"]) ??
            getString(runtimePayloadRecord, "thread_id") ??
            getString(runtimePayloadRecord, "threadId") ??
            getStringPath(runtimePayloadRecord, ["params", "threadId"]);

          await input.callbacks.onUpdate(currentIssue.id, {
            event: eventName,
            payload: runtimePayload,
            timestamp,
            sessionId:
              getString(message, "session_id") ??
              getString(message, "sessionId") ??
              getString(runtimePayloadRecord, "session_id") ??
              getString(runtimePayloadRecord, "sessionId") ??
              null,
            agentRuntimeProcessId:
              getString(message, "agent_app_server_pid") ?? session.processId
          });

          if (input.runId && persistedTurnId) {
            if (turnUsage) {
              await input.runStore.updateTurn(persistedTurnId, {
                usage: turnUsage
              });
            }

            if (threadEvent) {
              await input.agentAnalytics.recordEvent({
                runId: input.runId,
                turnId: persistedTurnId,
                threadId,
                recordedAt: timestamp,
                payload: threadEvent,
                projectionLosses,
                rawPayload
              });
            }
          }
        }
      });

      if (input.runId && persistedTurnId) {
        const endedAt = new Date().toISOString();
        await input.runStore.finalizeTurn(persistedTurnId, {
          status: "completed",
          endedAt,
          threadId: turnResult.threadId,
          agentTurnId: turnResult.turnId,
          sessionId: turnResult.sessionId,
          usage: turnResult.usage ?? null
        });
        await input.agentAnalytics.finalizeTurn({
          runId: input.runId,
          turnId: persistedTurnId,
          endedAt,
          status: "completed",
          failureKind: null,
          failureMessagePreview: null,
          threadId: turnResult.threadId,
          usage: turnResult.usage ?? null,
          harnessKind: input.harness.kind,
          model: sessionModel,
          providerId: sessionProviderId,
          providerName: sessionProviderName
        });
        persistedTurnId = null;
      }

      if (requiresExplicitDeliveryReport && deliveryReport) {
        break;
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
        await input.runStore.updateRun(input.runId, {
          commitHashEnd: repoEnd.commitHash,
          repoEnd: repoEnd.snapshot
        });
      }

      if (requiresExplicitDeliveryReport && deliveryReport) {
        await input.callbacks.onComplete(
          input.issue.id,
          deliveryCompletion(deliveryReport)
        );
      } else if (maxTurnsReached) {
        await input.callbacks.onComplete(input.issue.id, {
          kind: "max_turns_reached",
          reason: `Reached the configured ${input.runtimePolicy.agent.maxTurns}-turn limit while the issue remained active.`,
          maxTurns: input.runtimePolicy.agent.maxTurns
        });
      } else {
        await input.callbacks.onComplete(
          input.issue.id,
          requiresExplicitDeliveryReport
            ? missingDeliveryReportCompletion()
            : { kind: "normal" }
        );
      }
    }
  } catch (error) {
    if (input.activeRun.stopped) {
      await finalizeStoppedTurn(
        input.runStore,
        input.agentAnalytics,
        input.runId,
        persistedTurnId
      );
      return;
    }

    const reason = error instanceof Error ? error.message : String(error);

    if (input.runId && persistedTurnId) {
      await input.runStore.finalizeTurn(persistedTurnId, {
        status: "failed",
        endedAt: new Date().toISOString(),
        metadata: {
          reason
        }
      });
      await input.agentAnalytics.finalizeTurn({
        runId: input.runId,
        turnId: persistedTurnId,
        endedAt: new Date().toISOString(),
        status: "failed",
        failureKind: "runtime_failure",
        failureMessagePreview: reason,
        threadId: null,
        harnessKind: input.harness.kind,
        model: sessionModel ?? harnessModelPolicy.defaultModel,
        providerId: sessionProviderId,
        providerName: sessionProviderName
      });
    }

    if (input.runId) {
      const repoEnd = await captureRepoSnapshot(
        input.launchTarget,
        input.runtimePolicy.hooks.timeoutMs
      );
      await input.runStore.updateRun(input.runId, {
        commitHashEnd: repoEnd.commitHash,
        repoEnd: repoEnd.snapshot
      });
    }

    const startupFailure = classifyStartupFailure(error);
    await input.runtimeLogs.record({
      level: "error",
      source: "agent_runtime",
      eventType: startupFailure
        ? "runtime_startup_failed"
        : "runtime_execution_failed",
      message: startupFailure
        ? "Agent runtime startup failed."
        : "Agent runtime execution failed.",
      issueId: input.issue.id,
      issueIdentifier: input.issue.identifier,
      runId: input.runId,
      payload: {
        reason,
        failureStage: startupFailure?.failureStage ?? null,
        failureOrigin: startupFailure?.failureOrigin ?? null,
        model: harnessModelPolicy.defaultModel,
        providerId: sessionProviderId,
        providerName: sessionProviderName,
        authMode: input.harnessAuthMode,
        providerEnvKey: input.harnessProviderEnvKey,
        harness: input.harness.kind,
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
          : isTransientProviderError(error, sessionProviderId)
            ? {
                kind: "provider_transient" as const,
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

function describeLaunchTarget(target: SymphonyRuntimeLaunchTarget): JsonObject {
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

function deliveryCompletion(
  deliveryReport: RuntimeDeliveryReportResult
): SymphonyAgentRuntimeCompletion {
  switch (deliveryReport.status) {
    case "completed":
      return {
        kind: "normal"
      };
    case "blocked":
      return {
        kind: "failure",
        reason:
          deliveryReport.blockingReason ??
          `Delivery reported as blocked: ${deliveryReport.summary}`
      };
    case "partial":
    default:
      return {
        kind: "failure",
        reason: `Delivery reported as partial: ${deliveryReport.summary}`
      };
  }
}

function missingDeliveryReportCompletion(): SymphonyAgentRuntimeCompletion {
  return {
    kind: "failure",
    reason:
      "Run ended without calling `report_issue_delivery`. Delivery success must be reported explicitly before the run can complete."
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
  if (error instanceof HarnessSessionError) {
    if (
      [
        "initialize_failed",
        "thread_start_failed",
        "invalid_workspace_cwd",
        "invalid_thread_payload",
        "invalid_turn_payload",
        "invalid_issue_label_override",
        "pi_launch_unsupported",
        "pi_session_start_failed",
        "pi_turn_start_failed"
      ].includes(error.code)
    ) {
      return {
        failureStage: "runtime_session_start",
        failureOrigin: "pi_startup"
      };
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes("Pi RPC")
  ) {
    return {
      failureStage: "runtime_session_start",
      failureOrigin: "pi_startup"
    };
  }

  return null;
}

function isRateLimitedError(error: unknown): boolean {
  const messages = [
    error instanceof Error ? error.message : String(error)
  ];

  if (error instanceof HarnessSessionError && error.detail) {
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

export function isTransientProviderError(
  error: unknown,
  providerId: string | null
): boolean {
  if (!providerId) {
    return false;
  }

  const messages = [
    error instanceof Error ? error.message : String(error)
  ];

  if (error instanceof HarnessSessionError && error.detail) {
    messages.push(JSON.stringify(error.detail));
  }

  return messages.some((message) => {
    const normalized = message.toLowerCase();

    return (
      normalized.includes("502 bad gateway") ||
      normalized.includes("503 service unavailable") ||
      normalized.includes("504 gateway timeout") ||
      normalized.includes("error code: 502") ||
      normalized.includes("error code: 503") ||
      normalized.includes("error code: 504") ||
      normalized.includes("unexpected status 502") ||
      normalized.includes("unexpected status 503") ||
      normalized.includes("unexpected status 504") ||
      normalized.includes("socket hang up") ||
      normalized.includes("connection reset") ||
      normalized.includes("econnreset") ||
      normalized.includes("etimedout") ||
      normalized.includes("eai_again") ||
      normalized.includes("temporary failure in name resolution") ||
      normalized.includes("upstream connect error") ||
      normalized.includes("upstream request timeout")
    );
  });
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractRuntimeUsage(
  threadEvent: Parameters<typeof extractUsage>[0] | null,
  payload: Record<string, unknown> | null
): {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
} | null {
  const eventUsage = threadEvent ? extractUsage(threadEvent) : null;
  if (eventUsage) {
    return eventUsage;
  }

  const decodedPiEvent =
    decodePiRuntimeEvent(payload) ??
    decodePiRuntimeEvent(asRecord(asRecord(payload?.params)?.msg));
  const piUsage =
    decodedPiEvent &&
    (decodedPiEvent.type === "message_end" || decodedPiEvent.type === "turn_end")
      ? extractPiRuntimeUsage(decodedPiEvent)
      : null;

  if (piUsage) {
    return {
      input_tokens: piUsage.input,
      cached_input_tokens: piUsage.cacheRead,
      output_tokens: piUsage.output
    };
  }

  const directUsage =
    asRecord(payload?.usage) ??
    asRecord(asRecord(payload?.message)?.usage) ??
    asRecord(asRecord(asRecord(payload?.params)?.msg)?.usage);

  if (!directUsage) {
    return null;
  }

  const inputTokens = getNumber(directUsage, "input_tokens") ?? getNumber(directUsage, "input");
  const cachedInputTokens =
    getNumber(directUsage, "cached_input_tokens") ?? getNumber(directUsage, "cacheRead");
  const outputTokens =
    getNumber(directUsage, "output_tokens") ?? getNumber(directUsage, "output");

  return inputTokens !== null || cachedInputTokens !== null || outputTokens !== null
    ? {
        input_tokens: inputTokens ?? 0,
        cached_input_tokens: cachedInputTokens ?? 0,
        output_tokens: outputTokens ?? 0
      }
    : null;
}

function getNumber(
  value: Record<string, unknown> | null | undefined,
  key: string
): number | null {
  const nested = value?.[key];
  return typeof nested === "number" && Number.isFinite(nested) ? nested : null;
}

function normalizeRuntimeUpdateEventName(value: string | null): string | null {
  if (value === "session_started") {
    return "session.started";
  }

  return value;
}

async function finalizeStoppedTurn(
  runStore: SymphonyRuntimeRunStore,
  agentAnalytics: AgentAnalyticsStore,
  runId: string | null,
  persistedTurnId: string | null
): Promise<void> {
  if (!runId || !persistedTurnId) {
    return;
  }

  await runStore.finalizeTurn(persistedTurnId, {
    status: "stopped",
    endedAt: new Date().toISOString(),
    metadata: {
      stopReason: "runtime_stopped"
    }
  });
  await agentAnalytics.finalizeTurn({
    runId,
    turnId: persistedTurnId,
    endedAt: new Date().toISOString(),
    status: "stopped",
    failureKind: "runtime_stopped",
    failureMessagePreview: "Turn stopped by runtime.",
    threadId: null
  });
}
