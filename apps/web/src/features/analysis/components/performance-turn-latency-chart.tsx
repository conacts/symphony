"use client";

import React from "react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig
} from "@/components/ui/chart";
import { formatDurationMilliseconds } from "@/core/display-formatters";
import { cn } from "@/lib/utils";
import type { PerformanceAnalysisViewModel } from "@/features/analysis/model/performance-analysis-view-model";

const chartConfig = {
  wallClockMs: {
    label: "Wall-clock",
    color: "var(--chart-5)"
  }
} satisfies ChartConfig;

export function PerformanceTurnLatencyChart(input: {
  rows: PerformanceAnalysisViewModel["slowTurnRows"];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1">
        <CardTitle>Slow turns</CardTitle>
        <CardDescription>
          The slowest sampled turns across recent runs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No turn latency rows are available in the current sample.
          </p>
        ) : (
          <ChartContainer className="h-72 w-full" config={chartConfig}>
            <BarChart accessibilityLayer data={input.rows} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="turnLabel" tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip cursor={false} content={<SlowTurnTooltip />} />
              <Bar dataKey="wallClockMs" fill="var(--color-wallClockMs)" radius={4} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function SlowTurnTooltip(input: {
  active?: boolean;
  payload?: Array<{
    payload?: PerformanceAnalysisViewModel["slowTurnRows"][number];
  }>;
}) {
  const row = input.payload?.[0]?.payload;

  if (!input.active || !row) {
    return null;
  }

  return (
    <div
      className={cn(
        "grid min-w-44 gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl"
      )}
    >
      <div className="font-medium">
        {row.issueIdentifier} · {row.turnLabel}
      </div>
      <TooltipStat label="Wall-clock" value={row.wallClockMs} />
      <TooltipStat label="Reasoning" value={row.reasoningMs} />
      <TooltipStat label="Commands" value={row.commandMs} />
      <TooltipStat label="Tools" value={row.toolMs} />
      <TooltipStat label="Messages" value={row.messageMs} />
      <TooltipStat label="Other" value={row.unclassifiedMs} />
    </div>
  );
}

function TooltipStat(input: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{input.label}</span>
      <span className="font-mono font-medium text-foreground tabular-nums">
        {formatDurationMilliseconds(input.value)}
      </span>
    </div>
  );
}
