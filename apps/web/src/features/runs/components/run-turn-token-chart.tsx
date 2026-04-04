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
import { formatCount } from "@/core/display-formatters";
import { cn } from "@/lib/utils";
import type { CodexRunViewModel } from "@/features/runs/model/codex-run-view-model";

const chartConfig = {
  inputTokens: {
    label: "Input",
    color: "var(--chart-2)"
  },
  cachedInputTokens: {
    label: "Cached input",
    color: "var(--chart-4)"
  },
  outputTokens: {
    label: "Output",
    color: "var(--chart-3)"
  }
} satisfies ChartConfig;

export function RunTurnTokenChart(input: {
  rows: CodexRunViewModel["turnTokens"]["rows"];
}) {
  return (
    <Card className="border-border/70">
      <CardHeader>
        <CardTitle>Turn token breakdown</CardTitle>
        <CardDescription>
          Input, cached input, and output tokens across the recorded turns in this run.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No turn token data was captured for this run.
          </p>
        ) : (
          <ChartContainer className="h-80 w-full" config={chartConfig}>
            <BarChart accessibilityLayer data={input.rows} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="turnLabel" tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip cursor={false} content={<RunTurnTokenTooltip />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="inputTokens" stackId="tokens" fill="var(--color-inputTokens)" radius={4} />
              <Bar dataKey="cachedInputTokens" stackId="tokens" fill="var(--color-cachedInputTokens)" radius={4} />
              <Bar dataKey="outputTokens" stackId="tokens" fill="var(--color-outputTokens)" radius={4} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function RunTurnTokenTooltip(input: {
  active?: boolean;
  payload?: Array<{
    payload?: CodexRunViewModel["turnTokens"]["rows"][number];
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
      <TooltipStat label="Input" value={row.inputTokens} />
      <TooltipStat label="Cached input" value={row.cachedInputTokens} />
      <TooltipStat label="Output" value={row.outputTokens} />
      <TooltipStat label="Total" value={row.totalTokens} />
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
        {formatCount(input.value)}
      </span>
    </div>
  );
}
