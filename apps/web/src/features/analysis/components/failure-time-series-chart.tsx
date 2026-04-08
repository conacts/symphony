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
import type { FailureAnalysisViewModel } from "@/features/analysis/model/failure-analysis-view-model";

const chartConfig = {
  maxTurnsFailures: {
    label: "Max turns",
    color: "var(--chart-2)"
  },
  startupFailures: {
    label: "Startup failures",
    color: "var(--chart-3)"
  },
  rateLimitedFailures: {
    label: "Rate limited",
    color: "var(--chart-4)"
  },
  providerTransientFailures: {
    label: "Provider transient",
    color: "var(--chart-5)"
  },
  otherFailures: {
    label: "Other",
    color: "var(--chart-6)"
  },
  totalFailures: {
    label: "Total failures",
    color: "var(--chart-1)"
  }
} satisfies ChartConfig;

export function FailureTimeSeriesChart(input: {
  rows: FailureAnalysisViewModel["timeSeriesRows"];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-1">
        <CardTitle>Failure type by day</CardTitle>
        <CardDescription>
          Daily failed runs split by failure type over the selected window.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No failure data is available for the selected window.
          </p>
        ) : (
          <ChartContainer className="h-80 w-full" config={chartConfig}>
            <ComposedChart
              accessibilityLayer
              data={input.rows}
              margin={{ left: 12, right: 12 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip cursor={false} content={<FailureTimeSeriesTooltip />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar
                dataKey="maxTurnsFailures"
                stackId="failures"
                fill="var(--color-maxTurnsFailures)"
                radius={4}
              />
              <Bar
                dataKey="startupFailures"
                stackId="failures"
                fill="var(--color-startupFailures)"
                radius={4}
              />
              <Bar
                dataKey="rateLimitedFailures"
                stackId="failures"
                fill="var(--color-rateLimitedFailures)"
                radius={4}
              />
              <Bar
                dataKey="providerTransientFailures"
                stackId="failures"
                fill="var(--color-providerTransientFailures)"
                radius={4}
              />
              <Bar
                dataKey="otherFailures"
                stackId="failures"
                fill="var(--color-otherFailures)"
                radius={4}
              />
              <Line
                dataKey="totalFailures"
                stroke="var(--color-totalFailures)"
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

function FailureTimeSeriesTooltip(input: {
  active?: boolean;
  payload?: Array<{
    payload?: {
      label?: string;
      totalFailures?: number;
      maxTurnsFailures?: number;
      startupFailures?: number;
      rateLimitedFailures?: number;
      providerTransientFailures?: number;
      otherFailures?: number;
    };
  }>;
}) {
  const row = input.payload?.[0]?.payload;

  if (!input.active || !row) {
    return null;
  }

  return (
    <div className="grid min-w-48 gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <div className="font-medium">{row.label ?? "Failures"}</div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Total</span>
        <span className="font-mono font-medium tabular-nums">
          {formatCount(row.totalFailures ?? 0)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Max turns</span>
        <span className="font-mono font-medium tabular-nums">
          {formatCount(row.maxTurnsFailures ?? 0)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Startup failures</span>
        <span className="font-mono font-medium tabular-nums">
          {formatCount(row.startupFailures ?? 0)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Rate limited</span>
        <span className="font-mono font-medium tabular-nums">
          {formatCount(row.rateLimitedFailures ?? 0)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Provider transient</span>
        <span className="font-mono font-medium tabular-nums">
          {formatCount(row.providerTransientFailures ?? 0)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Other</span>
        <span className="font-mono font-medium tabular-nums">
          {formatCount(row.otherFailures ?? 0)}
        </span>
      </div>
    </div>
  );
}
