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
import type { RuntimeSummaryViewModel } from "@/features/overview/model/overview-view-model";

const tokenChartConfig = {
  inputTokens: {
    label: "Input tokens",
    color: "var(--chart-1)"
  },
  outputTokens: {
    label: "Output tokens",
    color: "var(--chart-2)"
  }
} satisfies ChartConfig;

export function OverviewTokenChart(input: {
  rows: RuntimeSummaryViewModel["tokenChartRows"];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1">
        <CardTitle>Active token footprint</CardTitle>
        <CardDescription>
          Input and output token volume for each active run in the current runtime.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active runs are producing token usage right now.
          </p>
        ) : (
          <ChartContainer className="h-72 w-full" config={tokenChartConfig}>
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
                dataKey="inputTokens"
                stackId="tokens"
                fill="var(--color-inputTokens)"
                radius={4}
              />
              <Bar
                dataKey="outputTokens"
                stackId="tokens"
                fill="var(--color-outputTokens)"
                radius={4}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
