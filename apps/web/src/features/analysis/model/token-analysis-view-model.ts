import type { CodexAnalysisSampleResource } from "@/features/analysis/hooks/load-codex-analysis-sample";
import { buildCodexTurnTokenRows, sumTurnTokenTotals } from "@/core/codex-token";
import {
  formatCount,
  formatPercent,
  formatTimestamp
} from "@/core/display-formatters";

export type TokenAnalysisViewModel = {
  summaryCards: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
  tokenCards: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
  runTokenRows: Array<{
    runLabel: string;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  turnTokenRows: Array<{
    turnLabel: string;
    totalTokens: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
  }>;
  issueTokenRows: Array<{
    issueIdentifier: string;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  hotspotRows: Array<{
    scope: string;
    label: string;
    totalTokens: string;
    inputTokens: string;
    outputTokens: string;
    startedAt: string;
    runHref: string;
    issueHref: string;
  }>;
  spotlight: {
    heaviestRun: string;
    heaviestRunDetail: string;
    heaviestTurn: string;
    heaviestTurnDetail: string;
    hottestIssue: string;
    hottestIssueDetail: string;
  };
};

export function buildTokenAnalysisViewModel(
  input: CodexAnalysisSampleResource
): TokenAnalysisViewModel {
  const issueTotals = new Map<
    string,
    {
      issueIdentifier: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    }
  >();
  const turnRows = input.sampledRuns.flatMap((sampledRun) =>
    buildCodexTurnTokenRows({
      runArtifacts: sampledRun.artifacts
    })
  );
  const runTokenRows = input.sampledRuns
    .map((sampledRun, index) => ({
      runLabel: `Run ${index + 1} · ${sampledRun.run.runId.slice(0, 6)}`,
      totalTokens: sampledRun.run.totalTokens,
      inputTokens: sampledRun.run.inputTokens,
      outputTokens: sampledRun.run.outputTokens,
      issueIdentifier: sampledRun.issueIdentifier,
      startedAt: sampledRun.run.startedAt,
      runId: sampledRun.run.runId
    }))
    .sort((left, right) => right.totalTokens - left.totalTokens);

  for (const run of input.sampledRuns) {
    const current = issueTotals.get(run.issueIdentifier);

    if (current) {
      current.inputTokens += run.run.inputTokens;
      current.outputTokens += run.run.outputTokens;
      current.totalTokens += run.run.totalTokens;
      continue;
    }

    issueTotals.set(run.issueIdentifier, {
      issueIdentifier: run.issueIdentifier,
      inputTokens: run.run.inputTokens,
      outputTokens: run.run.outputTokens,
      totalTokens: run.run.totalTokens
    });
  }

  const issueTokenRows = Array.from(issueTotals.values())
    .sort((left, right) => right.totalTokens - left.totalTokens)
    .slice(0, 8);
  const totalRunTokens = runTokenRows.reduce((total, row) => total + row.totalTokens, 0);
  const totalTurnTokens = sumTurnTokenTotals(turnRows).totalTokens;
  const averageRunTokens =
    runTokenRows.length === 0 ? 0 : totalRunTokens / runTokenRows.length;
  const averageTurnTokens =
    turnRows.length === 0 ? 0 : totalTurnTokens / turnRows.length;
  const cachedTurnTokens = sumTurnTokenTotals(turnRows).cachedInputTokens;
  const cachedShare =
    totalTurnTokens === 0 ? 0 : cachedTurnTokens / Math.max(1, sumTurnTokenTotals(turnRows).inputTokens);
  const heaviestRun = runTokenRows[0];
  const heaviestTurn = [...turnRows].sort((left, right) => right.totalTokens - left.totalTokens)[0];
  const hottestIssue = issueTokenRows[0];

  return {
    summaryCards: [
      {
        label: "Sampled runs",
        value: formatCount(runTokenRows.length),
        detail: "Recent runs with readable token data in the current sample."
      },
      {
        label: "Sampled turns",
        value: formatCount(turnRows.length),
        detail: "Recorded turns carrying typed usage totals."
      },
      {
        label: "Run tokens",
        value: formatCount(totalRunTokens),
        detail: "Total run-level token load across the sample."
      },
      {
        label: "Turn tokens",
        value: formatCount(totalTurnTokens),
        detail: "Total turn-level token load across the sample."
      }
    ],
    tokenCards: [
      {
        label: "Average run tokens",
        value: formatCount(Math.round(averageRunTokens)),
        detail: "Average total tokens per sampled run."
      },
      {
        label: "Average turn tokens",
        value: formatCount(Math.round(averageTurnTokens)),
        detail: "Average total tokens per sampled turn."
      },
      {
        label: "Cached-input share",
        value: formatPercent(cachedShare),
        detail: `${formatCount(cachedTurnTokens)} cached input tokens across sampled turns.`
      },
      {
        label: "Heaviest issue",
        value: hottestIssue?.issueIdentifier ?? "n/a",
        detail: hottestIssue
          ? `${formatCount(hottestIssue.totalTokens)} total tokens across sampled runs.`
          : "No issue token hotspot is available yet."
      }
    ],
    runTokenRows: runTokenRows.slice(0, 8).map((row) => ({
      runLabel: row.runLabel,
      totalTokens: row.totalTokens,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens
    })),
    turnTokenRows: [...turnRows]
      .sort((left, right) => right.totalTokens - left.totalTokens)
      .slice(0, 8)
      .map((row) => ({
        turnLabel: `${row.issueIdentifier} · ${row.turnLabel}`,
        totalTokens: row.totalTokens,
        inputTokens: row.inputTokens,
        cachedInputTokens: row.cachedInputTokens,
        outputTokens: row.outputTokens
      })),
    issueTokenRows,
    hotspotRows: runTokenRows.slice(0, 10).map((row) => ({
      scope: row.issueIdentifier,
      label: row.runLabel,
      totalTokens: formatCount(row.totalTokens),
      inputTokens: formatCount(row.inputTokens),
      outputTokens: formatCount(row.outputTokens),
      startedAt: formatTimestamp(row.startedAt),
      runHref: `/runs/${row.runId}`,
      issueHref: `/issues/${row.issueIdentifier}`
    })),
    spotlight: {
      heaviestRun: heaviestRun ? `${heaviestRun.issueIdentifier} · ${heaviestRun.runLabel}` : "n/a",
      heaviestRunDetail: heaviestRun
        ? `${formatCount(heaviestRun.totalTokens)} total tokens with ${formatCount(heaviestRun.inputTokens)} input and ${formatCount(heaviestRun.outputTokens)} output tokens.`
        : "No run token hotspot is available yet.",
      heaviestTurn: heaviestTurn
        ? `${heaviestTurn.issueIdentifier} · ${heaviestTurn.turnLabel}`
        : "n/a",
      heaviestTurnDetail: heaviestTurn
        ? `${formatCount(heaviestTurn.totalTokens)} total tokens with ${formatCount(heaviestTurn.cachedInputTokens)} cached input tokens.`
        : "No turn token hotspot is available yet.",
      hottestIssue: hottestIssue?.issueIdentifier ?? "n/a",
      hottestIssueDetail: hottestIssue
        ? `${formatCount(hottestIssue.totalTokens)} total tokens across sampled runs.`
        : "No issue token hotspot is available yet."
    }
  };
}
