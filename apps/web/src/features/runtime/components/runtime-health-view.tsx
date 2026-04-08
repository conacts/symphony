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
import { RuntimeHealthMachineLoadChart } from "@/features/runtime/components/runtime-health-machine-load-chart";
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
          <section className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
              Runtime heartbeat
            </p>
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold tracking-tight">Runtime health</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                A compact operator view of scheduler heartbeat, machine pressure, and the
                latest runtime event stream.
              </p>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {viewModel.summaryCards.map((card) => (
              <Card key={card.label}>
                <CardHeader className="space-y-1 pb-2">
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
            <RuntimeHealthMachineLoadChart rows={viewModel.machineLoadChartRows} />
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Heartbeat</CardTitle>
                <CardDescription>
                  Scheduler timestamps and cycle duration for the latest runtime snapshot.
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

            <Card>
              <CardHeader>
                <CardTitle>Runtime incidents</CardTitle>
                <CardDescription>
                  The most relevant runtime alerts surfaced from the current log sample.
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

          <RuntimeHealthEventFeed rows={viewModel.recentEventRows} />
        </>
      ) : input.loading ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
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
