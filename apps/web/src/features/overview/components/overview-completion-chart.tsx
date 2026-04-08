"use client";

import React from "react";
import { Bar, CartesianGrid, ComposedChart, Line, XAxis } from "recharts";
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
  ChartTooltipContent,
  type ChartConfig
} from "@/components/ui/chart";
import type { OverviewSuccessMetricsViewModel } from "@/features/overview/model/overview-success-metrics";

const completionChartConfig = {
  startedIssueCount: {
    label: "Started issues",
    color: "var(--chart-4)"
  },
  deliveredIssueCount: {
    label: "Delivered issues",
    color: "var(--chart-2)"
  },
  runsPerDeliveredIssue: {
    label: "Runs per delivered issue",
    color: "var(--chart-5)"
  }
} satisfies ChartConfig;

export function OverviewCompletionChart(input: {
  rows: OverviewSuccessMetricsViewModel["completionRows"];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1">
        <CardTitle>Weekly throughput</CardTitle>
        <CardDescription>
          Delivered issues are the main signal. The line shows how many runs it took, on
          average, to complete a delivered issue each day.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No weekly success data is available for this time window.
          </p>
        ) : (
          <ChartContainer className="h-80 w-full" config={completionChartConfig}>
            <ComposedChart
              accessibilityLayer
              data={input.rows}
              margin={{ left: 12, right: 12 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="dashed" />}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar
                dataKey="startedIssueCount"
                fill="var(--color-startedIssueCount)"
                radius={4}
              />
              <Bar
                dataKey="deliveredIssueCount"
                fill="var(--color-deliveredIssueCount)"
                radius={4}
              />
              <Line
                dataKey="runsPerDeliveredIssue"
                stroke="var(--color-runsPerDeliveredIssue)"
                strokeWidth={2}
                dot={false}
                type="monotone"
              />
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
