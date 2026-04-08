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
import { formatCount, formatWholePercent } from "@/core/display-formatters";
import { cn } from "@/lib/utils";
import type { SymphonyForensicsRunDetailResult } from "@symphony/contracts";

type RunMachineLoad = SymphonyForensicsRunDetailResult["run"]["machineLoad"];

const chartConfig = {
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

export function RunMachineLoadChart(input: {
  machineLoad: RunMachineLoad;
}) {
  if (!input.machineLoad) {
    return null;
  }

  const rows = [
    {
      label: "This run",
      cpuPercent: input.machineLoad.maxCpuPercent,
      memoryPercent: input.machineLoad.maxMemoryPercent,
      diskPercent: input.machineLoad.maxDiskPercent,
      sampleCount: input.machineLoad.sampleCount,
      avgCpuPercent: input.machineLoad.avgCpuPercent,
      avgMemoryPercent: input.machineLoad.avgMemoryPercent,
      avgDiskPercent: input.machineLoad.avgDiskPercent,
      hadHighCpu: input.machineLoad.hadHighCpu,
      hadHighMemory: input.machineLoad.hadHighMemory,
      hadHighDisk: input.machineLoad.hadHighDisk
    }
  ];

  return (
    <Card className="border-border/70">
      <CardHeader className="space-y-1">
        <CardTitle>Run pressure</CardTitle>
        <CardDescription>
          Peak CPU, memory, and disk load sampled during this run.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer className="h-80 w-full" config={chartConfig}>
          <BarChart accessibilityLayer data={rows} margin={{ left: 12, right: 12 }}>
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
            <ChartTooltip cursor={false} content={<RunMachineLoadTooltip />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="cpuPercent" fill="var(--color-cpuPercent)" radius={4} />
            <Bar dataKey="memoryPercent" fill="var(--color-memoryPercent)" radius={4} />
            <Bar dataKey="diskPercent" fill="var(--color-diskPercent)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function RunMachineLoadTooltip(input: {
  active?: boolean;
  payload?: Array<{
    payload?: {
      label?: string;
      cpuPercent?: number;
      memoryPercent?: number;
      diskPercent?: number;
      sampleCount?: number;
      avgCpuPercent?: number;
      avgMemoryPercent?: number;
      avgDiskPercent?: number;
      hadHighCpu?: boolean;
      hadHighMemory?: boolean;
      hadHighDisk?: boolean;
    };
  }>;
}) {
  const row = input.payload?.[0]?.payload;

  if (!input.active || !row) {
    return null;
  }

  const pressureHit =
    Boolean(row.hadHighCpu) || Boolean(row.hadHighMemory) || Boolean(row.hadHighDisk);

  return (
    <div
      className={cn(
        "grid min-w-52 gap-1.5 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl"
      )}
    >
      <div className="font-medium">{row.label ?? "Run pressure"}</div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Samples</span>
        <span className="font-mono font-medium tabular-nums">
          {formatCount(row.sampleCount ?? 0)}
        </span>
      </div>
      <TooltipStat
        label="CPU peak"
        value={formatWholePercent(row.cpuPercent ?? 0)}
        detail={
          row.avgCpuPercent === undefined ? null : `Avg ${formatWholePercent(row.avgCpuPercent)}`
        }
      />
      <TooltipStat
        label="Memory peak"
        value={formatWholePercent(row.memoryPercent ?? 0)}
        detail={
          row.avgMemoryPercent === undefined
            ? null
            : `Avg ${formatWholePercent(row.avgMemoryPercent)}`
        }
      />
      <TooltipStat
        label="Disk peak"
        value={formatWholePercent(row.diskPercent ?? 0)}
        detail={
          row.avgDiskPercent === undefined ? null : `Avg ${formatWholePercent(row.avgDiskPercent)}`
        }
      />
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Pressure</span>
        <span className="font-medium">
          {pressureHit ? "Threshold hit" : "Within threshold"}
        </span>
      </div>
    </div>
  );
}

function TooltipStat(input: {
  label: string;
  value: string;
  detail: string | null;
}) {
  return (
    <div className="grid gap-0.5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">{input.label}</span>
        <span className="font-mono font-medium tabular-nums">{input.value}</span>
      </div>
      {input.detail ? (
        <div className="text-right text-[11px] text-muted-foreground">{input.detail}</div>
      ) : null}
    </div>
  );
}
