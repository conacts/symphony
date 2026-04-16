import type { SymphonyOrchestratorSnapshot } from "@symphony/orchestrator";
import {
  summarizePreparedWorkspace,
  type WorkspaceEnvBundleSummary
} from "@symphony/workspace";
import {
  issueBranchName,
  type SymphonyTrackerIssue
} from "@symphony/tracker";
import type { SymphonyRuntimeCapabilityOperatorInspection } from "../core/runtime-app-types.js";
import type {
  SymphonyRuntimeIssueResult,
  SymphonyRuntimeLaunchTarget,
  SymphonyRuntimeStateResult
} from "@symphony/contracts";
import {
  listSupportedPiModels,
  piModelLabelPrefix,
  resolvePiIssueModel
} from "@symphony/agent-harnesses";
import type { AdmittedRuntimeRepository } from "../core/runtime-admitted-repositories.js";
import {
  requireWorkflowTrackerState,
  resolveRuntimeIssueTrackerState
} from "../core/runtime-workflow-tracker-state.js";
type RuntimeIssuePiSelectionPolicy = {
  defaultModel: string | null;
  defaultPreset: string;
  presets: Record<
    string,
    {
      model: string | null;
      reasoningEffort: string | null;
    }
  >;
};

export function serializeRuntimeState(
  snapshot: SymphonyOrchestratorSnapshot,
  admittedRepositories: AdmittedRuntimeRepository[] = [],
  workflowTrackerStatesByIssueIdentifier: ReadonlyMap<string, string> = new Map()
): SymphonyRuntimeStateResult {
  return {
    counts: {
      running: snapshot.running.length,
      retrying: snapshot.retrying.length
    },
    repositories:
      admittedRepositories.length > 0
        ? admittedRepositories.map((repository) => ({
            repositoryKey: repository.repositoryKey,
            linear: {
              teamKey: repository.linearBinding.teamKey
            }
          }))
        : undefined,
    running: snapshot.running.map((entry) => ({
      trackerIssueId: entry.issueId,
      issueIdentifier: entry.issue.identifier,
      state: requireWorkflowTrackerState({
        issueIdentifier: entry.issue.identifier,
        workflowTrackerState:
          workflowTrackerStatesByIssueIdentifier.get(entry.issue.identifier) ?? null
      }),
      workerHost: entry.workerHost,
      workspacePath: entry.workspacePath,
      threadId: entry.threadId,
      workspace: serializeRuntimeWorkspace(
        entry.workspace,
        entry.workerHost,
        entry.workspacePath,
        true
      ),
      launchTarget: serializeRuntimeLaunchTarget(entry.launchTarget),
      turnCount: entry.turnCount,
      lastEvent: entry.lastAgentEvent,
      lastMessage: summarizeMessage(entry.lastAgentMessage?.message ?? null),
      startedAt: entry.startedAt,
      lastEventAt: entry.lastAgentTimestamp,
      tokens: {
        inputTokens: entry.agentInputTokens,
        outputTokens: entry.agentOutputTokens,
        totalTokens: entry.agentTotalTokens
      }
    })),
    retrying: snapshot.retrying.map((entry) => ({
      trackerIssueId: entry.issueId,
      issueIdentifier: entry.identifier,
      attempt: entry.attempt,
      dueAt: new Date(entry.dueAtMs).toISOString(),
      error: entry.error,
      workerHost: entry.workerHost,
      workspacePath: entry.workspacePath,
      workspace: serializeRuntimeWorkspace(
        entry.workspace,
        entry.workerHost,
        entry.workspacePath,
        true
      ),
      launchTarget: serializeRuntimeLaunchTarget(entry.launchTarget)
    })),
    agentTotals: snapshot.agentTotals,
    rateLimits: snapshot.rateLimits
  };
}

export function serializeRuntimeIssue(
  snapshot: SymphonyOrchestratorSnapshot,
  githubRepository: string | null,
  issueIdentifier: string,
  trackedIssue: SymphonyTrackerIssue | null,
  workflowTrackerState: string | null,
  piSelectionPolicy: RuntimeIssuePiSelectionPolicy,
  operatorInspection: SymphonyRuntimeCapabilityOperatorInspection | null = null
): SymphonyRuntimeIssueResult | null {
  const running = snapshot.running.find(
    (entry) => entry.issue.identifier === issueIdentifier
  );
  const retry = snapshot.retrying.find(
    (entry) => entry.identifier === issueIdentifier
  );

  if (!running && !retry && !trackedIssue) {
    return null;
  }

  const tracked = trackedIssue ?? running?.issue ?? null;
  if (!tracked) {
    throw new Error(
      `Cannot serialize runtime issue ${issueIdentifier} without canonical tracker issue data.`
    );
  }
  const branchName = tracked.branchName ?? issueBranchName(issueIdentifier);
  const githubPullRequestSearchUrl = buildGitHubPullRequestSearchUrl(
    githubRepository,
    branchName
  );
  const workspace = running?.workspace ?? retry?.workspace ?? null;
  const canonicalTrackerState = resolveRuntimeIssueTrackerState({
    issueIdentifier,
    trackedState: tracked.state,
    workflowTrackerState,
    hasWorkflowBackedRuntimeEntry: Boolean(running || retry)
  });
  const selectedModel = resolvePiIssueModel(
    tracked,
    piSelectionPolicy
  );

  return {
    issueIdentifier,
    trackerIssueId: running?.issueId ?? retry?.issueId ?? tracked.id,
    status: running ? "running" : retry ? "retrying" : "tracked",
    workspace: serializeRuntimeWorkspace(
      workspace,
      running?.workerHost ?? retry?.workerHost ?? null,
      running?.workspacePath ?? retry?.workspacePath ?? null,
      Boolean(running || retry)
    ),
    attempts: {
      restartCount: Math.max((retry?.attempt ?? 0) - 1, 0),
      currentRetryAttempt: retry?.attempt ?? 0
    },
    running: running
      ? {
          workerHost: running.workerHost,
          workspacePath: running.workspacePath,
          threadId: running.threadId,
          launchTarget: serializeRuntimeLaunchTarget(running.launchTarget),
          turnCount: running.turnCount,
          state: canonicalTrackerState,
          startedAt: running.startedAt,
          lastEvent: running.lastAgentEvent,
          lastMessage: summarizeMessage(running.lastAgentMessage?.message ?? null),
          lastEventAt: running.lastAgentTimestamp,
          tokens: {
            inputTokens: running.agentInputTokens,
            outputTokens: running.agentOutputTokens,
            totalTokens: running.agentTotalTokens
          }
        }
      : null,
    retry: retry
      ? {
          attempt: retry.attempt,
          dueAt: new Date(retry.dueAtMs).toISOString(),
          error: retry.error,
          workerHost: retry.workerHost,
          workspacePath: retry.workspacePath,
          launchTarget: serializeRuntimeLaunchTarget(retry.launchTarget)
        }
      : null,
    lastError: retry?.error ?? null,
    tracked: {
      title: tracked.title,
      state: canonicalTrackerState,
      branchName: tracked.branchName,
      url: tracked.url,
      projectName: tracked.projectName,
      teamKey: tracked.teamKey
    },
    operator: {
      refreshPath: "/api/v1/refresh",
      refreshDelegatesTo: ["poll", "reconcile"],
      githubPullRequestSearchUrl,
      pi: {
        defaultModel: piSelectionPolicy.defaultModel,
        selectedModel,
        availableModels: listSupportedPiModels(),
        modelOverrideLabelPrefix: piModelLabelPrefix,
        selectionHelpText:
          `Pi selection is label-driven. Use ${piModelLabelPrefix}<preset> for repo-defined tiers or ${piModelLabelPrefix}<model> for a direct model override.`
      },
      pendingClarification: operatorInspection?.pendingClarification ?? null,
      capability: operatorInspection?.capability ?? null
    }
  };
}

function serializeRuntimeWorkspace(
  workspace: SymphonyOrchestratorSnapshot["running"][number]["workspace"] | null,
  workerHost: string | null,
  compatibilityPath: string | null,
  requirePreparedWorkspace: boolean
): SymphonyRuntimeIssueResult["workspace"] {
  if (!workspace) {
    if (requirePreparedWorkspace) {
      throw new Error(
        "Cannot serialize runtime workspace without a prepared workspace."
      );
    }

    return {
      backendKind: null,
      workerHost,
      prepareDisposition: null,
      executionTargetKind: null,
      materializationKind: null,
      hostRepoMetadataAvailable: false,
      containerDisposition: null,
      networkDisposition: null,
      hostPath: compatibilityPath,
      runtimePath: compatibilityPath,
      containerId: null,
      containerName: null,
      networkName: null,
      services: [],
      envBundleSummary: null,
      manifestLifecycle: null,
      path: compatibilityPath,
      executionTarget: null,
      materialization: null
    };
  }

  const summary = summarizePreparedWorkspace(workspace);

  return {
    backendKind: workspace.backendKind,
    workerHost: workerHost ?? workspace.workerHost,
    prepareDisposition: summary?.prepareDisposition ?? null,
    executionTargetKind: summary?.executionTargetKind ?? null,
    materializationKind: summary?.materializationKind ?? null,
    hostRepoMetadataAvailable: summary?.hostRepoMetadataAvailable ?? false,
    containerDisposition: summary?.containerDisposition ?? null,
    networkDisposition: summary?.networkDisposition ?? null,
    hostPath: summary?.hostPath ?? compatibilityPath,
    runtimePath: summary?.runtimePath ?? compatibilityPath,
    containerId: summary?.containerId ?? null,
    containerName: summary?.containerName ?? null,
    networkName: summary?.networkName ?? null,
    services: summary?.services ?? [],
    envBundleSummary: normalizeWorkspaceEnvBundleSummary(
      summary?.envBundleSummary ?? null
    ),
    manifestLifecycle: summary?.manifestLifecycle ?? null,
    path: workspace.path ?? compatibilityPath,
    executionTarget: {
      kind: "container",
      workspacePath: workspace.executionTarget.workspacePath,
      containerId: workspace.executionTarget.containerId,
      containerName: workspace.executionTarget.containerName,
      hostPath: workspace.executionTarget.hostPath,
      user: workspace.executionTarget.user
    },
    materialization: {
      ...workspace.materialization
    }
  };
}

function normalizeWorkspaceEnvBundleSummary(
  summary: WorkspaceEnvBundleSummary | null
) {
  if (!summary) {
    return null;
  }

  return {
    ...summary,
    repoEnvPath: "repoEnvPath" in summary ? summary.repoEnvPath : null,
    projectedRepoKeys:
      "projectedRepoKeys" in summary ? summary.projectedRepoKeys : [],
    requiredRepoKeys:
      "requiredRepoKeys" in summary ? summary.requiredRepoKeys : [],
    optionalRepoKeys:
      "optionalRepoKeys" in summary ? summary.optionalRepoKeys : []
  };
}

function serializeRuntimeLaunchTarget(
  launchTarget:
    | SymphonyOrchestratorSnapshot["running"][number]["launchTarget"]
    | SymphonyOrchestratorSnapshot["retrying"][number]["launchTarget"]
    | null
): SymphonyRuntimeLaunchTarget | null {
  if (!launchTarget) {
    return null;
  }

  return {
    ...launchTarget
  };
}

function summarizeMessage(message: unknown): string | null {
  if (typeof message === "string") {
    return message;
  }

  if (message === null || message === undefined) {
    return null;
  }

  if (
    typeof message === "object" &&
    "method" in message &&
    typeof message.method === "string"
  ) {
    return message.method;
  }

  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

function buildGitHubPullRequestSearchUrl(
  repository: string | null,
  branchName: string | null
): string | null {
  if (!repository || !branchName) {
    return null;
  }

  const url = new URL(`https://github.com/${repository}/pulls`);
  url.searchParams.set("q", `is:pr head:${branchName}`);
  return url.toString();
}
