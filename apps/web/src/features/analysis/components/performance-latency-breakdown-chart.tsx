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
  durationMs: {
    label: "Latency",
    color: "var(--chart-4)"
  }
} satisfies ChartConfig;

export function PerformanceLatencyBreakdownChart(input: {
  rows: PerformanceAnalysisViewModel["latencyBreakdownRows"];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1">
        <CardTitle>Latency composition</CardTitle>
        <CardDescription>
          Aggregate wall-clock time split across reasoning, commands, tools, assistant output, and other overhead.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No turn latency data is available in the current sample.
          </p>
        ) : (
          <ChartContainer className="h-72 w-full" config={chartConfig}>
            <BarChart accessibilityLayer data={input.rows} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="phase" tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip cursor={false} content={<LatencyBreakdownTooltip />} />
              <Bar dataKey="durationMs" fill="var(--color-durationMs)" radius={4} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function LatencyBreakdownTooltip(input: {
  active?: boolean;
  payload?: Array<{
    value?: number | string;
    payload?: {
      phase?: string;
    };
  }>;
}) {
  const row = input.payload?.[0]?.payload;
  const duration = input.payload?.[0]?.value;

  if (!input.active || !row || typeof duration !== "number") {
    return null;
  }

  return (
    <div
      className={cn(
        "grid min-w-40 gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl"
      )}
    >
      <div className="font-medium">{row.phase ?? "Phase"}</div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Total time</span>
        <span className="font-mono font-medium text-foreground tabular-nums">
          {formatDurationMilliseconds(duration)}
        </span>
      </div>
    </div>
  );
}
