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
import { formatCount } from "@/core/display-formatters";
import { cn } from "@/lib/utils";
import type { TokenAnalysisViewModel } from "@/features/analysis/model/token-analysis-view-model";

const chartConfig = {
  inputTokens: {
    label: "Input",
    color: "var(--chart-2)"
  },
  outputTokens: {
    label: "Output",
    color: "var(--chart-3)"
  }
} satisfies ChartConfig;

export function TokenRunChart(input: {
  rows: TokenAnalysisViewModel["runTokenRows"];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1">
        <CardTitle>Run token load</CardTitle>
        <CardDescription>
          Input and output token usage across the heaviest recent runs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No run token data is available in the current sample.
          </p>
        ) : (
          <ChartContainer className="h-72 w-full" config={chartConfig}>
            <BarChart accessibilityLayer data={input.rows} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="runLabel" tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip cursor={false} content={<TokenTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="inputTokens" stackId="tokens" fill="var(--color-inputTokens)" radius={4} />
              <Bar dataKey="outputTokens" stackId="tokens" fill="var(--color-outputTokens)" radius={4} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function TokenTooltipContent(input: {
  active?: boolean;
  payload?: Array<{
    payload?: {
      runLabel?: string;
      totalTokens?: number;
      inputTokens?: number;
      outputTokens?: number;
      cachedInputTokens?: number;
      turnLabel?: string;
      issueIdentifier?: string;
    };
  }>;
}) {
  const row = input.payload?.[0]?.payload;

  if (!input.active || !row) {
    return null;
  }

  return (
    <div
      className={cn(
        "grid min-w-44 gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl"
      )}
    >
      <div className="font-medium">
        {row.runLabel ?? row.turnLabel ?? row.issueIdentifier ?? "Tokens"}
      </div>
      {"inputTokens" in row ? <TooltipStat label="Input" value={row.inputTokens ?? 0} /> : null}
      {"cachedInputTokens" in row ? (
        <TooltipStat label="Cached input" value={row.cachedInputTokens ?? 0} />
      ) : null}
      {"outputTokens" in row ? <TooltipStat label="Output" value={row.outputTokens ?? 0} /> : null}
      {"totalTokens" in row ? <TooltipStat label="Total" value={row.totalTokens ?? 0} /> : null}
    </div>
  );
}

function TooltipStat(input: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{input.label}</span>
      <span className="font-mono font-medium text-foreground tabular-nums">
        {formatCount(input.value)}
      </span>
    </div>
  );
}
