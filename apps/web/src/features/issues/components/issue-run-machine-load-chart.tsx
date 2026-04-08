"use client";

import React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
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
import { formatWholePercent } from "@/core/display-formatters";
import { cn } from "@/lib/utils";
import type { IssueRunMachineLoadChartRow } from "@/features/issues/model/issue-view-model";

const issueRunMachineLoadChartConfig = {
  cpuPercent: {
    label: "CPU peak",
    color: "var(--chart-1)"
  },
  memoryPercent: {
    label: "Memory peak",
    color: "var(--chart-2)"
  },
  diskPercent: {
    label: "Disk peak",
    color: "var(--chart-3)"
  }
} satisfies ChartConfig;

export function IssueRunMachineLoadChart(input: {
  rows: IssueRunMachineLoadChartRow[];
}) {
  const pressuredRunCount = input.rows.filter((row) => row.pressureHit).length;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-1">
        <CardTitle>Run pressure</CardTitle>
        <CardDescription>
          Peak CPU, memory, and disk load across sampled runs.
          {input.rows.length > 0
            ? ` ${pressuredRunCount} of ${input.rows.length} sampled runs crossed a pressure threshold.`
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No sampled machine load has been recorded for this issue yet.
          </p>
        ) : (
          <ChartContainer className="h-72 w-full" config={issueRunMachineLoadChartConfig}>
            <BarChart accessibilityLayer data={input.rows} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="runLabel"
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
              <ChartTooltip cursor={false} content={<IssueRunMachineLoadTooltip />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="cpuPercent" fill="var(--color-cpuPercent)" radius={4} />
              <Bar dataKey="memoryPercent" fill="var(--color-memoryPercent)" radius={4} />
              <Bar dataKey="diskPercent" fill="var(--color-diskPercent)" radius={4} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function IssueRunMachineLoadTooltip(input: {
  active?: boolean;
  payload?: Array<{
    payload?: IssueRunMachineLoadChartRow;
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
      <div className="font-medium">{row.runLabel}</div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Started</span>
        <span className="font-mono font-medium tabular-nums">{row.startedAt}</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">CPU peak</span>
        <span className="font-mono font-medium tabular-nums">
          {formatWholePercent(row.cpuPercent)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Memory peak</span>
        <span className="font-mono font-medium tabular-nums">
          {formatWholePercent(row.memoryPercent)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Disk peak</span>
        <span className="font-mono font-medium tabular-nums">
          {formatWholePercent(row.diskPercent)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Pressure</span>
        <span className="font-medium">
          {row.pressureHit ? "Threshold hit" : "Within threshold"}
        </span>
      </div>
    </div>
  );
}
