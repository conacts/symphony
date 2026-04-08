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
import type { AgentRunTranscriptTurn } from "@/features/runs/model/agent-run-transcript";

const chartConfig = {
  commandCount: {
    label: "Commands",
    color: "var(--chart-1)"
  },
  toolCount: {
    label: "Tools",
    color: "var(--chart-2)"
  },
  reasoningCount: {
    label: "Reasoning",
    color: "var(--chart-3)"
  }
} satisfies ChartConfig;

export function RunTurnActivityChart(input: {
  rows: AgentRunTranscriptTurn[];
}) {
  return (
    <Card className="border-border/70">
      <CardHeader className="space-y-1">
        <CardTitle>Turn activity</CardTitle>
        <CardDescription>
          Commands, tools, and reasoning captured in each turn.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No turn activity was captured for this run.
          </p>
        ) : (
          <ChartContainer className="h-80 w-full" config={chartConfig}>
            <BarChart accessibilityLayer data={input.rows} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="turnLabel"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <ChartTooltip cursor={false} content={<RunTurnActivityTooltip />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="commandCount" stackId="activity" fill="var(--color-commandCount)" radius={4} />
              <Bar dataKey="toolCount" stackId="activity" fill="var(--color-toolCount)" radius={4} />
              <Bar
                dataKey="reasoningCount"
                stackId="activity"
                fill="var(--color-reasoningCount)"
                radius={4}
              />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function RunTurnActivityTooltip(input: {
  active?: boolean;
  payload?: Array<{
    payload?: AgentRunTranscriptTurn & { turnLabel?: string };
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
      <div className="font-medium">{row.turnLabel ?? `Turn ${row.turnSequence}`}</div>
      <TooltipStat label="Commands" value={row.commandCount} />
      <TooltipStat label="Tools" value={row.toolCount} />
      <TooltipStat label="Reasoning" value={row.reasoningCount} />
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
      <span className="font-mono font-medium tabular-nums">{formatCount(input.value)}</span>
    </div>
  );
}
