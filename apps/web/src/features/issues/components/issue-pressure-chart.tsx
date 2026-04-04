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

const issuePressureChartConfig = {
  retryCount: {
    label: "Retries",
    color: "var(--chart-3)"
  },
  rateLimitedCount: {
    label: "Rate limits",
    color: "var(--chart-4)"
  },
  maxTurnsCount: {
    label: "Max turns",
    color: "var(--chart-5)"
  }
} satisfies ChartConfig;

export function IssuePressureChart(input: {
  rows: Array<{
    issueIdentifier: string;
    retryCount: number;
    rateLimitedCount: number;
    maxTurnsCount: number;
  }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1">
        <CardTitle>Retry and failure pressure</CardTitle>
        <CardDescription>
          Where retries, rate limits, and max-turn failures are clustering.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No retry or failure pressure is visible in the current issue set.
          </p>
        ) : (
          <ChartContainer className="h-72 w-full" config={issuePressureChartConfig}>
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
              <Bar dataKey="retryCount" fill="var(--color-retryCount)" radius={4} />
              <Bar
                dataKey="rateLimitedCount"
                fill="var(--color-rateLimitedCount)"
                radius={4}
              />
              <Bar dataKey="maxTurnsCount" fill="var(--color-maxTurnsCount)" radius={4} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
