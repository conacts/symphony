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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type {
  RuntimeSummaryConnectionState
} from "@/features/overview/model/overview-view-model";
import { OverviewCompletionChart } from "@/features/overview/components/overview-completion-chart";
import {
  overviewTimeRangeOptions,
  type OverviewTimeRange
} from "@/features/overview/model/overview-query-state";
import type { OverviewSuccessMetricsViewModel } from "@/features/overview/model/overview-success-metrics";

export function OverviewView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  loading: boolean;
  successMetrics: OverviewSuccessMetricsViewModel | null;
  selectedTimeRange: OverviewTimeRange;
  onTimeRangeChange(timeRange: OverviewTimeRange): void;
}) {
  const summaryCards = input.successMetrics?.cards ?? [];

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Overview data degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {input.successMetrics ? (
        <>
          <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Weekly performance for completed work. This page is meant to read like a
                quick acknowledgement of what the orchestration platform delivered in the
                selected window.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Time range
              </p>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={0}
                value={input.selectedTimeRange}
                onValueChange={(value) => {
                  if (value) {
                    input.onTimeRangeChange(value as OverviewTimeRange);
                  }
                }}
                aria-label="Overview time range"
              >
                {overviewTimeRangeOptions.map((option) => (
                  <ToggleGroupItem key={option.value} value={option.value}>
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </section>

          <section>
            <OverviewCompletionChart rows={input.successMetrics.completionRows} />
          </section>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => (
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
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
            <CardTitle>Weekly performance unavailable</CardTitle>
            <CardDescription>
              The dashboard could not load the success-metrics snapshot.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {input.connection.detail}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
