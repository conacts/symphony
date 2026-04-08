"use client";

import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FailureTimeSeriesChart } from "@/features/analysis/components/failure-time-series-chart";
import type { FailureAnalysisTimeRange } from "@/features/analysis/model/failure-analysis-query-state";
import type { FailureAnalysisViewModel } from "@/features/analysis/model/failure-analysis-view-model";
import type { RuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";

export function FailureAnalysisView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  loading: boolean;
  failureAnalysis: FailureAnalysisViewModel | null;
  selectedModel?: string;
  modelOptions?: Array<{
    value: string;
    label: string;
  }>;
  timeRange: FailureAnalysisTimeRange;
  onModelChange(model: string | undefined): void;
  onTimeRangeChange(timeRange: FailureAnalysisTimeRange): void;
}) {
  const modelOptions = input.modelOptions ?? [];

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Failure analysis degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {input.failureAnalysis ? (
        <>
          <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                Cross-run trends
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">Failure analysis</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Weekly and monthly failure patterns, condensed into a chart-first view.
                Use the model filter to isolate a single model and keep the signal dense.
              </p>
            </div>

            <div className="flex flex-col gap-2 lg:items-end">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select
                  value={input.selectedModel ?? "__all_models__"}
                  onValueChange={(value) => {
                    input.onModelChange(
                      value === "__all_models__" ? undefined : value
                    );
                  }}
                >
                  <SelectTrigger className="w-full sm:w-64" size="sm" aria-label="Model filter">
                    <SelectValue placeholder="All models" />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="__all_models__">All models</SelectItem>
                    {modelOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  spacing={0}
                  value={input.timeRange}
                  onValueChange={(value) => {
                    if (value) {
                      input.onTimeRangeChange(value as FailureAnalysisTimeRange);
                    }
                  }}
                  aria-label="Failure analysis time range"
                >
                  {failureTimeRangeOptions.map((option) => (
                    <ToggleGroupItem key={option.value} value={option.value}>
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            </div>
          </section>

          <section>
            <FailureTimeSeriesChart rows={input.failureAnalysis.timeSeriesRows} />
          </section>

          <section className="grid gap-3 md:grid-cols-3">
            {input.failureAnalysis.summaryCards.map((card) => (
              <Card key={card.label}>
                <CardHeader className="space-y-1 pb-2">
                  <CardDescription>{card.label}</CardDescription>
                  <CardTitle className="text-2xl">{card.value}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-sm text-muted-foreground">
                  {card.detail}
                </CardContent>
              </Card>
            ))}
          </section>
        </>
      ) : input.loading ? (
        <section className="grid gap-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-80 w-full" />
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Card key={index}>
                <CardHeader>
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-20" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-40" />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Failure analysis unavailable</CardTitle>
            <CardDescription>{input.connection.detail}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}

const failureTimeRangeOptions = [
  { value: "7d", label: "Week" },
  { value: "30d", label: "Month" },
  { value: "all", label: "All" }
] as const satisfies ReadonlyArray<{
  value: FailureAnalysisTimeRange;
  label: string;
}>;
