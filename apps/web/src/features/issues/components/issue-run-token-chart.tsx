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
import { cn } from "@/lib/utils";

const runTokenChartConfig = {
  inputTokens: {
    label: "Input tokens",
    color: "var(--chart-2)"
  },
  outputTokens: {
    label: "Output tokens",
    color: "var(--chart-3)"
  }
} satisfies ChartConfig;

export function IssueRunTokenChart(input: {
  rows: Array<{
    runLabel: string;
    inputTokens: number;
    outputTokens: number;
  }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1">
        <CardTitle>Recent run token load</CardTitle>
        <CardDescription>
          Input and output token usage across the most recent recorded runs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No token usage has been recorded for this issue yet.
          </p>
        ) : (
          <ChartContainer className="h-72 w-full" config={runTokenChartConfig}>
            <BarChart accessibilityLayer data={input.rows} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="runLabel"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <ChartTooltip
                cursor={false}
                content={<IssueRunTokenTooltip />}
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

function IssueRunTokenTooltip(input: {
  active?: boolean;
  label?: string | number;
  payload?: Array<{
    dataKey?: string | number | ((value: unknown) => unknown);
    value?: number | string;
    payload?: {
      runLabel?: string;
      inputTokens?: number;
      outputTokens?: number;
    };
  }>;
}) {
  const row = input.payload?.[0]?.payload;
  const inputTokens = input.payload?.find((entry) => entry.dataKey === "inputTokens")
    ?.value;
  const outputTokens = input.payload?.find((entry) => entry.dataKey === "outputTokens")
    ?.value;

  if (!input.active || !row) {
    return null;
  }

  return (
    <div
      className={cn(
        "grid min-w-40 gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl"
      )}
    >
      <div className="font-medium">{row.runLabel ?? input.label ?? "Run"}</div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Input tokens</span>
        <span className="font-mono font-medium text-foreground tabular-nums">
          {typeof inputTokens === "number"
            ? inputTokens.toLocaleString()
            : row.inputTokens?.toLocaleString() ?? "0"}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Output tokens</span>
        <span className="font-mono font-medium text-foreground tabular-nums">
          {typeof outputTokens === "number"
            ? outputTokens.toLocaleString()
            : row.outputTokens?.toLocaleString() ?? "0"}
        </span>
      </div>
    </div>
  );
}
