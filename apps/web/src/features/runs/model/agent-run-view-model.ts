import type {
  SymphonyAgentOverflowResult,
  SymphonyAgentRunArtifactsResult,
  SymphonyForensicsRunDetailResult
} from "@symphony/contracts";
import {
  formatAuthModeLabel,
  formatCount,
  formatDuration,
  formatDurationMilliseconds,
  formatEventTypeLabel,
  formatLabel,
  formatOutcomeLabel,
  formatPercent,
  formatProviderEnvKeyLabel,
  formatStatusLabel,
  formatTimestamp,
  formatWholePercent
} from "@/core/display-formatters";
import {
  classifyCommand,
  formatCommandFamilyLabel
} from "@/core/command-family";
import {
  buildAgentTurnLatencyRows,
  sumTurnLatencyTotals
} from "@/core/agent-latency";
import {
  buildAgentTurnTokenRows,
  sumTurnTokenTotals
} from "@/core/agent-token";
import {
  buildIssueHref,
  buildLegacyRunHref,
  buildIssueRunHref,
  buildIssueRunTurnHref,
  buildIssueRunTurnsHref
} from "@/core/control-plane-routes";
import {
  buildPiResponseCards
} from "@/features/runs/model/agent-run-pi-response";
import {
  buildTranscriptTurns,
  type AgentRunTranscriptTurn
} from "@/features/runs/model/agent-run-transcript";

export type {
  AgentRunTranscriptEntry,
  AgentRunTranscriptTurn,
  AgentRunFileChip,
  PiPatternTaskQuery,
  PiResponseMetadata
} from "@/features/runs/model/agent-run-transcript";

export type AgentRunResourceViewModel = AgentRunViewModel;

export type AgentRunViewModel = {
  harnessLabel: string;
  issueIdentifier: string;
  runId: string;
  runTitle: string;
  routes: {
    issueHref: string;
    runHref: string;
    turnsHref: string;
    transcriptHref: string;
  };
  statusSummary: string;
  failureSummary: string | null;
  metrics: Array<{
    label: string;
    value: string;
    detail?: string;
  }>;
  metadata: Array<{
    label: string;
    value: string;
  }>;
  piResponseCards: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
  machineLoadCards: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
  executionPerformance: {
    commandSummary: string;
    toolSummary: string;
    commandRows: Array<{
      label: string;
      family: string;
      duration: string;
      durationMs: number;
      status: string;
    }>;
    toolRows: Array<{
      label: string;
      duration: string;
      durationMs: number;
      status: string;
    }>;
  };
  turnLatency: {
    cards: Array<{
      label: string;
      value: string;
      detail: string;
    }>;
    rows: Array<{
      turnLabel: string;
      status: string;
      wallClockMs: number;
      reasoningMs: number;
      commandMs: number;
      toolMs: number;
      messageMs: number;
      unclassifiedMs: number;
      wallClock: string;
    }>;
  };
  turnTokens: {
    cards: Array<{
      label: string;
      value: string;
      detail: string;
    }>;
    rows: Array<{
      turnLabel: string;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      totalTokens: number;
    }>;
  };
  transcriptTurns: AgentRunTranscriptTurn[];
  turnRows: Array<{
    turnId: string;
    turnSequence: number;
    href: string;
    startedAt: string;
    endedAt: string;
    status: string;
    tokenSummary: string;
    commandCount: string;
    toolCount: string;
    reasoningCount: string;
  }>;
  hasTranscript: boolean;
  repoStartText: string;
  repoEndText: string;
  debugEvents: Array<{
    eventId: string;
    eventType: string;
    recordedAt: string;
    itemId: string;
    payloadText: string;
  }>;
};

export function buildAgentRunViewModel(input: {
  runDetail: SymphonyForensicsRunDetailResult;
  runArtifacts: SymphonyAgentRunArtifactsResult | null;
}): AgentRunViewModel {
  const runArtifacts = input.runArtifacts;
  const run = input.runDetail.run;
  const agentRun = runArtifacts?.run ?? null;
  const harnessLabel = formatLabel(
    input.runDetail.run.agentHarness ?? agentRun?.harnessKind ?? "agent"
  );
  const transcriptTurns = runArtifacts
    ? buildTranscriptTurns(runArtifacts, input.runDetail.turns)
    : [];
  const agentStatus = run.agentStatus ?? agentRun?.status ?? "Unavailable";
  const workflowStatus = run.status;
  const workflowOutcome = run.outcome ?? "n/a";
  const agentFailureSummary =
    run.agentFailureMessagePreview ??
    agentRun?.failureMessagePreview ??
    run.errorMessage ??
    null;
  const executionPerformance = buildExecutionPerformance(runArtifacts);
  const turnLatency = buildTurnLatency(runArtifacts, input.runDetail.turns);
  const turnTokens = buildTurnTokens(runArtifacts, input.runDetail.turns);
  const piResponseCards = buildPiResponseCards(runArtifacts, compareDescending);
  const fallbackTokenTotals = turnTokens.rows.reduce(
    (totals, row) => ({
      inputTokens: totals.inputTokens + row.inputTokens,
      cachedInputTokens: totals.cachedInputTokens + row.cachedInputTokens,
      outputTokens: totals.outputTokens + row.outputTokens,
      totalTokens: totals.totalTokens + row.totalTokens
    }),
    {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0
    }
  );
  const effectiveInputTokens =
    (agentRun?.inputTokens ?? 0) > 0
      ? (agentRun?.inputTokens ?? 0)
      : run.inputTokens > 0
        ? run.inputTokens
        : fallbackTokenTotals.inputTokens;
  const effectiveCachedInputTokens =
    (agentRun?.cachedInputTokens ?? 0) > 0
      ? (agentRun?.cachedInputTokens ?? 0)
      : fallbackTokenTotals.cachedInputTokens;
  const effectiveOutputTokens =
    (agentRun?.outputTokens ?? 0) > 0
      ? (agentRun?.outputTokens ?? 0)
      : run.outputTokens > 0
        ? run.outputTokens
        : fallbackTokenTotals.outputTokens;
  const effectiveTotalTokens =
    (agentRun?.totalTokens ?? 0) > 0
      ? (agentRun?.totalTokens ?? 0)
      : run.totalTokens > 0
        ? run.totalTokens
        : fallbackTokenTotals.totalTokens;
  const issueIdentifier = input.runDetail.issue.issueIdentifier;
  const runHref = buildIssueRunHref(issueIdentifier, run.runId);
  const turnsHref = buildIssueRunTurnsHref(issueIdentifier, run.runId);
  const transcriptHref = buildLegacyRunHref(run.runId);

  return {
    harnessLabel,
    issueIdentifier,
    runId: run.runId,
    runTitle: `${issueIdentifier} · ${run.runId}`,
    routes: {
      issueHref: buildIssueHref(issueIdentifier),
      runHref,
      turnsHref,
      transcriptHref
    },
    statusSummary: `${formatStatusLabel(workflowStatus)} / ${formatOutcomeLabel(workflowOutcome)} · ${harnessLabel} ${formatStatusLabel(agentStatus)}`,
    failureSummary: agentFailureSummary,
    metrics: [
      {
        label: "Workflow",
        value: formatStatusLabel(workflowStatus),
        detail: formatOutcomeLabel(workflowOutcome)
      },
      {
        label: "PI runtime",
        value: formatStatusLabel(agentStatus),
        detail: formatLabel(run.agentFailureKind ?? agentRun?.failureKind ?? "healthy")
      },
      {
        label: "Duration",
        value:
          run.durationSeconds === null
            ? "In progress"
            : formatDuration(run.durationSeconds),
        detail: `Started ${formatTimestamp(run.startedAt)}`
      },
      {
        label: "Tokens",
        value: formatCount(effectiveTotalTokens),
        detail: `In ${formatCount(effectiveInputTokens)} · Cached ${formatCount(
          effectiveCachedInputTokens
        )} · Out ${formatCount(effectiveOutputTokens)}`
      },
      {
        label: "Turns",
        value: formatCount(agentRun?.turnCount ?? run.turnCount),
        detail: `${formatCount(agentRun?.commandCount ?? 0)} commands / ${formatCount(
          agentRun?.toolCallCount ?? 0
        )} tools`
      },
      {
        label: "Messages",
        value: formatCount(agentRun?.agentMessageCount ?? 0),
        detail: `${formatCount(agentRun?.reasoningCount ?? 0)} reasoning`
      }
    ],
    metadata: [
      {
        label: "Harness",
        value: formatLabel(input.runDetail.run.agentHarness ?? "Unavailable")
      },
      {
        label: "Model",
        value: input.runDetail.run.model ?? "Unavailable"
      },
      {
        label: "Provider",
        value: input.runDetail.run.providerName ?? "Unavailable"
      },
      {
        label: "Auth",
        value: formatAuthModeLabel(input.runDetail.run.authMode ?? "Unavailable")
      },
      {
        label: "Provider env",
        value: formatProviderEnvKeyLabel(
          input.runDetail.run.providerEnvKey ?? "Unavailable"
        )
      },
      {
        label: "PI profile",
        value: input.runDetail.run.profile ?? "Unavailable"
      },
      {
        label: "Reasoning",
        value: formatLabel(input.runDetail.run.reasoningEffort ?? "Unavailable")
      },
      {
        label: "PI thread",
        value:
          input.runDetail.run.threadId ??
          agentRun?.threadId ??
          "Unavailable"
      },
      {
        label: "PI process",
        value: input.runDetail.run.processId ?? "Unavailable"
      },
      {
        label: "Launch target",
        value: formatLaunchTargetLabel(input.runDetail.run.launchTarget)
      },
      {
        label: "Workspace",
        value: run.workspacePath ?? "Unavailable"
      },
      {
        label: "Worker",
        value: run.workerHost ?? "Unavailable"
      }
    ],
    piResponseCards,
    machineLoadCards: buildRunMachineLoadCards(run.machineLoad),
    executionPerformance,
    turnLatency,
    turnTokens,
    transcriptTurns,
    turnRows: transcriptTurns.map((turn) => ({
      turnId: turn.turnId,
      turnSequence: turn.turnSequence,
      href: buildIssueRunTurnHref(issueIdentifier, run.runId, turn.turnId),
      startedAt: turn.startedAt,
      endedAt: turn.endedAt,
      status: turn.status,
      tokenSummary: turn.tokenSummary,
      commandCount: formatCount(turn.commandCount),
      toolCount: formatCount(turn.toolCount),
      reasoningCount: formatCount(turn.reasoningCount)
    })),
    hasTranscript: transcriptTurns.length > 0,
    repoStartText: formatRepoSnapshot(run.repoStart),
    repoEndText: formatRepoSnapshot(run.repoEnd),
    debugEvents:
      runArtifacts?.events
        .slice()
        .sort((left, right) => compareDescending(left.recordedAt, right.recordedAt))
        .map((event) => ({
          eventId: event.eventId,
          eventType: formatEventTypeLabel(event.eventType),
          recordedAt: formatTimestamp(event.recordedAt),
          itemId: event.itemId ?? "n/a",
          payloadText: JSON.stringify(event.payload, null, 2)
        })) ?? []
  };
}

function buildRunMachineLoadCards(
  machineLoad: SymphonyForensicsRunDetailResult["run"]["machineLoad"]
): AgentRunViewModel["machineLoadCards"] {
  if (!machineLoad) {
    return [
      {
        label: "Peak CPU load",
        value: "n/a",
        detail: "Machine load was not sampled for this run."
      },
      {
        label: "Peak memory load",
        value: "n/a",
        detail: "Machine load was not sampled for this run."
      },
      {
        label: "Peak disk load",
        value: "n/a",
        detail: "Machine load was not sampled for this run."
      }
    ];
  }

  return [
    {
      label: "Peak CPU load",
      value: formatWholePercent(machineLoad.maxCpuPercent),
      detail: `Average ${formatWholePercent(machineLoad.avgCpuPercent)} across ${formatCount(
        machineLoad.sampleCount
      )} samples.`
    },
    {
      label: "Peak memory load",
      value: formatWholePercent(machineLoad.maxMemoryPercent),
      detail: `Average ${formatWholePercent(
        machineLoad.avgMemoryPercent
      )}${machineLoad.hadHighMemory ? " · High-pressure threshold crossed" : ""}.`
    },
    {
      label: "Peak disk load",
      value: formatWholePercent(machineLoad.maxDiskPercent),
      detail: `Average ${formatWholePercent(
        machineLoad.avgDiskPercent
      )}${machineLoad.hadHighDisk ? " · High-pressure threshold crossed" : ""}.`
    }
  ];
}

export function formatOverflowContent(overflow: SymphonyAgentOverflowResult): string {
  if (overflow.overflow.contentText) {
    return overflow.overflow.contentText;
  }

  return JSON.stringify(overflow.overflow.contentJson, null, 2);
}


function buildExecutionPerformance(
  runArtifacts: SymphonyAgentRunArtifactsResult | null
): AgentRunViewModel["executionPerformance"] {
  const commandExecutions = runArtifacts?.commandExecutions ?? [];
  const toolCalls = runArtifacts?.toolCalls ?? [];
  const failedCommands = commandExecutions.filter((command) => command.status !== "completed");
  const failedTools = toolCalls.filter((tool) => tool.status !== "completed");

  return {
    commandSummary: `${formatCount(commandExecutions.length)} executions · ${formatCount(
      failedCommands.length
    )} failed or degraded`,
    toolSummary: `${formatCount(toolCalls.length)} calls · ${formatCount(
      failedTools.length
    )} failed or degraded`,
    commandRows: [...commandExecutions]
      .sort((left, right) => safeDurationMs(right.durationMs) - safeDurationMs(left.durationMs))
      .map((command) => {
        const classification = classifyCommand(command.command);
        const durationMs = safeDurationMs(command.durationMs);

        return {
          label: command.command,
          family: formatCommandFamilyLabel(classification.family),
          duration: formatDurationMilliseconds(durationMs),
          durationMs,
          status: formatStatusLabel(command.status)
        };
      }),
    toolRows: [...toolCalls]
      .sort((left, right) => safeDurationMs(right.durationMs) - safeDurationMs(left.durationMs))
      .map((tool) => {
        const durationMs = safeDurationMs(tool.durationMs);

        return {
          label: `${tool.server}.${tool.tool}`,
          duration: formatDurationMilliseconds(durationMs),
          durationMs,
          status: formatStatusLabel(tool.status)
        };
      })
  };
}

function safeDurationMs(value: number | null) {
  return value ?? 0;
}

function buildTurnLatency(
  runArtifacts: SymphonyAgentRunArtifactsResult | null,
  forensicsTurns: SymphonyForensicsRunDetailResult["turns"]
): AgentRunViewModel["turnLatency"] {
  const rows = runArtifacts
    ? buildAgentTurnLatencyRows({
        runArtifacts,
        forensicsTurns
      })
    : [];
  const totals = sumTurnLatencyTotals(rows);
  const averageWallClockMs = rows.length === 0 ? 0 : totals.wallClockMs / rows.length;
  const slowestTurn = [...rows].sort((left, right) => right.wallClockMs - left.wallClockMs)[0];
  const executionDurationMs = totals.commandMs + totals.toolMs;
  const executionShare = totals.wallClockMs === 0 ? 0 : executionDurationMs / totals.wallClockMs;

  return {
    cards: [
      {
        label: "Recorded turns",
        value: formatCount(rows.length),
        detail: "Turns with readable runtime timing data."
      },
      {
        label: "Average turn wall time",
        value: formatDurationMilliseconds(averageWallClockMs),
        detail: "Average wall-clock time across all recorded turns."
      },
      {
        label: "Slowest turn",
        value: slowestTurn?.turnLabel ?? "n/a",
        detail: slowestTurn
          ? `${formatDurationMilliseconds(slowestTurn.wallClockMs)} wall-clock time.`
          : "No turn latency data is available for this run."
      },
      {
        label: "Execution share",
        value: formatPercent(executionShare),
        detail: `${formatDurationMilliseconds(executionDurationMs)} command + tool time across the run.`
      }
    ],
    rows: rows.map((row) => ({
      turnLabel: row.turnLabel,
      status: row.status,
      wallClockMs: row.wallClockMs,
      reasoningMs: row.reasoningMs,
      commandMs: row.commandMs,
      toolMs: row.toolMs,
      messageMs: row.messageMs,
      unclassifiedMs: row.unclassifiedMs,
      wallClock: formatDurationMilliseconds(row.wallClockMs)
    }))
  };
}

function buildTurnTokens(
  runArtifacts: SymphonyAgentRunArtifactsResult | null,
  forensicsTurns: SymphonyForensicsRunDetailResult["turns"]
): AgentRunViewModel["turnTokens"] {
  const rows = runArtifacts
    ? buildAgentTurnTokenRows({
        runArtifacts,
        forensicsTurns
      })
    : [];
  const totals = sumTurnTokenTotals(rows);
  const averageTurnTokens = rows.length === 0 ? 0 : totals.totalTokens / rows.length;
  const heaviestTurn = [...rows].sort((left, right) => right.totalTokens - left.totalTokens)[0];
  const cachedShare = totals.totalTokens === 0 ? 0 : totals.cachedInputTokens / totals.totalTokens;

  return {
    cards: [
      {
        label: "Turn input tokens",
        value: formatCount(totals.inputTokens),
        detail: `${formatCount(totals.cachedInputTokens)} cached input tokens across the run.`
      },
      {
        label: "Turn output tokens",
        value: formatCount(totals.outputTokens),
        detail: `${formatCount(totals.totalTokens)} total turn tokens across the run.`
      },
      {
        label: "Average turn tokens",
        value: formatCount(Math.round(averageTurnTokens)),
        detail: "Average total token load per recorded turn."
      },
      {
        label: "Heaviest turn",
        value: heaviestTurn?.turnLabel ?? "n/a",
        detail: heaviestTurn
          ? `${formatCount(heaviestTurn.totalTokens)} total tokens on this turn.`
          : `${formatPercent(cachedShare)} cached-input share.`
      }
    ],
    rows: rows.map((row) => ({
      turnLabel: row.turnLabel,
      inputTokens: row.inputTokens,
      cachedInputTokens: row.cachedInputTokens,
      outputTokens: row.outputTokens,
      totalTokens: row.totalTokens
    }))
  };
}
function formatLaunchTargetLabel(
  value: SymphonyForensicsRunDetailResult["run"]["launchTarget"]
): string {
  if (!value) {
    return "Unavailable";
  }

  return [value.kind, value.containerName, value.runtimeWorkspacePath].join(" / ");
}

function formatRepoSnapshot(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

function compareDescending(left: string | null, right: string | null): number {
  return new Date(right ?? 0).getTime() - new Date(left ?? 0).getTime();
}
