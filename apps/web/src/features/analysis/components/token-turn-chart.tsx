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
import { TokenTooltipContent } from "@/features/analysis/components/token-run-chart";
import type { TokenAnalysisViewModel } from "@/features/analysis/model/token-analysis-view-model";

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

export function TokenTurnChart(input: {
  rows: TokenAnalysisViewModel["turnTokenRows"];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1">
        <CardTitle>Turn token load</CardTitle>
        <CardDescription>
          Input, cached input, and output token usage across the heaviest recent turns.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No turn token data is available in the current sample.
          </p>
        ) : (
          <ChartContainer className="h-72 w-full" config={chartConfig}>
            <BarChart accessibilityLayer data={input.rows} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="turnLabel" tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip cursor={false} content={<TokenTooltipContent />} />
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
