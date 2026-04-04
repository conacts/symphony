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
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  type ChartConfig
} from "@/components/ui/chart";
import { formatDurationMilliseconds } from "@/core/display-formatters";
import { cn } from "@/lib/utils";
import type { CodexRunViewModel } from "@/features/runs/model/codex-run-view-model";

const chartConfig = {
  reasoningMs: {
    label: "Reasoning",
    color: "var(--chart-1)"
  },
  commandMs: {
    label: "Commands",
    color: "var(--chart-2)"
  },
  toolMs: {
    label: "Tools",
    color: "var(--chart-3)"
  },
  messageMs: {
    label: "Messages",
    color: "var(--chart-4)"
  },
  unclassifiedMs: {
    label: "Other",
    color: "var(--chart-5)"
  }
} satisfies ChartConfig;

export function RunTurnLatencyChart(input: {
  rows: CodexRunViewModel["turnLatency"]["rows"];
}) {
  return (
    <Card className="border-border/70">
      <CardHeader>
        <CardTitle>Turn latency breakdown</CardTitle>
        <CardDescription>
          Where wall-clock time was spent inside each recorded turn.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No turn latency data was captured for this run.
          </p>
        ) : (
          <ChartContainer className="h-80 w-full" config={chartConfig}>
            <BarChart accessibilityLayer data={input.rows} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="turnLabel" tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip cursor={false} content={<RunTurnLatencyTooltip />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="reasoningMs" stackId="latency" fill="var(--color-reasoningMs)" radius={4} />
              <Bar dataKey="commandMs" stackId="latency" fill="var(--color-commandMs)" radius={4} />
              <Bar dataKey="toolMs" stackId="latency" fill="var(--color-toolMs)" radius={4} />
              <Bar dataKey="messageMs" stackId="latency" fill="var(--color-messageMs)" radius={4} />
              <Bar dataKey="unclassifiedMs" stackId="latency" fill="var(--color-unclassifiedMs)" radius={4} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function RunTurnLatencyTooltip(input: {
  active?: boolean;
  payload?: Array<{
    payload?: CodexRunViewModel["turnLatency"]["rows"][number];
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
      <div className="font-medium">{row.turnLabel}</div>
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
