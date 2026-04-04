import type {
  SymphonyCodexRunArtifactsResult,
  SymphonyForensicsIssueDetailResult,
  SymphonyForensicsIssueListResult
} from "@symphony/contracts";
import { classifyCommand, formatCommandFamilyLabel } from "@/core/command-family";
import {
  formatCount,
  formatDurationMilliseconds,
  formatPercent,
  formatTimestamp
} from "@/core/display-formatters";

export type PerformanceAnalysisResource = {
  issueIndex: SymphonyForensicsIssueListResult;
  sampledRuns: Array<{
    issueIdentifier: string;
    run: SymphonyForensicsIssueDetailResult["runs"][number];
    artifacts: SymphonyCodexRunArtifactsResult;
  }>;
};

export type PerformanceAnalysisViewModel = {
  summaryCards: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
  commandFamilyRows: Array<{
    family: string;
    avgDurationMs: number;
    sampleCount: number;
    failureCount: number;
  }>;
  toolRows: Array<{
    toolLabel: string;
    avgDurationMs: number;
    sampleCount: number;
    failureCount: number;
  }>;
  hotspotRows: Array<{
    kind: string;
    label: string;
    scope: string;
    sampleCount: string;
    failureCount: string;
    avgDuration: string;
    maxDuration: string;
    lastSeen: string;
    runHref: string;
    issueHref: string;
  }>;
  spotlight: {
    slowestCommandFamily: string;
    slowestCommandFamilyDetail: string;
    flakiestCommandFamily: string;
    flakiestCommandFamilyDetail: string;
    slowestTool: string;
    slowestToolDetail: string;
    flakiestTool: string;
    flakiestToolDetail: string;
  };
};

type OperationAggregate = {
  kind: "command" | "tool";
  label: string;
  scope: string;
  sampleCount: number;
  failureCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
  latestRecordedAt: string | null;
  latestIssueIdentifier: string;
  latestRunId: string;
};

export function buildPerformanceAnalysisViewModel(
  input: PerformanceAnalysisResource
): PerformanceAnalysisViewModel {
  const commandFamilyMap = new Map<string, OperationAggregate>();
  const toolMap = new Map<string, OperationAggregate>();
  const hotspotMap = new Map<string, OperationAggregate>();

  for (const sampledRun of input.sampledRuns) {
    for (const command of sampledRun.artifacts.commandExecutions) {
      const classification = classifyCommand(command.command);
      updateAggregate(commandFamilyMap, classification.family, {
        kind: "command",
        label: formatCommandFamilyLabel(classification.family),
        scope: "command family",
        durationMs: command.durationMs ?? 0,
        failed: command.status !== "completed",
        recordedAt: command.completedAt ?? command.updatedAt,
        issueIdentifier: sampledRun.issueIdentifier,
        runId: sampledRun.run.runId
      });
      updateAggregate(hotspotMap, `command:${command.command}`, {
        kind: "command",
        label: command.command,
        scope: formatCommandFamilyLabel(classification.family),
        durationMs: command.durationMs ?? 0,
        failed: command.status !== "completed",
        recordedAt: command.completedAt ?? command.updatedAt,
        issueIdentifier: sampledRun.issueIdentifier,
        runId: sampledRun.run.runId
      });
    }

    for (const tool of sampledRun.artifacts.toolCalls) {
      const toolLabel = `${tool.server}.${tool.tool}`;

      updateAggregate(toolMap, toolLabel, {
        kind: "tool",
        label: toolLabel,
        scope: tool.server,
        durationMs: tool.durationMs ?? 0,
        failed: tool.status !== "completed",
        recordedAt: tool.completedAt ?? tool.updatedAt,
        issueIdentifier: sampledRun.issueIdentifier,
        runId: sampledRun.run.runId
      });
      updateAggregate(hotspotMap, `tool:${toolLabel}`, {
        kind: "tool",
        label: toolLabel,
        scope: tool.server,
        durationMs: tool.durationMs ?? 0,
        failed: tool.status !== "completed",
        recordedAt: tool.completedAt ?? tool.updatedAt,
        issueIdentifier: sampledRun.issueIdentifier,
        runId: sampledRun.run.runId
      });
    }
  }

  const commandFamilyRows = sortAggregates(commandFamilyMap)
    .slice(0, 8)
    .map((entry) => ({
      family: entry.label,
      avgDurationMs: averageDuration(entry),
      sampleCount: entry.sampleCount,
      failureCount: entry.failureCount
    }));
  const toolRows = sortAggregates(toolMap)
    .slice(0, 8)
    .map((entry) => ({
      toolLabel: entry.label,
      avgDurationMs: averageDuration(entry),
      sampleCount: entry.sampleCount,
      failureCount: entry.failureCount
    }));
  const hotspotRows = sortAggregates(hotspotMap)
    .slice(0, 10)
    .map((entry) => ({
      kind: entry.kind === "command" ? "Command" : "Tool",
      label: entry.label,
      scope: entry.scope,
      sampleCount: formatCount(entry.sampleCount),
      failureCount: formatCount(entry.failureCount),
      avgDuration: formatDurationMilliseconds(averageDuration(entry)),
      maxDuration: formatDurationMilliseconds(entry.maxDurationMs),
      lastSeen: formatTimestamp(entry.latestRecordedAt),
      runHref: `/runs/${entry.latestRunId}`,
      issueHref: `/issues/${entry.latestIssueIdentifier}`
    }));

  const commandCount = input.sampledRuns.reduce(
    (total, sampledRun) => total + sampledRun.artifacts.commandExecutions.length,
    0
  );
  const toolCount = input.sampledRuns.reduce(
    (total, sampledRun) => total + sampledRun.artifacts.toolCalls.length,
    0
  );
  const commandFailures = Array.from(commandFamilyMap.values()).reduce(
    (total, entry) => total + entry.failureCount,
    0
  );
  const toolFailures = Array.from(toolMap.values()).reduce(
    (total, entry) => total + entry.failureCount,
    0
  );
  const slowestCommandFamily = sortByAverageDuration(commandFamilyMap)[0];
  const flakiestCommandFamily = sortByFailureRate(commandFamilyMap)[0];
  const slowestTool = sortByAverageDuration(toolMap)[0];
  const flakiestTool = sortByFailureRate(toolMap)[0];

  return {
    summaryCards: [
      {
        label: "Sampled runs",
        value: formatCount(input.sampledRuns.length),
        detail: "Recent runs with readable Codex command and tool artifacts."
      },
      {
        label: "Command executions",
        value: formatCount(commandCount),
        detail: `${formatCount(commandFailures)} failed or degraded command steps.`
      },
      {
        label: "Tool calls",
        value: formatCount(toolCount),
        detail: `${formatCount(toolFailures)} failed or degraded tool calls.`
      },
      {
        label: "Command failure rate",
        value: formatPercent(commandCount === 0 ? 0 : commandFailures / commandCount),
        detail: "Share of command executions that did not complete cleanly."
      }
    ],
    commandFamilyRows,
    toolRows,
    hotspotRows,
    spotlight: {
      slowestCommandFamily: slowestCommandFamily?.label ?? "n/a",
      slowestCommandFamilyDetail: slowestCommandFamily
        ? `${formatDurationMilliseconds(averageDuration(slowestCommandFamily))} average across ${formatCount(slowestCommandFamily.sampleCount)} executions.`
        : "No command-family performance data is available yet.",
      flakiestCommandFamily: flakiestCommandFamily?.label ?? "n/a",
      flakiestCommandFamilyDetail: flakiestCommandFamily
        ? `${formatPercent(flakiestCommandFamily.failureCount / flakiestCommandFamily.sampleCount)} of sampled executions degraded.`
        : "No command-family failure data is available yet.",
      slowestTool: slowestTool?.label ?? "n/a",
      slowestToolDetail: slowestTool
        ? `${formatDurationMilliseconds(averageDuration(slowestTool))} average across ${formatCount(slowestTool.sampleCount)} calls.`
        : "No tool performance data is available yet.",
      flakiestTool: flakiestTool?.label ?? "n/a",
      flakiestToolDetail: flakiestTool
        ? `${formatPercent(flakiestTool.failureCount / flakiestTool.sampleCount)} of sampled calls degraded.`
        : "No tool failure data is available yet."
    }
  };
}

function updateAggregate(
  aggregates: Map<string, OperationAggregate>,
  key: string,
  input: {
    kind: "command" | "tool";
    label: string;
    scope: string;
    durationMs: number;
    failed: boolean;
    recordedAt: string | null;
    issueIdentifier: string;
    runId: string;
  }
) {
  const current = aggregates.get(key);

  if (current) {
    current.sampleCount += 1;
    current.failureCount += input.failed ? 1 : 0;
    current.totalDurationMs += input.durationMs;
    current.maxDurationMs = Math.max(current.maxDurationMs, input.durationMs);

    if ((input.recordedAt ?? "") >= (current.latestRecordedAt ?? "")) {
      current.latestRecordedAt = input.recordedAt;
      current.latestIssueIdentifier = input.issueIdentifier;
      current.latestRunId = input.runId;
    }

    return;
  }

  aggregates.set(key, {
    kind: input.kind,
    label: input.label,
    scope: input.scope,
    sampleCount: 1,
    failureCount: input.failed ? 1 : 0,
    totalDurationMs: input.durationMs,
    maxDurationMs: input.durationMs,
    latestRecordedAt: input.recordedAt,
    latestIssueIdentifier: input.issueIdentifier,
    latestRunId: input.runId
  });
}

function averageDuration(entry: OperationAggregate) {
  return entry.sampleCount === 0 ? 0 : entry.totalDurationMs / entry.sampleCount;
}

function sortAggregates(aggregates: Map<string, OperationAggregate>) {
  return Array.from(aggregates.values()).sort((left, right) => {
    if (right.failureCount !== left.failureCount) {
      return right.failureCount - left.failureCount;
    }

    if (averageDuration(right) !== averageDuration(left)) {
      return averageDuration(right) - averageDuration(left);
    }

    if (right.sampleCount !== left.sampleCount) {
      return right.sampleCount - left.sampleCount;
    }

    return left.label.localeCompare(right.label);
  });
}

function sortByAverageDuration(aggregates: Map<string, OperationAggregate>) {
  return Array.from(aggregates.values()).sort(
    (left, right) => averageDuration(right) - averageDuration(left)
  );
}

function sortByFailureRate(aggregates: Map<string, OperationAggregate>) {
  return Array.from(aggregates.values()).sort((left, right) => {
    const rightRate = right.sampleCount === 0 ? 0 : right.failureCount / right.sampleCount;
    const leftRate = left.sampleCount === 0 ? 0 : left.failureCount / left.sampleCount;

    if (rightRate !== leftRate) {
      return rightRate - leftRate;
    }

    if (right.failureCount !== left.failureCount) {
      return right.failureCount - left.failureCount;
    }

    return averageDuration(right) - averageDuration(left);
  });
}
