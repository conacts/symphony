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
import { formatCount } from "@/core/display-formatters";
import { cn } from "@/lib/utils";
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
        <CardTitle>Issue concentration</CardTitle>
        <CardDescription>
          Total token load across the hottest issues in the selected window.
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

function TokenTooltipContent(input: {
  active?: boolean;
  payload?: Array<{
    payload?: {
      totalTokens?: number;
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
      <div className="font-medium">{row.issueIdentifier ?? "Tokens"}</div>
      <TooltipStat label="Total" value={row.totalTokens ?? 0} />
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
