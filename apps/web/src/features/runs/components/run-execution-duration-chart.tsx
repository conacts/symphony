"use client";

import React from "react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis } from "recharts";
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

const chartConfig = {
  durationMs: {
    label: "Duration",
    color: "var(--chart-2)"
  }
} satisfies ChartConfig;

type ExecutionChartRow = {
  label: string;
  duration: string;
  durationMs: number;
  status: string;
  family?: string;
};

export function RunExecutionDurationChart(input: {
  title: string;
  description: string;
  emptyText: string;
  rows: ExecutionChartRow[];
}) {
  const chartWidth = Math.max(input.rows.length * 84, 560);

  return (
    <Card className="border-border/70">
      <CardHeader>
        <CardTitle>{input.title}</CardTitle>
        <CardDescription>{input.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{input.emptyText}</p>
        ) : (
          <div className="overflow-x-auto">
            <ChartContainer
              className="h-80 min-w-full"
              config={chartConfig}
              style={{ minWidth: `${chartWidth}px` }}
            >
              <BarChart accessibilityLayer data={input.rows} margin={{ left: 12, right: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={84}
                />
                <ChartTooltip cursor={false} content={<ExecutionDurationTooltip />} />
                <Bar dataKey="durationMs" radius={4}>
                  {input.rows.map((row, index) => (
                    <Cell
                      key={`${row.label}:${row.durationMs}:${index}`}
                      fill={barColorForStatus(row.status)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ExecutionDurationTooltip(input: {
  active?: boolean;
  payload?: Array<{
    payload?: ExecutionChartRow;
  }>;
}) {
  const row = input.payload?.[0]?.payload;

  if (!input.active || !row) {
    return null;
  }

  return (
    <div
      className={cn(
        "grid min-w-52 gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl"
      )}
    >
      <div className="font-medium break-all">{row.label}</div>
      {row.family ? (
        <div className="text-muted-foreground">{row.family}</div>
      ) : null}
      <TooltipStat label="Duration" value={row.duration} />
      <TooltipStat label="Outcome" value={formatExecutionOutcome(row.status)} />
      <TooltipStat label="Milliseconds" value={formatCount(row.durationMs)} />
    </div>
  );
}

function TooltipStat(input: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{input.label}</span>
      <span className="font-medium text-foreground">{input.value}</span>
    </div>
  );
}

function barColorForStatus(status: string): string {
  return status === "Completed" ? "var(--chart-2)" : "var(--chart-5)";
}

function formatExecutionOutcome(status: string): string {
  return status === "Completed" ? "Success" : "Error";
}
