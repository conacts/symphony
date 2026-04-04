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
  ChartTooltipContent,
  type ChartConfig
} from "@/components/ui/chart";

const issueOutcomeChartConfig = {
  completedRunCount: {
    label: "Completed runs",
    color: "var(--chart-1)"
  },
  problemRunCount: {
    label: "Problem runs",
    color: "var(--chart-2)"
  }
} satisfies ChartConfig;

export function IssueOutcomeChart(input: {
  rows: Array<{
    issueIdentifier: string;
    completedRunCount: number;
    problemRunCount: number;
  }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1">
        <CardTitle>Issue outcome pressure</CardTitle>
        <CardDescription>
          Top issues by run volume, split between completed and problem runs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No issue activity has been recorded yet.
          </p>
        ) : (
          <ChartContainer className="h-72 w-full" config={issueOutcomeChartConfig}>
            <BarChart accessibilityLayer data={input.rows} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="issueIdentifier"
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
                dataKey="completedRunCount"
                stackId="runs"
                fill="var(--color-completedRunCount)"
                radius={4}
              />
              <Bar
                dataKey="problemRunCount"
                stackId="runs"
                fill="var(--color-problemRunCount)"
                radius={4}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
