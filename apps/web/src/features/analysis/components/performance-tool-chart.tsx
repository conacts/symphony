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
import type { PerformanceAnalysisViewModel } from "@/features/analysis/model/performance-analysis-view-model";
import { PerformanceDurationTooltip } from "@/features/analysis/components/performance-command-family-chart";

const chartConfig = {
  avgDurationMs: {
    label: "Average duration",
    color: "var(--chart-2)"
  }
} satisfies ChartConfig;

export function PerformanceToolChart(input: {
  rows: PerformanceAnalysisViewModel["toolRows"];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1">
        <CardTitle>Tool call hotspots</CardTitle>
        <CardDescription>
          Average tool-call duration across the recent sampled runs, grouped by tool label.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tool calls are available in the current sample.
          </p>
        ) : (
          <ChartContainer className="h-72 w-full" config={chartConfig}>
            <BarChart accessibilityLayer data={input.rows} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="toolLabel" tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip cursor={false} content={<PerformanceDurationTooltip />} />
              <Bar dataKey="avgDurationMs" fill="var(--color-avgDurationMs)" radius={4} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
