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
  formatTimestamp
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
      kind: "command";
      itemId: string;
      recordedAt: string;
      status: string;
      command: string;
      exitCode: number | null;
      duration: string;
      outputPreview: string;
      overflowId: string | null;
      files: AgentRunFileChip[];
    }
  | {
      kind: "file-change";
      itemId: string;
      recordedAt: string;
      status: string;
      summary: string;
      changes: AgentRunFileChip[];
      overflowId: string | null;
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

export type AgentRunTranscriptTurn = {
  turnId: string;
  turnSequence: number;
  promptText: string;
  startedAt: string;
  endedAt: string;
  status: string;
  tokenSummary: string;
  countsSummary: string;
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
  executionPerformance: {
    cards: Array<{
      label: string;
      value: string;
      detail: string;
    }>;
    commandRows: Array<{
      label: string;
      family: string;
      duration: string;
      status: string;
    }>;
    toolRows: Array<{
      label: string;
      duration: string;
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

  return {
    harnessLabel,
    issueIdentifier: input.runDetail.issue.issueIdentifier,
    runId: run.runId,
    runTitle: `${input.runDetail.issue.issueIdentifier} · ${run.runId}`,
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
        value: formatCount(agentRun?.totalTokens ?? run.totalTokens),
        detail: `In ${formatCount(agentRun?.inputTokens ?? run.inputTokens)} / Out ${formatCount(
          agentRun?.outputTokens ?? run.outputTokens
        )}`
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
        detail: `${formatCount(agentRun?.reasoningCount ?? 0)} reasoning blocks`
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
        label: "PI thread",
        value:
          input.runDetail.run.threadId ??
          agentRun?.threadId ??
          "Unavailable"
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
    executionPerformance,
    turnLatency,
    turnTokens,
    transcriptTurns,
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

      return {
        turnId: turn.turnId,
        turnSequence: forensicsTurn?.turnSequence ?? index + 1,
        promptText: forensicsTurn?.promptText ?? `Turn ${index + 1}`,
        startedAt: formatTimestamp(turn.startedAt),
        endedAt: formatTimestamp(turn.endedAt),
        status: formatStatusLabel(turn.status),
        tokenSummary:
          turn.usage === null
            ? "Usage unavailable"
            : `In ${formatCount(turn.usage.input_tokens)} / Cached ${formatCount(
                turn.usage.cached_input_tokens
              )} / Out ${formatCount(turn.usage.output_tokens)}`,
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
    `${formatCount(turn.toolCallCount)} tools`,
    `${formatCount(turn.fileChangeCount)} file changes`
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

  const uniqueFiles = uniqueTurnFileChanges(turnActivity?.fileChanges ?? []);
  if (uniqueFiles.length > 0) {
    cards.push({
      label: "Files touched",
      value: `${formatCount(uniqueFiles.length)} files`,
      detail: formatTurnFileChangeDetail(uniqueFiles)
    });
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
  const slowestCommand = [...commandExecutions].sort(
    (left, right) => safeDurationMs(right.durationMs) - safeDurationMs(left.durationMs)
  )[0];
  const slowestTool = [...toolCalls].sort(
    (left, right) => safeDurationMs(right.durationMs) - safeDurationMs(left.durationMs)
  )[0];

  return {
    cards: [
      {
        label: "Commands observed",
        value: formatCount(commandExecutions.length),
        detail: `${formatCount(failedCommands.length)} failed or degraded command executions.`
      },
      {
        label: "Tool calls observed",
        value: formatCount(toolCalls.length),
        detail: `${formatCount(failedTools.length)} failed or degraded tool calls.`
      },
      {
        label: "Slowest command",
        value: slowestCommand
          ? classifyCommand(slowestCommand.command).displayLabel
          : "n/a",
        detail: slowestCommand
          ? `${formatDurationMilliseconds(safeDurationMs(slowestCommand.durationMs))} · ${formatCommandFamilyLabel(classifyCommand(slowestCommand.command).family)}`
          : "No command executions were captured for this run."
      },
      {
        label: "Slowest tool",
        value: slowestTool ? `${slowestTool.server}.${slowestTool.tool}` : "n/a",
        detail: slowestTool
          ? `${formatDurationMilliseconds(safeDurationMs(slowestTool.durationMs))} · ${formatStatusLabel(slowestTool.status)}`
          : "No tool calls were captured for this run."
      }
    ],
    commandRows: [...commandExecutions]
      .sort((left, right) => safeDurationMs(right.durationMs) - safeDurationMs(left.durationMs))
      .slice(0, 4)
      .map((command) => {
        const classification = classifyCommand(command.command);

        return {
          label: command.command,
          family: formatCommandFamilyLabel(classification.family),
          duration: formatDurationMilliseconds(safeDurationMs(command.durationMs)),
          status: formatStatusLabel(command.status)
        };
      }),
    toolRows: [...toolCalls]
      .sort((left, right) => safeDurationMs(right.durationMs) - safeDurationMs(left.durationMs))
      .slice(0, 4)
      .map((tool) => ({
        label: `${tool.server}.${tool.tool}`,
        duration: formatDurationMilliseconds(safeDurationMs(tool.durationMs)),
        status: formatStatusLabel(tool.status)
      }))
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
  const cachedShare = totals.inputTokens === 0 ? 0 : totals.cachedInputTokens / totals.inputTokens;

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
}): AgentRunTranscriptEntry {
  const recordedAt = formatTimestamp(itemRecordedAt(input.item));
  const status = formatStatusLabel(input.item.finalStatus ?? "in_progress");
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
      files
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
      segmentCount: 1
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
        paths: extractPiReadPaths(input.toolCall.argumentsJson),
        readCount: 1,
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

  if (input.item.itemType === "file_change") {
    return {
      kind: "file-change",
      itemId: input.item.itemId,
      recordedAt,
      status,
      summary: formatFileChangeSummary(input.fileChanges),
      changes: files,
      overflowId: input.item.latestOverflowId
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

function formatFileChangeSummary(fileChanges: SymphonyAgentFileChangeRecord[]): string {
  if (fileChanges.length === 0) {
    return "File changes captured.";
  }

  if (fileChanges.length === 1) {
    return fileChanges[0]?.path ?? "1 file changed";
  }

  return `${formatCount(fileChanges.length)} files changed`;
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

function uniqueTurnFileChanges(fileChanges: SymphonyAgentFileChangeRecord[]) {
  const map = new Map<string, SymphonyAgentFileChangeRecord>();

  for (const fileChange of fileChanges) {
    const previous = map.get(fileChange.path);

    if (!previous || compareAscending(previous.recordedAt, fileChange.recordedAt) <= 0) {
      map.set(fileChange.path, fileChange);
    }
  }

  return [...map.values()].sort((left, right) =>
    compareTextAscending(left.path, right.path)
  );
}

function formatTurnFileChangeDetail(
  fileChanges: SymphonyAgentFileChangeRecord[]
): string {
  const preview = fileChanges.slice(0, 3).map((fileChange) => fileChange.path);
  const remaining = fileChanges.length - preview.length;

  if (remaining > 0) {
    return `${preview.join(" · ")} · +${formatCount(remaining)} more`;
  }

  return preview.join(" · ");
}

function compareAscending(left: string, right: string): number {
  return new Date(left).getTime() - new Date(right).getTime();
}

function compareTextAscending(left: string, right: string): number {
  return left.localeCompare(right);
}

function compareDescending(left: string | null, right: string | null): number {
  return new Date(right ?? 0).getTime() - new Date(left ?? 0).getTime();
}

function compactTranscriptEntries(
  entries: AgentRunTranscriptEntry[]
): AgentRunTranscriptEntry[] {
  const compacted: AgentRunTranscriptEntry[] = [];

  for (const entry of entries) {
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

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)].sort((left, right) => left.localeCompare(right));
}
