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
  type ChartConfig
} from "@/components/ui/chart";
import { formatCount } from "@/core/display-formatters";
import type { TokenAnalysisViewModel } from "@/features/analysis/model/token-analysis-view-model";

const chartConfig = {
  inputTokens: {
    label: "Input tokens",
    color: "var(--chart-2)"
  },
  outputTokens: {
    label: "Output tokens",
    color: "var(--chart-3)"
  },
  totalTokens: {
    label: "Total load",
    color: "var(--chart-5)"
  }
} satisfies ChartConfig;

export function TokenTimeSeriesChart(input: {
  rows: TokenAnalysisViewModel["timeSeriesRows"];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1">
        <CardTitle>Run token load</CardTitle>
        <CardDescription>
          Daily input and output load with total run tokens over the selected window.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No token data is available for the selected window.
          </p>
        ) : (
          <ChartContainer className="h-80 w-full" config={chartConfig}>
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
              <ChartTooltip cursor={false} content={<TokenTimeSeriesTooltip />} />
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
              <Line
                dataKey="totalTokens"
                stroke="var(--color-totalTokens)"
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

function TokenTimeSeriesTooltip(input: {
  active?: boolean;
  payload?: Array<{
    payload?: {
      label?: string;
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
      runCount?: number;
    };
  }>;
}) {
  const row = input.payload?.[0]?.payload;

  if (!input.active || !row) {
    return null;
  }

  return (
    <div className="grid min-w-44 gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <div className="font-medium">{row.label ?? "Tokens"}</div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Input</span>
        <span className="font-mono font-medium tabular-nums">
          {formatCount(row.inputTokens ?? 0)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Output</span>
        <span className="font-mono font-medium tabular-nums">
          {formatCount(row.outputTokens ?? 0)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Total</span>
        <span className="font-mono font-medium tabular-nums">
          {formatCount(row.totalTokens ?? 0)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Runs</span>
        <span className="font-mono font-medium tabular-nums">
          {formatCount(row.runCount ?? 0)}
        </span>
      </div>
    </div>
  );
}
