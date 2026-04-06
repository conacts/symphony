import type {
  SymphonyAgentTurnActivityRecord,
  SymphonyAgentMessageRecord,
  SymphonyAgentCommandExecutionRecord,
  SymphonyAgentFileChangeRecord,
  SymphonyAgentItemRecord,
  SymphonyAgentOverflowResult,
  SymphonyAgentReasoningBlockRecord,
  SymphonyAgentRunArtifactsResult,
  SymphonyAgentTaskSnapshotRecord,
  SymphonyAgentToolCallRecord,
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
  buildPiResponseCards,
  mapPiResponseMetadata
} from "@/features/runs/model/agent-run-pi-response";

export type AgentRunTranscriptEntry =
  | {
      kind: "agent-message";
      itemId: string;
      recordedAt: string;
      status: string;
      text: string | null;
      preview: string;
      overflowId: string | null;
      files: AgentRunFileChip[];
      piMessage: PiResponseMetadata | null;
    }
  | {
      kind: "reasoning";
      itemId: string;
      recordedAt: string;
      status: string;
      text: string | null;
      preview: string;
      overflowId: string | null;
      segmentCount: number;
      piMessage: PiResponseMetadata | null;
    }
  | {
      kind: "pi-read-task";
      itemId: string;
      recordedAt: string;
      status: string;
      paths: string[];
      readCount: number;
      overflowId: string | null;
    }
  | {
      kind: "pi-edit-task";
      itemId: string;
      recordedAt: string;
      status: string;
      paths: string[];
      editCount: number;
      lineCount: number;
      firstChangedLine: number | null;
      diffText: string | null;
      overflowId: string | null;
    }
  | {
      kind: "pi-write-task";
      itemId: string;
      recordedAt: string;
      status: string;
      paths: string[];
      writeCount: number;
      lineCount: number;
      contentBytes: number | null;
      bytesWritten: number | null;
      overflowId: string | null;
    }
  | {
      kind: "pi-grep-task";
      itemId: string;
      recordedAt: string;
      status: string;
      queries: PiPatternTaskQuery[];
      grepCount: number;
      overflowId: string | null;
    }
  | {
      kind: "pi-find-task";
      itemId: string;
      recordedAt: string;
      status: string;
      queries: PiPatternTaskQuery[];
      findCount: number;
      overflowId: string | null;
    }
  | {
      kind: "command";
      itemId: string;
      recordedAt: string;
      status: string;
      command: string;
      exitCode: number | null;
      timeoutSeconds: number | null;
      duration: string;
      outputPreview: string;
      overflowId: string | null;
      files: AgentRunFileChip[];
    }
  | {
      kind: "tool-call";
      itemId: string;
      recordedAt: string;
      status: string;
      server: string;
      tool: string;
      argumentsText: string;
      resultPreview: string;
      overflowId: string | null;
      errorMessage: string | null;
      duration: string;
      files: AgentRunFileChip[];
    }
  | {
      kind: "todo-list";
      itemId: string;
      recordedAt: string;
      status: string;
      markdown: string;
      overflowId: string | null;
      files: AgentRunFileChip[];
    }
  | {
      kind: "generic";
      itemId: string;
      recordedAt: string;
      status: string;
      itemType: string;
      preview: string;
      overflowId: string | null;
      files: AgentRunFileChip[];
    };

export type AgentRunFileChip = {
  path: string;
  changeKind: string;
};

export type PiPatternTaskQuery = {
  pattern: string;
  path: string | null;
  ignoreCase?: boolean | null;
};

export type PiResponseMetadata = {
  responseId: string | null;
  api: string | null;
  provider: string | null;
  model: string | null;
  stopReason: string | null;
  responseTimestamp: string | null;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number | null;
  outputTokens: number;
  totalTokens: number;
};

type PiEditBlock = {
  oldText: string;
  newText: string;
};

export type AgentRunTranscriptTurn = {
  turnId: string;
  turnSequence: number;
  promptText: string;
  startedAt: string;
  endedAt: string;
  status: string;
  tokenSummary: string;
  countsSummary: string;
  commandCount: number;
  toolCount: number;
  reasoningCount: number;
  activitySummary: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
  entries: AgentRunTranscriptEntry[];
};

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
        detail: `In ${formatCount(effectiveInputTokens)} / Cached ${formatCount(
          effectiveCachedInputTokens
        )} / Out ${formatCount(effectiveOutputTokens)}`
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

function buildTranscriptTurns(
  runArtifacts: SymphonyAgentRunArtifactsResult,
  forensicsTurns: SymphonyForensicsRunDetailResult["turns"]
): AgentRunTranscriptTurn[] {
  const agentMessageMap = new Map(
    runArtifacts.agentMessages.map((message) => [message.itemId, message] as const)
  );
  const reasoningMap = new Map(
    runArtifacts.reasoning.map((reasoning) => [reasoning.itemId, reasoning] as const)
  );
  const commandMap = new Map(
    runArtifacts.commandExecutions.map((command) => [command.itemId, command] as const)
  );
  const toolMap = new Map(
    runArtifacts.toolCalls.map((tool) => [tool.itemId, tool] as const)
  );
  const fileChangeMap = groupFileChangesByItem(runArtifacts.fileChanges);
  const taskSnapshotMap = groupTaskSnapshotsByItem(runArtifacts.taskSnapshots);
  const turnActivityMap = new Map(
    runArtifacts.turnActivities.map((activity) => [activity.turnId, activity] as const)
  );
  const turnTokenMap = new Map(
    buildAgentTurnTokenRows({
      runArtifacts,
      forensicsTurns
    }).map((row) => [row.turnId, row] as const)
  );

  const forensicsTurnMap = new Map(
    forensicsTurns.map((turn) => [turn.turnId, turn] as const)
  );

  return runArtifacts.turns
    .slice()
    .sort(
      (left, right) =>
        (forensicsTurnMap.get(left.turnId)?.turnSequence ?? Number.MAX_SAFE_INTEGER) -
        (forensicsTurnMap.get(right.turnId)?.turnSequence ?? Number.MAX_SAFE_INTEGER)
    )
    .map((turn, index) => {
      const forensicsTurn = forensicsTurnMap.get(turn.turnId);
      const turnActivity = turnActivityMap.get(turn.turnId) ?? null;
      const turnTokens = turnTokenMap.get(turn.turnId) ?? null;

      return {
        turnId: turn.turnId,
        turnSequence: forensicsTurn?.turnSequence ?? index + 1,
        promptText: forensicsTurn?.promptText ?? `Turn ${index + 1}`,
        startedAt: formatTimestamp(turn.startedAt),
        endedAt: formatTimestamp(turn.endedAt),
        status: formatStatusLabel(turn.status),
        commandCount: turn.commandCount,
        toolCount: turn.toolCallCount,
        reasoningCount: turn.reasoningCount,
        tokenSummary: turnTokens
          ? `In ${formatCount(turnTokens.inputTokens)} / Cached ${formatCount(
              turnTokens.cachedInputTokens
            )} / Out ${formatCount(turnTokens.outputTokens)}`
          : "Usage unavailable",
        countsSummary: buildTurnCountsSummary(
          turn,
          turnActivity?.taskSnapshots.length ?? 0
        ),
        activitySummary: buildTurnActivitySummary(turnActivity),
        entries: compactTranscriptEntries(
          runArtifacts.items
            .filter((item) => item.turnId === turn.turnId)
            .slice()
            .sort((left, right) => compareAscending(itemRecordedAt(left), itemRecordedAt(right)))
            .map((item) =>
              mapTranscriptEntry({
                item,
                agentMessage: agentMessageMap.get(item.itemId) ?? null,
                reasoning: reasoningMap.get(item.itemId) ?? null,
                command: commandMap.get(item.itemId) ?? null,
                toolCall: toolMap.get(item.itemId) ?? null,
                taskSnapshot: taskSnapshotMap.get(item.itemId) ?? null,
                fileChanges: fileChangeMap.get(item.itemId) ?? []
              })
            )
        )
      };
    });
}

function buildTurnCountsSummary(
  turn: SymphonyAgentRunArtifactsResult["turns"][number],
  taskSnapshotCount: number
): string {
  const parts = [
    `${formatCount(turn.commandCount)} commands`,
    `${formatCount(turn.toolCallCount)} tools`
  ];

  if (turn.reasoningCount > 0) {
    parts.push(`${formatCount(turn.reasoningCount)} reasoning`);
  }

  if (taskSnapshotCount > 0) {
    parts.push(`${formatCount(taskSnapshotCount)} task updates`);
  }

  return parts.join(" · ");
}

function buildTurnActivitySummary(
  turnActivity: SymphonyAgentTurnActivityRecord | null
): AgentRunTranscriptTurn["activitySummary"] {
  const cards: AgentRunTranscriptTurn["activitySummary"] = [];

  if (turnActivity?.taskSnapshots.length) {
    const latestSnapshot = [...turnActivity.taskSnapshots].sort((left, right) =>
      compareAscending(left.recordedAt, right.recordedAt)
    )[turnActivity.taskSnapshots.length - 1];

    if (latestSnapshot) {
      const stateCounts = countTaskStates(latestSnapshot);
      const detailParts = [`${formatCount(turnActivity.taskSnapshots.length)} updates`];

      if (stateCounts.in_progress > 0) {
        detailParts.push(`${formatCount(stateCounts.in_progress)} in progress`);
      }

      if (stateCounts.completed > 0) {
        detailParts.push(`${formatCount(stateCounts.completed)} completed`);
      }

      if (stateCounts.pending > 0) {
        detailParts.push(`${formatCount(stateCounts.pending)} pending`);
      }

      if (stateCounts.cancelled > 0) {
        detailParts.push(`${formatCount(stateCounts.cancelled)} cancelled`);
      }

      cards.push({
        label: "Task queue",
        value: `${formatCount(latestSnapshot.items.length)} tasks`,
        detail: detailParts.join(" · ")
      });
    }
  }

  return cards;
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


function mapTranscriptEntry(input: {
  item: SymphonyAgentItemRecord;
  agentMessage: SymphonyAgentMessageRecord | null;
  reasoning: SymphonyAgentReasoningBlockRecord | null;
  command: SymphonyAgentCommandExecutionRecord | null;
  toolCall: SymphonyAgentToolCallRecord | null;
  taskSnapshot: SymphonyAgentTaskSnapshotRecord | null;
  fileChanges: SymphonyAgentFileChangeRecord[];
}): AgentRunTranscriptEntry | null {
  const recordedAt = formatTimestamp(itemRecordedAt(input.item));
  const status = formatTranscriptEntryStatus(input.item, input.taskSnapshot);
  const files = input.fileChanges.map((fileChange) => ({
    path: fileChange.path,
    changeKind: formatLabel(fileChange.changeKind)
  }));

  if (input.agentMessage) {
    return {
      kind: "agent-message",
      itemId: input.item.itemId,
      recordedAt,
      status,
      text: input.agentMessage.textContent,
      preview:
        input.agentMessage.textContent ??
        input.agentMessage.textPreview ??
        input.item.latestPreview ??
        "Assistant message",
      overflowId: input.agentMessage.textOverflowId,
      files,
      piMessage: mapPiResponseMetadata(input.agentMessage.piMessage)
    };
  }

  if (input.reasoning) {
    return {
      kind: "reasoning",
      itemId: input.item.itemId,
      recordedAt,
      status,
      text: input.reasoning.textContent,
      preview:
        input.reasoning.textContent ??
        input.reasoning.textPreview ??
        input.item.latestPreview ??
        "Reasoning trace",
      overflowId: input.reasoning.textOverflowId,
      segmentCount: 1,
      piMessage: mapPiResponseMetadata(input.reasoning.piMessage)
    };
  }

  if (input.command) {
    return {
      kind: "command",
      itemId: input.item.itemId,
      recordedAt,
      status,
      command: input.command.command,
      exitCode: input.command.exitCode,
      timeoutSeconds: input.command.timeoutSeconds,
      duration: formatNullableDuration(input.command.durationMs),
      outputPreview:
        input.command.outputPreview ??
        input.item.latestPreview ??
        "Command output unavailable",
      overflowId: input.command.outputOverflowId,
      files
    };
  }

  if (input.toolCall) {
    if (input.toolCall.server === "pi" && input.toolCall.tool === "read") {
      return {
        kind: "pi-read-task",
        itemId: input.item.itemId,
        recordedAt,
        status,
        paths:
          input.toolCall.piRead?.path !== undefined
            ? [input.toolCall.piRead.path]
            : extractPiReadPaths(input.toolCall.argumentsJson),
        readCount: 1,
        overflowId: input.toolCall.resultOverflowId
      };
    }

    if (input.toolCall.server === "pi" && input.toolCall.tool === "edit") {
      const typedEdits = input.toolCall.piEdit?.edits ?? extractPiEditBlocks(
        input.toolCall.argumentsJson
      );

      return {
        kind: "pi-edit-task",
        itemId: input.item.itemId,
        recordedAt,
        status,
        paths:
          input.toolCall.piEdit?.path !== undefined
            ? [input.toolCall.piEdit.path]
            : extractPiEditPaths(input.toolCall.argumentsJson),
        editCount: 1,
        lineCount:
          input.toolCall.piEdit?.lineCount ?? countPiEditLines(typedEdits),
        firstChangedLine: input.toolCall.piEdit?.firstChangedLine ?? null,
        diffText:
          input.toolCall.piEdit?.diffPreview ?? buildPiEditDiff(typedEdits),
        overflowId:
          input.toolCall.piEdit?.diffOverflowId ??
          input.toolCall.resultOverflowId
      };
    }

    if (input.toolCall.server === "pi" && input.toolCall.tool === "write") {
      return {
        kind: "pi-write-task",
        itemId: input.item.itemId,
        recordedAt,
        status,
        paths:
          input.toolCall.piWrite?.path !== undefined
            ? [input.toolCall.piWrite.path]
            : extractPiWritePaths(input.toolCall.argumentsJson),
        writeCount: 1,
        lineCount:
          input.toolCall.piWrite?.lineCount ??
          extractPiWriteLineCount(input.toolCall.argumentsJson),
        contentBytes: input.toolCall.piWrite?.contentBytes ?? null,
        bytesWritten: input.toolCall.piWrite?.bytesWritten ?? null,
        overflowId: input.toolCall.resultOverflowId
      };
    }

    if (input.toolCall.server === "pi" && input.toolCall.tool === "grep") {
      return {
        kind: "pi-grep-task",
        itemId: input.item.itemId,
        recordedAt,
        status,
        queries:
          input.toolCall.piGrep !== undefined
            ? [
                {
                  pattern: input.toolCall.piGrep.pattern,
                  path: input.toolCall.piGrep.path,
                  ignoreCase: input.toolCall.piGrep.ignoreCase
                }
              ]
            : extractPiGrepQueries(input.toolCall.argumentsJson),
        grepCount: 1,
        overflowId: input.toolCall.resultOverflowId
      };
    }

    if (input.toolCall.server === "pi" && input.toolCall.tool === "find") {
      return {
        kind: "pi-find-task",
        itemId: input.item.itemId,
        recordedAt,
        status,
        queries:
          input.toolCall.piFind !== undefined
            ? [
                {
                  pattern: input.toolCall.piFind.pattern,
                  path: input.toolCall.piFind.path
                }
              ]
            : extractPiFindQueries(input.toolCall.argumentsJson),
        findCount: 1,
        overflowId: input.toolCall.resultOverflowId
      };
    }

    return {
      kind: "tool-call",
      itemId: input.item.itemId,
      recordedAt,
      status,
      server: input.toolCall.server,
      tool: input.toolCall.tool,
      argumentsText: JSON.stringify(input.toolCall.argumentsJson, null, 2),
      resultPreview:
        input.toolCall.resultPreview ??
        input.item.latestPreview ??
        "Tool result unavailable",
      overflowId: input.toolCall.resultOverflowId,
      errorMessage: input.toolCall.errorMessage,
      duration: formatNullableDuration(input.toolCall.durationMs),
      files
    };
  }

  if (input.item.itemType === "todo_list") {
    return {
      kind: "todo-list",
      itemId: input.item.itemId,
      recordedAt,
      status,
      markdown:
        input.taskSnapshot !== null
          ? formatTaskSnapshotMarkdown(input.taskSnapshot)
          : formatTodoListMarkdown(
              input.item.latestPreview ?? "No todo items were captured."
            ),
      overflowId: input.item.latestOverflowId,
      files
    };
  }

  if (input.item.itemType === "file_change") {
    return null;
  }

  return {
    kind: "generic",
    itemId: input.item.itemId,
    recordedAt,
    status,
    itemType: formatLabel(input.item.itemType),
    preview: input.item.latestPreview ?? formatLabel(input.item.itemType),
    overflowId: input.item.latestOverflowId,
    files
  };
}

function groupFileChangesByItem(fileChanges: SymphonyAgentFileChangeRecord[]) {
  const map = new Map<string, SymphonyAgentFileChangeRecord[]>();

  for (const fileChange of fileChanges) {
    const group = map.get(fileChange.itemId);

    if (group) {
      group.push(fileChange);
      continue;
    }

    map.set(fileChange.itemId, [fileChange]);
  }

  return map;
}

function groupTaskSnapshotsByItem(taskSnapshots: SymphonyAgentTaskSnapshotRecord[]) {
  const map = new Map<string, SymphonyAgentTaskSnapshotRecord>();

  for (const snapshot of taskSnapshots) {
    const previous = map.get(snapshot.itemId);

    if (!previous) {
      map.set(snapshot.itemId, snapshot);
      continue;
    }

    if (compareAscending(previous.recordedAt, snapshot.recordedAt) <= 0) {
      map.set(snapshot.itemId, snapshot);
    }
  }

  return map;
}

function itemRecordedAt(item: SymphonyAgentItemRecord): string {
  return (
    item.startedAt ??
    item.completedAt ??
    item.lastUpdatedAt ??
    item.updatedAt ??
    item.insertedAt
  );
}

function formatNullableDuration(durationMs: number | null): string {
  return durationMs === null ? "In progress" : formatDuration(durationMs / 1000);
}

function formatLaunchTargetLabel(
  value: SymphonyForensicsRunDetailResult["run"]["launchTarget"]
): string {
  if (!value) {
    return "Unavailable";
  }

  return [value.kind, value.containerName, value.runtimeWorkspacePath].join(" / ");
}

function formatTranscriptEntryStatus(
  item: SymphonyAgentItemRecord,
  taskSnapshot: SymphonyAgentTaskSnapshotRecord | null
): string {
  return formatStatusLabel(
    deriveTaskSnapshotLifecycleStatus(taskSnapshot) ?? item.finalStatus ?? "in_progress"
  );
}

function deriveTaskSnapshotLifecycleStatus(
  taskSnapshot: SymphonyAgentTaskSnapshotRecord | null
): "completed" | "in_progress" | null {
  if (!taskSnapshot || taskSnapshot.items.length === 0) {
    return null;
  }

  return taskSnapshot.items.every(
    (item) => item.state === "completed" || item.state === "cancelled"
  )
    ? "completed"
    : "in_progress";
}

function formatRepoSnapshot(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

function formatTodoListMarkdown(value: string): string {
  const items = value
    .split(/\s*;\s*/g)
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length === 0) {
    return value;
  }

  return items
    .map((item) => {
      const normalized = item
        .replace(/^\[(x|X)\]/, "[x]")
        .replace(/^\[\s\]/, "[ ]")
        .trim();

      if (/^\[(?:x| )\]\s+/i.test(normalized)) {
        return normalized;
      }

      return `- ${normalized}`;
    })
    .join("\n");
}

function formatTaskSnapshotMarkdown(snapshot: SymphonyAgentTaskSnapshotRecord): string {
  if (snapshot.items.length === 0) {
    return "No task items were captured.";
  }

  const sections = new Map<string, Array<SymphonyAgentTaskSnapshotRecord["items"][number]>>();
  const unsectioned: Array<SymphonyAgentTaskSnapshotRecord["items"][number]> = [];

  for (const item of snapshot.items) {
    if (!item.section) {
      unsectioned.push(item);
      continue;
    }

    const group = sections.get(item.section);
    if (group) {
      group.push(item);
      continue;
    }

    sections.set(item.section, [item]);
  }

  const lines: string[] = [];

  for (const [section, items] of sections.entries()) {
    lines.push(`**${formatTaskSectionLabel(section)}**`);
    lines.push(...items.map(formatTaskSnapshotItemMarkdown));
    lines.push("");
  }

  if (unsectioned.length > 0) {
    lines.push(...unsectioned.map(formatTaskSnapshotItemMarkdown));
  }

  return lines.join("\n").trim();
}

function formatTaskSectionLabel(section: string): string {
  switch (section) {
    case "follow_up":
      return "Follow-up";
    case "steering":
      return "Steering";
    default:
      return formatLabel(section);
  }
}

function formatTaskSnapshotItemMarkdown(
  item: SymphonyAgentTaskSnapshotRecord["items"][number]
): string {
  switch (item.state) {
    case "completed":
      return `- [x] ${item.label}`;
    case "in_progress":
      return `- In progress: ${item.label}`;
    case "cancelled":
      return `- Cancelled: ${item.label}`;
    case "pending":
    default:
      return `- [ ] ${item.label}`;
  }
}

function countTaskStates(snapshot: SymphonyAgentTaskSnapshotRecord) {
  const counts = {
    pending: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0
  };

  for (const item of snapshot.items) {
    switch (item.state) {
      case "in_progress":
        counts.in_progress += 1;
        break;
      case "completed":
        counts.completed += 1;
        break;
      case "cancelled":
        counts.cancelled += 1;
        break;
      case "pending":
      default:
        counts.pending += 1;
        break;
    }
  }

  return counts;
}

function compareAscending(left: string, right: string): number {
  return new Date(left).getTime() - new Date(right).getTime();
}

function compareDescending(left: string | null, right: string | null): number {
  return new Date(right ?? 0).getTime() - new Date(left ?? 0).getTime();
}

function compactTranscriptEntries(
  entries: Array<AgentRunTranscriptEntry | null>
): AgentRunTranscriptEntry[] {
  const compacted: AgentRunTranscriptEntry[] = [];

  for (const entry of entries) {
    if (entry === null) {
      continue;
    }

    const previous = compacted[compacted.length - 1];

    if (previous?.kind === "pi-read-task" && entry.kind === "pi-read-task") {
      compacted[compacted.length - 1] = {
        ...previous,
        recordedAt: entry.recordedAt,
        status: entry.status,
        paths: uniquePaths([...previous.paths, ...entry.paths]),
        readCount: previous.readCount + entry.readCount,
        overflowId:
          previous.overflowId !== null && previous.overflowId === entry.overflowId
            ? previous.overflowId
            : null
      };
      continue;
    }

    if (previous?.kind === "pi-edit-task" && entry.kind === "pi-edit-task") {
      compacted[compacted.length - 1] = {
        ...previous,
        recordedAt: entry.recordedAt,
        status: entry.status,
        paths: uniquePaths([...previous.paths, ...entry.paths]),
        editCount: previous.editCount + entry.editCount,
        lineCount: previous.lineCount + entry.lineCount,
        diffText: joinTranscriptText(previous.diffText, entry.diffText),
        overflowId:
          previous.overflowId !== null && previous.overflowId === entry.overflowId
            ? previous.overflowId
            : null
      };
      continue;
    }

    if (previous?.kind === "pi-write-task" && entry.kind === "pi-write-task") {
      compacted[compacted.length - 1] = {
        ...previous,
        recordedAt: entry.recordedAt,
        status: entry.status,
        paths: uniquePaths([...previous.paths, ...entry.paths]),
        writeCount: previous.writeCount + entry.writeCount,
        lineCount: previous.lineCount + entry.lineCount,
        overflowId:
          previous.overflowId !== null && previous.overflowId === entry.overflowId
            ? previous.overflowId
            : null
      };
      continue;
    }

    if (previous?.kind === "pi-grep-task" && entry.kind === "pi-grep-task") {
      compacted[compacted.length - 1] = {
        ...previous,
        recordedAt: entry.recordedAt,
        status: entry.status,
        queries: uniquePiPatternQueries([...previous.queries, ...entry.queries]),
        grepCount: previous.grepCount + entry.grepCount,
        overflowId:
          previous.overflowId !== null && previous.overflowId === entry.overflowId
            ? previous.overflowId
            : null
      };
      continue;
    }

    if (previous?.kind === "pi-find-task" && entry.kind === "pi-find-task") {
      compacted[compacted.length - 1] = {
        ...previous,
        recordedAt: entry.recordedAt,
        status: entry.status,
        queries: uniquePiPatternQueries([...previous.queries, ...entry.queries]),
        findCount: previous.findCount + entry.findCount,
        overflowId:
          previous.overflowId !== null && previous.overflowId === entry.overflowId
            ? previous.overflowId
            : null
      };
      continue;
    }

    if (previous?.kind === "reasoning" && entry.kind === "reasoning") {
      compacted[compacted.length - 1] = {
        ...previous,
        recordedAt: entry.recordedAt,
        status: entry.status,
        text: joinTranscriptText(previous.text, entry.text),
        preview: joinTranscriptText(previous.preview, entry.preview) ?? previous.preview,
        overflowId:
          previous.overflowId !== null && previous.overflowId === entry.overflowId
            ? previous.overflowId
            : null,
        segmentCount: previous.segmentCount + entry.segmentCount
      };
      continue;
    }

    if (previous?.kind === "todo-list" && entry.kind === "todo-list") {
      compacted[compacted.length - 1] = entry;
      continue;
    }

    compacted.push(entry);
  }

  return compacted;
}

function joinTranscriptText(
  left: string | null,
  right: string | null
): string | null {
  if (left && right) {
    return `${left}\n\n${right}`;
  }

  return left ?? right;
}

function extractPiEditPaths(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const record = value as Record<string, unknown>;
  const scalarPath = getStringValue(record.path) ?? getStringValue(record.file_path);

  if (scalarPath) {
    return [scalarPath];
  }

  return [];
}

function extractPiEditBlocks(value: unknown): PiEditBlock[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const edits = (value as Record<string, unknown>).edits;

  if (!Array.isArray(edits)) {
    return [];
  }

  return edits.flatMap((edit) => {
    if (!edit || typeof edit !== "object" || Array.isArray(edit)) {
      return [];
    }

    const record = edit as Record<string, unknown>;
    const oldText = getAliasedStringValue(record, [
      "oldText",
      "old_text",
      "oldString",
      "old_string"
    ]);
    const newText = getAliasedStringValue(record, [
      "newText",
      "new_text",
      "newString",
      "new_string"
    ]);

    if (oldText === null || newText === null) {
      return [];
    }

    return [{ oldText, newText }];
  });
}

function extractPiWriteLineCount(value: unknown): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return 1;
  }

  const content = getAliasedStringValue(value as Record<string, unknown>, [
    "content",
    "text",
    "fileText",
    "file_text"
  ]);
  return content === null ? 1 : countTextLines(content);
}

function countPiEditLines(edits: PiEditBlock[]): number {
  return edits.reduce((total, edit) => {
    const oldLineCount = countTextLines(edit.oldText);
    const newLineCount = countTextLines(edit.newText);

    return total + Math.max(oldLineCount, newLineCount, 1);
  }, 0);
}

function countTextLines(value: string): number {
  if (value === "") {
    return 0;
  }

  return value.split("\n").length;
}

function buildPiEditDiff(edits: PiEditBlock[]): string | null {
  if (edits.length === 0) {
    return null;
  }

  return edits
    .map((edit, index) => {
      const oldLines = edit.oldText === "" ? [] : edit.oldText.split("\n");
      const newLines = edit.newText === "" ? [] : edit.newText.split("\n");

      return [
        `@@ edit ${index + 1} @@`,
        ...oldLines.map((line) => `-${line}`),
        ...newLines.map((line) => `+${line}`)
      ].join("\n");
    })
    .join("\n\n");
}

function extractPiWritePaths(value: unknown): string[] {
  return extractPiEditPaths(value);
}

function extractPiGrepQueries(value: unknown): PiPatternTaskQuery[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const record = value as Record<string, unknown>;
  const pattern = getStringValue(record.pattern);

  if (!pattern) {
    return [];
  }

  return [
    {
      pattern,
      path: getStringValue(record.path) ?? getStringValue(record.search_path),
      ignoreCase: getBooleanValue(record.ignoreCase) ?? getBooleanValue(record.ignore_case)
    }
  ];
}

function extractPiFindQueries(value: unknown): PiPatternTaskQuery[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const record = value as Record<string, unknown>;
  const pattern =
    getStringValue(record.pattern) ??
    getStringValue(record.name) ??
    getStringValue(record.glob);

  if (!pattern) {
    return [];
  }

  return [
    {
      pattern,
      path: getStringValue(record.path) ?? getStringValue(record.search_path)
    }
  ];
}

function extractPiReadPaths(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const record = value as Record<string, unknown>;
  const scalarPath = getStringValue(record.path) ?? getStringValue(record.file_path);

  if (scalarPath) {
    return [scalarPath];
  }

  const paths = record.paths;
  if (Array.isArray(paths)) {
    return uniquePaths(
      paths
        .map((entry) => (typeof entry === "string" ? entry : null))
        .filter((entry): entry is string => entry !== null)
    );
  }

  return [];
}

function getStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function getAliasedStringValue(
  record: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = getStringValue(record[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function getBooleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)].sort((left, right) => left.localeCompare(right));
}

function uniquePiPatternQueries(queries: PiPatternTaskQuery[]): PiPatternTaskQuery[] {
  const seen = new Set<string>();
  const deduped: PiPatternTaskQuery[] = [];

  for (const query of queries) {
    const key = `${query.pattern}\u0000${query.path ?? ""}\u0000${query.ignoreCase ?? ""}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(query);
  }

  return deduped.sort((left, right) =>
    `${left.pattern}:${left.path ?? ""}`.localeCompare(`${right.pattern}:${right.path ?? ""}`)
  );
}
