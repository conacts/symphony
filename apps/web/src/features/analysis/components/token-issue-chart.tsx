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
import { TokenTooltipContent } from "@/features/analysis/components/token-run-chart";
import type { TokenAnalysisViewModel } from "@/features/analysis/model/token-analysis-view-model";

const chartConfig = {
  totalTokens: {
    label: "Total tokens",
    color: "var(--chart-1)"
  }
} satisfies ChartConfig;

export function TokenIssueChart(input: {
  rows: TokenAnalysisViewModel["issueTokenRows"];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1">
        <CardTitle>Issue token pressure</CardTitle>
        <CardDescription>
          Total token load across the hottest issues in the current sample.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No issue token data is available in the current sample.
          </p>
        ) : (
          <ChartContainer className="h-72 w-full" config={chartConfig}>
            <BarChart accessibilityLayer data={input.rows} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="issueIdentifier" tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip cursor={false} content={<TokenTooltipContent />} />
              <Bar dataKey="totalTokens" fill="var(--color-totalTokens)" radius={4} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
