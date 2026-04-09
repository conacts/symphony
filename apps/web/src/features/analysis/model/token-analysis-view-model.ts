import type { AgentAnalysisSampleResource } from "@/features/analysis/hooks/load-agent-analysis-sample";
import { buildAgentTurnTokenRows, sumTurnTokenTotals } from "@/core/agent-token";
import {
  formatCount,
  formatPercent,
  formatTimestamp
} from "@/core/display-formatters";
import {
  buildIssueHref,
  buildIssueRunHref
} from "@/core/control-plane-routes";

export type TokenAnalysisViewModel = {
  summaryCards: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
  timeSeriesRows: Array<{
    date: string;
    label: string;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    totalTokens: number;
    runCount: number;
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
  input: AgentAnalysisSampleResource
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
  const dailyTotals = new Map<
    string,
    {
      date: string;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      totalTokens: number;
      runCount: number;
    }
  >();
  const turnRows = input.sampledRuns.flatMap((sampledRun) =>
    buildAgentTurnTokenRows({
      runArtifacts: sampledRun.artifacts
    })
  );
  const runTokenRows = input.sampledRuns
    .map((sampledRun, index) => {
      const tokenTotals = buildCompatibleRunTokenTotals(sampledRun);

      return {
      repositoryKey: sampledRun.repositoryKey,
      runLabel: `Run ${index + 1} · ${sampledRun.run.runId.slice(0, 6)}`,
      totalTokens: tokenTotals.totalTokens,
      inputTokens: tokenTotals.inputTokens,
      cachedInputTokens: tokenTotals.cachedInputTokens,
      outputTokens: tokenTotals.outputTokens,
      issueIdentifier: sampledRun.issueIdentifier,
      startedAt: sampledRun.run.startedAt,
      runId: sampledRun.run.runId
      };
    })
    .sort((left, right) => right.totalTokens - left.totalTokens);

  for (const run of runTokenRows) {
    const day = run.startedAt.slice(0, 10);
    const current = issueTotals.get(run.issueIdentifier);

    if (current) {
      current.inputTokens += run.inputTokens;
      current.outputTokens += run.outputTokens;
      current.totalTokens += run.totalTokens;
    } else {
      issueTotals.set(run.issueIdentifier, {
        issueIdentifier: run.issueIdentifier,
        inputTokens: run.inputTokens,
        outputTokens: run.outputTokens,
        totalTokens: run.totalTokens
      });
    }

    const daily = dailyTotals.get(day);
    if (daily) {
      daily.inputTokens += run.inputTokens;
      daily.cachedInputTokens += run.cachedInputTokens;
      daily.outputTokens += run.outputTokens;
      daily.totalTokens += run.totalTokens;
      daily.runCount += 1;
    } else {
      dailyTotals.set(day, {
        date: day,
        inputTokens: run.inputTokens,
        cachedInputTokens: run.cachedInputTokens,
        outputTokens: run.outputTokens,
        totalTokens: run.totalTokens,
        runCount: 1
      });
    }
  }

  const issueTokenRows = Array.from(issueTotals.values())
    .sort((left, right) => right.totalTokens - left.totalTokens)
    .slice(0, 8);
  const timeSeriesRows = buildTimeSeriesRows(dailyTotals);
  const totalRunTokens = runTokenRows.reduce((total, row) => total + row.totalTokens, 0);
  const totalTurnTokens = sumTurnTokenTotals(turnRows).totalTokens;
  const averageRunTokens =
    runTokenRows.length === 0 ? 0 : totalRunTokens / runTokenRows.length;
  const averageTurnTokens =
    turnRows.length === 0 ? 0 : totalTurnTokens / turnRows.length;
  const cachedTurnTokens = sumTurnTokenTotals(turnRows).cachedInputTokens;
  const cachedShare = totalTurnTokens === 0 ? 0 : cachedTurnTokens / totalTurnTokens;
  const heaviestRun = runTokenRows[0];
  const heaviestTurn = [...turnRows].sort((left, right) => right.totalTokens - left.totalTokens)[0];
  const hottestIssue = issueTokenRows[0];

  return {
    summaryCards: [
      {
        label: "Total tokens",
        value: formatCount(totalRunTokens),
        detail: "Run token load across the selected sample window."
      },
      {
        label: "Sampled runs",
        value: formatCount(runTokenRows.length),
        detail: "Recent runs with readable token data in the selected window."
      },
      {
        label: "Average tokens / run",
        value: formatCount(Math.round(averageRunTokens)),
        detail: "Average run-level token load in the selected sample."
      },
      {
        label: "Cached-input share",
        value: formatPercent(cachedShare),
        detail: `${formatCount(cachedTurnTokens)} cached input tokens across sampled turns.`
      }
    ],
    timeSeriesRows,
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
      runHref: buildIssueRunHref(row.issueIdentifier, row.runId, {
        repo: row.repositoryKey
      }),
      issueHref: buildIssueHref(row.issueIdentifier, {
        repo: row.repositoryKey
      })
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

function buildTimeSeriesRows(
  dailyTotals: Map<
    string,
    {
      date: string;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      totalTokens: number;
      runCount: number;
    }
  >
): Array<{
  date: string;
  label: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  runCount: number;
}> {
  const dates = [...dailyTotals.keys()].sort();

  if (dates.length === 0) {
    return [];
  }

  const start = new Date(`${dates[0]}T00:00:00.000Z`);
  const end = new Date(`${dates[dates.length - 1]}T00:00:00.000Z`);
  const rows: Array<{
    date: string;
    label: string;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    totalTokens: number;
    runCount: number;
  }> = [];

  for (
    let cursor = new Date(start.getTime());
    cursor.getTime() <= end.getTime();
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const date = cursor.toISOString().slice(0, 10);
    const row = dailyTotals.get(date);
    rows.push({
      date,
      label: formatDayLabel(date),
      inputTokens: row?.inputTokens ?? 0,
      cachedInputTokens: row?.cachedInputTokens ?? 0,
      outputTokens: row?.outputTokens ?? 0,
      totalTokens: row?.totalTokens ?? 0,
      runCount: row?.runCount ?? 0
    });
  }

  return rows;
}

function formatDayLabel(value: string): string {
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(parsed));
}

function buildCompatibleRunTokenTotals(
  sampledRun: AgentAnalysisSampleResource["sampledRuns"][number]
) {
  const fallback = {
    inputTokens: sampledRun.run.inputTokens,
    cachedInputTokens: normalizeRunCachedInputTokens(sampledRun.run),
    outputTokens: sampledRun.run.outputTokens,
    totalTokens: sampledRun.run.totalTokens
  };
  const turnTotals = sumTurnTokenTotals(
    buildAgentTurnTokenRows({
      runArtifacts: sampledRun.artifacts
    })
  );

  const isCompatibleTurnBreakdown =
    turnTotals.totalTokens > 0 &&
    turnTotals.totalTokens === fallback.totalTokens &&
    turnTotals.outputTokens === fallback.outputTokens &&
    turnTotals.inputTokens + turnTotals.cachedInputTokens ===
      fallback.inputTokens + fallback.cachedInputTokens;

  return isCompatibleTurnBreakdown ? turnTotals : fallback;
}

function normalizeRunCachedInputTokens(
  run: AgentAnalysisSampleResource["sampledRuns"][number]["run"]
): number {
  if (run.cachedInputTokens > 0) {
    return run.cachedInputTokens;
  }

  return Math.max(0, run.totalTokens - run.inputTokens - run.outputTokens);
}
