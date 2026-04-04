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
                content={
                  <ChartTooltipContent
                    indicator="dashed"
                    labelKey="runLabel"
                    formatter={(_, name, item) => (
                      <>
                        <div className="grid gap-1.5">
                          <span className="text-muted-foreground">
                            {runTokenChartConfig[item.dataKey as keyof typeof runTokenChartConfig]
                              ?.label ?? name}
                          </span>
                        </div>
                        <span className="font-mono font-medium text-foreground tabular-nums">
                          {formatTooltipValue(item)}
                        </span>
                      </>
                    )}
                  />
                }
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

function formatTooltipValue(item: {
  dataKey?: string | number | ((input: unknown) => unknown);
  payload?: Record<string, unknown>;
  value?: unknown;
}) {
  const rawValue =
    typeof item.dataKey === "string" &&
    item.payload &&
    typeof item.payload[item.dataKey] === "number"
      ? item.payload[item.dataKey]
      : item.value;

  return typeof rawValue === "number"
    ? rawValue.toLocaleString()
    : String(rawValue ?? "n/a");
}
