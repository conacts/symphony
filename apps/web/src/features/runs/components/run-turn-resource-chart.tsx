"use client";

import React from "react";
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import type {
  SymphonyAgentCommandExecutionRecord,
  SymphonyAgentCommandResourceProfile
} from "@symphony/contracts";
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
  formatDurationMilliseconds
} from "@/core/display-formatters";
import { cn } from "@/lib/utils";

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

type ResourceCommandRow = {
  label: string;
  command: string;
  durationMs: number;
  peakCpuPercent: number;
  peakMemPercent: number;
  peakProcessCount: number;
  peakRssBytes: number;
  sampleCount: number;
  completedAt: string | null;
};

export function RunTurnResourceChart(input: {
  commands: SymphonyAgentCommandExecutionRecord[];
}) {
  const commandsWithProfiles = input.commands.filter(
    (command): command is SymphonyAgentCommandExecutionRecord & {
      resourceProfile: SymphonyAgentCommandResourceProfile;
    } => command.resourceProfile !== null && command.resourceProfile.sampleCount > 0
  );

  const rows = commandsWithProfiles
    .slice()
    .sort((left, right) => compareIsoTimestamp(left.completedAt, right.completedAt))
    .map((command, index) => {
      const profile = command.resourceProfile;

      return {
        label: `Cmd ${index + 1}`,
        command: truncateCommandLabel(command.command),
        durationMs: command.durationMs ?? 0,
        peakCpuPercent: profile.peakCpuPercent,
        peakMemPercent: profile.peakMemPercent,
        peakProcessCount: profile.peakProcessCount,
        peakRssBytes: profile.peakRssKb * 1024,
        sampleCount: profile.sampleCount,
        completedAt: command.completedAt
      };
    });
  const peakCpuRow = findPeakRow(rows, (row) => row.peakCpuPercent);
  const peakMemRow = findPeakRow(rows, (row) => row.peakMemPercent);
  const peakProcessRow = findPeakRow(rows, (row) => row.peakProcessCount);

  return (
    <Card className="border-border/70">
      <CardHeader className="space-y-1">
        <CardTitle>Command resource usage</CardTitle>
        <CardDescription>
          Peak CPU, memory, and process pressure captured while commands were active in
          this turn.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {peakCpuRow && peakMemRow && peakProcessRow ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard
              label="Peak CPU"
              value={formatMeasuredPercent(peakCpuRow.peakCpuPercent)}
              detail={`${peakCpuRow.label} · ${peakCpuRow.command}`}
            />
            <MetricCard
              label="Peak memory"
              value={formatMeasuredPercent(peakMemRow.peakMemPercent)}
              detail={`${peakMemRow.label} · ${formatBytes(peakMemRow.peakRssBytes)} RSS`}
            />
            <MetricCard
              label="Peak processes"
              value={formatCount(peakProcessRow.peakProcessCount)}
              detail={`${peakProcessRow.label} · ${formatDurationMilliseconds(peakProcessRow.durationMs)}`}
            />
          </div>
        ) : null}

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No per-command resource profile was captured for this turn.
          </p>
        ) : (
          <ChartContainer className="h-80 w-full" config={chartConfig}>
            <ComposedChart accessibilityLayer data={rows} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
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
              <ChartTooltip cursor={false} content={<RunTurnResourceTooltip />} />
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

function RunTurnResourceTooltip(input: {
  active?: boolean;
  payload?: Array<{
    payload?: ResourceCommandRow;
  }>;
}) {
  const row = input.payload?.[0]?.payload;

  if (!input.active || !row) {
    return null;
  }

  return (
    <div
      className={cn(
        "grid min-w-60 gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl"
      )}
    >
      <div className="font-medium">{row.label}</div>
      <div className="line-clamp-2 text-muted-foreground">{row.command}</div>
      <TooltipStat label="CPU peak" value={formatMeasuredPercent(row.peakCpuPercent)} />
      <TooltipStat label="Memory peak" value={formatMeasuredPercent(row.peakMemPercent)} />
      <TooltipStat label="RSS peak" value={formatBytes(row.peakRssBytes)} />
      <TooltipStat label="Process peak" value={formatCount(row.peakProcessCount)} />
      <TooltipStat label="Samples" value={formatCount(row.sampleCount)} />
      <TooltipStat
        label="Duration"
        value={formatDurationMilliseconds(row.durationMs)}
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

function findPeakRow(
  rows: ResourceCommandRow[],
  getValue: (row: ResourceCommandRow) => number
): ResourceCommandRow | null {
  let bestRow: ResourceCommandRow | null = null;
  let bestValue = Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    const value = getValue(row);
    if (value > bestValue) {
      bestValue = value;
      bestRow = row;
    }
  }

  return bestRow;
}

function formatMeasuredPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }

  const clamped = Math.max(0, Math.min(100, value));
  if (clamped === 0) {
    return "0%";
  }

  if (clamped < 0.1) {
    return "<0.1%";
  }

  if (clamped < 10 && !Number.isInteger(clamped)) {
    return `${clamped.toFixed(1)}%`;
  }

  return `${Math.round(clamped)}%`;
}

function compareIsoTimestamp(left: string | null, right: string | null) {
  return new Date(left ?? 0).getTime() - new Date(right ?? 0).getTime();
}

function truncateCommandLabel(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 25) {
    return normalized;
  }

  return `${normalized.slice(0, 25)}...`;
}
