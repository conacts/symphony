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
  formatCount,
  formatDuration,
  formatTimestamp
} from "@/core/forensics-view-model";

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

  return {
    issueIdentifier: input.runDetail.issue.issueIdentifier,
    runId: run.runId,
    runTitle: `${input.runDetail.issue.issueIdentifier} · ${run.runId}`,
    statusSummary: `${workflowStatus} / ${workflowOutcome} · Codex ${codexStatus}`,
    failureSummary: codexFailureSummary,
    metrics: [
      {
        label: "Workflow",
        value: workflowStatus,
        detail: workflowOutcome
      },
      {
        label: "Codex",
        value: codexStatus,
        detail: run.codexFailureKind ?? codexRun?.failureKind ?? "healthy"
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
        label: "Provider",
        value: input.runDetail.run.codexProviderName ?? "Unavailable"
      },
      {
        label: "Auth",
        value: input.runDetail.run.codexAuthMode ?? "Unavailable"
      },
      {
        label: "Provider env",
        value: input.runDetail.run.codexProviderEnvKey ?? "Unavailable"
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
          eventType: event.eventType,
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
        status: turn.status,
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

function mapTranscriptEntry(input: {
  item: SymphonyCodexItemRecord;
  agentMessage: SymphonyCodexAgentMessageRecord | null;
  reasoning: SymphonyCodexReasoningRecord | null;
  command: SymphonyCodexCommandExecutionRecord | null;
  toolCall: SymphonyCodexToolCallRecord | null;
  fileChanges: SymphonyCodexFileChangeRecord[];
}): CodexRunTranscriptEntry {
  const recordedAt = formatTimestamp(itemRecordedAt(input.item));
  const status = input.item.finalStatus ?? "in_progress";
  const files = input.fileChanges.map((fileChange) => ({
    path: fileChange.path,
    changeKind: fileChange.changeKind
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

  return {
    kind: "generic",
    itemId: input.item.itemId,
    recordedAt,
    status,
    itemType: input.item.itemType,
    preview: input.item.latestPreview ?? input.item.itemType,
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

function compareAscending(left: string, right: string): number {
  return new Date(left).getTime() - new Date(right).getTime();
}

function compareDescending(left: string | null, right: string | null): number {
  return new Date(right ?? 0).getTime() - new Date(left ?? 0).getTime();
}
