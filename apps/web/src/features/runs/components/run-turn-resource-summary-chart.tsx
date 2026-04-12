"use client";

import React from "react";
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  type ChartConfig
} from "@/components/ui/chart";
import {
  formatBytes,
  formatCount,
  formatTimestamp,
  formatWholePercent
} from "@/core/display-formatters";
import { cn } from "@/lib/utils";
import type { AgentRunViewModel } from "@/features/runs/model/agent-run-view-model";

const chartConfig = {
  peakCpuPercent: {
    label: "CPU peak",
    color: "var(--chart-1)"
  },
  peakMemPercent: {
    label: "Memory peak",
    color: "var(--chart-2)"
  },
  peakProcessCount: {
    label: "Process peak",
    color: "var(--chart-4)"
  }
} satisfies ChartConfig;

export function RunTurnResourceSummaryChart(input: {
  rows: AgentRunViewModel["turnResources"]["rows"];
}) {
  const hottestRow = [...input.rows].sort((left, right) => right.peakCpuPercent - left.peakCpuPercent)[0] ?? null;

  return (
    <Card className="flex h-full min-h-[300px] flex-col border-border/70">
      <CardHeader className="space-y-1">
        <CardTitle>Turn resource pressure</CardTitle>
        <CardDescription>
          Peak command CPU, memory, and process pressure summarized at the turn level.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1">
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No per-command resource profile was captured for this run.
          </p>
        ) : (
          <div className="flex w-full flex-1 flex-col gap-4">
            {hottestRow ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard
                  label="Peak turn CPU"
                  value={formatWholePercent(hottestRow.peakCpuPercent)}
                  detail={hottestRow.turnLabel}
                />
                <MetricCard
                  label="Peak turn memory"
                  value={formatWholePercent(
                    Math.max(...input.rows.map((row) => row.peakMemPercent))
                  )}
                  detail={formatBytes(Math.max(...input.rows.map((row) => row.peakRssBytes)))}
                />
                <MetricCard
                  label="Peak turn processes"
                  value={formatCount(
                    Math.max(...input.rows.map((row) => row.peakProcessCount))
                  )}
                  detail={`${formatCount(input.rows.reduce((sum, row) => sum + row.commandCount, 0))} commands tracked`}
                />
              </div>
            ) : null}

            <ChartContainer className="min-h-64 w-full flex-1" config={chartConfig}>
              <ComposedChart accessibilityLayer data={input.rows} margin={{ left: 12, right: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="turnLabel" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis
                  yAxisId="percent"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                />
                <YAxis
                  yAxisId="count"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  allowDecimals={false}
                />
                <ChartTooltip cursor={false} content={<RunTurnResourceSummaryTooltip />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar
                  yAxisId="percent"
                  dataKey="peakCpuPercent"
                  fill="var(--color-peakCpuPercent)"
                  radius={4}
                />
                <Bar
                  yAxisId="percent"
                  dataKey="peakMemPercent"
                  fill="var(--color-peakMemPercent)"
                  radius={4}
                />
                <Line
                  yAxisId="count"
                  dataKey="peakProcessCount"
                  stroke="var(--color-peakProcessCount)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 4 }}
                  type="monotone"
                />
              </ComposedChart>
            </ChartContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetricCard(input: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {input.label}
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">
        {input.value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{input.detail}</div>
    </div>
  );
}

function RunTurnResourceSummaryTooltip(input: {
  active?: boolean;
  payload?: Array<{
    payload?: AgentRunViewModel["turnResources"]["rows"][number];
  }>;
}) {
  const row = input.payload?.[0]?.payload;

  if (!input.active || !row) {
    return null;
  }

  return (
    <div
      className={cn(
        "grid min-w-56 gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl"
      )}
    >
      <div className="font-medium">{row.turnLabel}</div>
      <TooltipStat label="CPU peak" value={formatWholePercent(row.peakCpuPercent)} />
      <TooltipStat label="Memory peak" value={formatWholePercent(row.peakMemPercent)} />
      <TooltipStat label="RSS peak" value={formatBytes(row.peakRssBytes)} />
      <TooltipStat label="Process peak" value={formatCount(row.peakProcessCount)} />
      <TooltipStat label="Commands tracked" value={formatCount(row.commandCount)} />
      <TooltipStat
        label="Window"
        value={`${formatTimestamp(row.firstSampledAt)} to ${formatTimestamp(row.lastSampledAt)}`}
      />
    </div>
  );
}

function TooltipStat(input: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{input.label}</span>
      <span className="font-mono font-medium tabular-nums">{input.value}</span>
    </div>
  );
}
