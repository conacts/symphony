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
  avgDurationMs: {
    label: "Average duration",
    color: "var(--chart-1)"
  }
} satisfies ChartConfig;

export function PerformanceCommandFamilyChart(input: {
  rows: PerformanceAnalysisViewModel["commandFamilyRows"];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1">
        <CardTitle>Command family hotspots</CardTitle>
        <CardDescription>
          Average command duration across the recent sampled runs, grouped by command family.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No command executions are available in the current sample.
          </p>
        ) : (
          <ChartContainer className="h-72 w-full" config={chartConfig}>
            <BarChart accessibilityLayer data={input.rows} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="family" tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip cursor={false} content={<PerformanceDurationTooltip />} />
              <Bar dataKey="avgDurationMs" fill="var(--color-avgDurationMs)" radius={4} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function PerformanceDurationTooltip(input: {
  active?: boolean;
  payload?: Array<{
    value?: number | string;
    payload?: {
      family?: string;
      toolLabel?: string;
      sampleCount?: number;
      failureCount?: number;
    };
  }>;
}) {
  const row = input.payload?.[0]?.payload;
  const duration = input.payload?.[0]?.value;

  if (!input.active || !row || typeof duration !== "number") {
    return null;
  }

  const label = row.family ?? row.toolLabel ?? "Operation";

  return (
    <div
      className={cn(
        "grid min-w-40 gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl"
      )}
    >
      <div className="font-medium">{label}</div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Average duration</span>
        <span className="font-mono font-medium text-foreground tabular-nums">
          {formatDurationMilliseconds(duration)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Samples</span>
        <span className="font-mono font-medium text-foreground tabular-nums">
          {row.sampleCount ?? 0}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Failures</span>
        <span className="font-mono font-medium text-foreground tabular-nums">
          {row.failureCount ?? 0}
        </span>
      </div>
    </div>
  );
}
