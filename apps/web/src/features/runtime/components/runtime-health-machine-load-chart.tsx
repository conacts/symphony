"use client";

import React from "react";
import { Bar, BarChart, CartesianGrid, Cell, YAxis, XAxis } from "recharts";
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
import { formatWholePercent, formatTimestamp } from "@/core/display-formatters";
import type { RuntimeHealthViewModel } from "@/features/runtime/model/runtime-health-view-model";

const machineLoadChartConfig = {
  value: {
    label: "Utilization",
    color: "var(--chart-1)"
  }
} satisfies ChartConfig;

const statusFillMap: Record<
  RuntimeHealthViewModel["machineLoadChartRows"][number]["status"],
  string
> = {
  healthy: "var(--chart-2)",
  warning: "var(--chart-4)",
  critical: "var(--chart-5)",
  unknown: "var(--muted)"
};

export function RuntimeHealthMachineLoadChart(input: {
  rows: RuntimeHealthViewModel["machineLoadChartRows"];
}) {
  const capture = input.rows.find((row) => row.capturedAt)?.capturedAt ?? null;

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>Machine pressure</CardTitle>
        <CardDescription>
          Snapshot utilization for CPU, memory, and disk. Thresholds are set at
          80%, 85%, and 90% respectively.
          {capture ? ` Latest capture ${formatTimestamp(capture)}.` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.every((row) => row.status === "unknown") ? (
          <p className="text-sm text-muted-foreground">
            Machine load sampling has not produced a host snapshot yet.
          </p>
        ) : (
          <ChartContainer className="h-72 w-full" config={machineLoadChartConfig}>
            <BarChart accessibilityLayer data={input.rows} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                domain={[0, 100]}
                tickFormatter={(value) => `${value}%`}
              />
              <ChartTooltip cursor={false} content={<MachineLoadTooltip />} />
              <Bar dataKey="value" fill="var(--color-value)" radius={6}>
                {input.rows.map((row) => (
                  <Cell key={row.label} fill={statusFillMap[row.status]} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function MachineLoadTooltip(input: {
  active?: boolean;
  payload?: Array<{
    payload?: {
      label?: string;
      value?: number;
      valueLabel?: string;
      threshold?: number;
      status?: string;
      detail?: string;
      samplePath?: string | null;
    };
  }>;
}) {
  const row = input.payload?.[0]?.payload;

  if (!input.active || !row) {
    return null;
  }

  return (
    <div className="grid min-w-52 gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <div className="font-medium">{row.label ?? "Load"}</div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Utilization</span>
        <span className="font-mono font-medium tabular-nums">
          {row.valueLabel ?? formatWholePercent(row.value)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Threshold</span>
        <span className="font-mono font-medium tabular-nums">
          {formatWholePercent(row.threshold)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Status</span>
        <span className="font-medium">
          {formatMachineLoadStatusLabel(row.status)}
        </span>
      </div>
      <p className="pt-1 text-muted-foreground">{row.detail ?? "No details available."}</p>
      {row.samplePath ? (
        <p className="text-muted-foreground">Path: {row.samplePath}</p>
      ) : null}
    </div>
  );
}

function formatMachineLoadStatusLabel(value: string | undefined) {
  switch (value) {
    case "healthy":
      return "Within threshold";
    case "warning":
      return "Near threshold";
    case "critical":
      return "Threshold hit";
    default:
      return "Unavailable";
  }
}
