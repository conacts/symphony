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

const successTrendConfig = {
  startedIssueCount: {
    label: "Started issues",
    color: "var(--chart-4)"
  },
  deliveredIssueCount: {
    label: "Delivered issues",
    color: "var(--chart-2)"
  },
  maxTurnFailureCount: {
    label: "Max-turn failures",
    color: "var(--chart-5)"
  }
} satisfies ChartConfig;

export function OverviewSuccessTrendChart(input: {
  rows: OverviewSuccessMetricsViewModel["trendRows"];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1">
        <CardTitle>Delivery trend</CardTitle>
        <CardDescription>
          Started issues, delivered issues, and max-turn failures over the selected window.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No success-metrics trend data is available for this time window.
          </p>
        ) : (
          <ChartContainer className="h-80 w-full" config={successTrendConfig}>
            <ComposedChart accessibilityLayer data={input.rows} margin={{ left: 12, right: 12 }}>
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
                dataKey="maxTurnFailureCount"
                stroke="var(--color-maxTurnFailureCount)"
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
