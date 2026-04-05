import type {
  SymphonyCodexAgentMessageRecord,
  SymphonyCodexCommandExecutionRecord,
  SymphonyCodexFileChangeRecord,
  SymphonyCodexItemRecord,
  SymphonyCodexOverflowResult,
  SymphonyCodexReasoningRecord,
  SymphonyCodexRunArtifactsResult,
  SymphonyCodexToolCallRecord,
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
  buildCodexTurnLatencyRows,
  sumTurnLatencyTotals
} from "@/core/codex-latency";
import {
  buildCodexTurnTokenRows,
  sumTurnTokenTotals
} from "@/core/codex-token";

export type CodexRunTranscriptEntry =
  | {
      kind: "agent-message";
      itemId: string;
      recordedAt: string;
      status: string;
      text: string | null;
      preview: string;
      overflowId: string | null;
      files: CodexRunFileChip[];
    }
  | {
      kind: "reasoning";
      itemId: string;
      recordedAt: string;
      status: string;
      text: string | null;
      preview: string;
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
      files: CodexRunFileChip[];
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
      files: CodexRunFileChip[];
    }
  | {
      kind: "todo-list";
      itemId: string;
      recordedAt: string;
      status: string;
      markdown: string;
      overflowId: string | null;
      files: CodexRunFileChip[];
    }
  | {
      kind: "generic";
      itemId: string;
      recordedAt: string;
      status: string;
      itemType: string;
      preview: string;
      overflowId: string | null;
      files: CodexRunFileChip[];
    };

export type CodexRunFileChip = {
  path: string;
  changeKind: string;
};

export type CodexRunTranscriptTurn = {
  turnId: string;
  turnSequence: number;
  promptText: string;
  startedAt: string;
  endedAt: string;
  status: string;
  tokenSummary: string;
  countsSummary: string;
  entries: CodexRunTranscriptEntry[];
};

export type CodexRunViewModel = {
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
  transcriptTurns: CodexRunTranscriptTurn[];
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

export function buildCodexRunViewModel(input: {
  runDetail: SymphonyForensicsRunDetailResult;
  runArtifacts: SymphonyCodexRunArtifactsResult | null;
}): CodexRunViewModel {
  const runArtifacts = input.runArtifacts;
  const run = input.runDetail.run;
  const codexRun = runArtifacts?.run ?? null;
  const transcriptTurns = runArtifacts
    ? buildTranscriptTurns(runArtifacts, input.runDetail.turns)
    : [];
  const codexStatus = run.codexStatus ?? codexRun?.status ?? "Unavailable";
  const workflowStatus = run.status;
  const workflowOutcome = run.outcome ?? "n/a";
  const codexFailureSummary =
    run.codexFailureMessagePreview ??
    codexRun?.failureMessagePreview ??
    run.errorMessage ??
    null;
  const executionPerformance = buildExecutionPerformance(runArtifacts);
  const turnLatency = buildTurnLatency(runArtifacts, input.runDetail.turns);
  const turnTokens = buildTurnTokens(runArtifacts, input.runDetail.turns);

  return {
    issueIdentifier: input.runDetail.issue.issueIdentifier,
    runId: run.runId,
    runTitle: `${input.runDetail.issue.issueIdentifier} · ${run.runId}`,
    statusSummary: `${formatStatusLabel(workflowStatus)} / ${formatOutcomeLabel(workflowOutcome)} · Codex ${formatStatusLabel(codexStatus)}`,
    failureSummary: codexFailureSummary,
    metrics: [
      {
        label: "Workflow",
        value: formatStatusLabel(workflowStatus),
        detail: formatOutcomeLabel(workflowOutcome)
      },
      {
        label: "Codex",
        value: formatStatusLabel(codexStatus),
        detail: formatLabel(run.codexFailureKind ?? codexRun?.failureKind ?? "healthy")
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
        value: formatCount(codexRun?.totalTokens ?? run.totalTokens),
        detail: `In ${formatCount(codexRun?.inputTokens ?? run.inputTokens)} / Out ${formatCount(
          codexRun?.outputTokens ?? run.outputTokens
        )}`
      },
      {
        label: "Turns",
        value: formatCount(codexRun?.turnCount ?? run.turnCount),
        detail: `${formatCount(codexRun?.commandCount ?? 0)} commands / ${formatCount(
          codexRun?.toolCallCount ?? 0
        )} tools`
      },
      {
        label: "Messages",
        value: formatCount(codexRun?.agentMessageCount ?? 0),
        detail: `${formatCount(codexRun?.reasoningCount ?? 0)} reasoning blocks`
      }
    ],
    metadata: [
      {
        label: "Harness",
        value: formatLabel(input.runDetail.run.agentHarness ?? "Unavailable")
      },
      {
        label: "Model",
        value: input.runDetail.run.codexModel ?? "Unavailable"
      },
      {
        label: "Provider",
        value: input.runDetail.run.codexProviderName ?? "Unavailable"
      },
      {
        label: "Auth",
        value: formatAuthModeLabel(input.runDetail.run.codexAuthMode ?? "Unavailable")
      },
      {
        label: "Provider env",
        value: formatProviderEnvKeyLabel(
          input.runDetail.run.codexProviderEnvKey ?? "Unavailable"
        )
      },
      {
        label: "Thread",
        value:
          input.runDetail.run.codexThreadId ??
          codexRun?.threadId ??
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

export function formatOverflowContent(overflow: SymphonyCodexOverflowResult): string {
  if (overflow.overflow.contentText) {
    return overflow.overflow.contentText;
  }

  return JSON.stringify(overflow.overflow.contentJson, null, 2);
}

function buildTranscriptTurns(
  runArtifacts: SymphonyCodexRunArtifactsResult,
  forensicsTurns: SymphonyForensicsRunDetailResult["turns"]
): CodexRunTranscriptTurn[] {
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
        countsSummary: `${formatCount(turn.commandCount)} commands · ${formatCount(
          turn.toolCallCount
        )} tools · ${formatCount(turn.fileChangeCount)} file changes`,
        entries: runArtifacts.items
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
              fileChanges: fileChangeMap.get(item.itemId) ?? []
            })
          )
      };
    });
}

function buildExecutionPerformance(
  runArtifacts: SymphonyCodexRunArtifactsResult | null
): CodexRunViewModel["executionPerformance"] {
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
  runArtifacts: SymphonyCodexRunArtifactsResult | null,
  forensicsTurns: SymphonyForensicsRunDetailResult["turns"]
): CodexRunViewModel["turnLatency"] {
  const rows = runArtifacts
    ? buildCodexTurnLatencyRows({
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
        detail: "Turns with readable Codex timing data."
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
  runArtifacts: SymphonyCodexRunArtifactsResult | null,
  forensicsTurns: SymphonyForensicsRunDetailResult["turns"]
): CodexRunViewModel["turnTokens"] {
  const rows = runArtifacts
    ? buildCodexTurnTokenRows({
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
  item: SymphonyCodexItemRecord;
  agentMessage: SymphonyCodexAgentMessageRecord | null;
  reasoning: SymphonyCodexReasoningRecord | null;
  command: SymphonyCodexCommandExecutionRecord | null;
  toolCall: SymphonyCodexToolCallRecord | null;
  fileChanges: SymphonyCodexFileChangeRecord[];
}): CodexRunTranscriptEntry {
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
      overflowId: input.reasoning.textOverflowId
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
      markdown: formatTodoListMarkdown(
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

function groupFileChangesByItem(fileChanges: SymphonyCodexFileChangeRecord[]) {
  const map = new Map<string, SymphonyCodexFileChangeRecord[]>();

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

function itemRecordedAt(item: SymphonyCodexItemRecord): string {
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

function compareAscending(left: string, right: string): number {
  return new Date(left).getTime() - new Date(right).getTime();
}

function compareDescending(left: string | null, right: string | null): number {
  return new Date(right ?? 0).getTime() - new Date(left ?? 0).getTime();
}
