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
import type { RuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";
import type {
  SymphonyRuntimeHealthResult,
  SymphonyRuntimeLogsResult
} from "@symphony/contracts";
import { RuntimeHealthEventFeed } from "@/features/runtime/components/runtime-health-event-feed";
import { RuntimeHealthLogLevelChart } from "@/features/runtime/components/runtime-health-log-level-chart";
import { buildRuntimeHealthViewModel } from "@/features/runtime/model/runtime-health-view-model";

export function RuntimeHealthView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  health: SymphonyRuntimeHealthResult | null;
  runtimeLogs: SymphonyRuntimeLogsResult | null;
  loading: boolean;
  now: Date;
}) {
  const viewModel = input.health
    ? buildRuntimeHealthViewModel(input.health, input.runtimeLogs, input.now)
    : null;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Runtime health degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {viewModel ? (
        <>
          <section className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">Runtime health</h1>
            <p className="text-sm text-muted-foreground">
              Operator diagnostics for scheduler heartbeat, runtime readiness, and recent runtime event pressure.
            </p>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {viewModel.summaryCards.map((card) => (
              <Card key={card.label}>
                <CardHeader>
                  <CardDescription>{card.label}</CardDescription>
                  <CardTitle className="text-3xl">{card.value}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {card.detail}
                </CardContent>
              </Card>
            ))}
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <RuntimeHealthLogLevelChart rows={viewModel.logLevelChartRows} />

            <Card>
              <CardHeader>
                <CardTitle>Active incidents</CardTitle>
                <CardDescription>
                  The shortest path to understanding whether operator attention is needed.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {viewModel.incidentCards.map((row) => (
                  <div key={row.label} className="rounded-xl border border-border/70 p-4">
                    <p className="text-sm text-muted-foreground">{row.label}</p>
                    <p className="mt-2 text-lg font-medium">{row.value}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{row.detail}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Health signals</CardTitle>
                <CardDescription>
                  High-signal checks for the active runtime process.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                {viewModel.signalRows.map((row) => (
                  <div key={row.label} className="rounded-xl border border-border/70 p-4">
                    <p className="text-sm text-muted-foreground">{row.label}</p>
                    <p className="mt-2 text-lg font-medium">{row.value}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{row.detail}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Scheduler heartbeat</CardTitle>
                <CardDescription>
                  Most recent poller timestamps and cycle timing.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 text-sm text-muted-foreground md:grid-cols-2">
                {viewModel.heartbeatRows.map((row) => (
                  <div key={row.label}>
                    <p className="font-medium text-foreground">{row.label}</p>
                    <p>{row.value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Runtime storage and cadence</CardTitle>
              <CardDescription>
                Static runtime health facts that are still important during investigations.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
              {viewModel.storageRows.map((row) => (
                <div key={row.label}>
                  <p className="font-medium text-foreground">{row.label}</p>
                  <p className="break-words">{row.value}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <RuntimeHealthEventFeed rows={viewModel.recentEventRows} />
        </>
      ) : input.loading ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
        </section>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Runtime health unavailable</CardTitle>
            <CardDescription>{input.connection.detail}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
