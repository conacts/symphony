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
  ChartTooltipContent,
  type ChartConfig
} from "@/components/ui/chart";
import type { RuntimeHealthViewModel } from "@/features/runtime/model/runtime-health-view-model";

const runtimeLogLevelChartConfig = {
  count: {
    label: "Events",
    color: "var(--chart-1)"
  }
} satisfies ChartConfig;

export function RuntimeHealthLogLevelChart(input: {
  rows: RuntimeHealthViewModel["logLevelChartRows"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent event pressure</CardTitle>
        <CardDescription>
          Severity mix for the most recent runtime events pulled into this page.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.every((row) => row.count === 0) ? (
          <p className="text-sm text-muted-foreground">
            No runtime events have been recorded yet.
          </p>
        ) : (
          <ChartContainer className="h-64 w-full" config={runtimeLogLevelChartConfig}>
            <BarChart accessibilityLayer data={input.rows} margin={{ left: 12, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="dashed" />}
              />
              <Bar dataKey="count" radius={6}>
                {input.rows.map((row) => (
                  <Cell key={row.label} fill={row.fill} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
