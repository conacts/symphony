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
import type { RuntimeSummaryConnectionState } from "@/core/runtime-summary-view-model";
import { formatTimestamp } from "@/core/forensics-view-model";
import type { SymphonyRuntimeHealthResult } from "@symphony/contracts";

export function RuntimeHealthView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  health: SymphonyRuntimeHealthResult | null;
  loading: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Runtime health degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {input.health ? (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardDescription>Overall</CardDescription>
                <CardTitle className="text-3xl">
                  {input.health.healthy ? "Healthy" : "Degraded"}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                DB and poller state from the current runtime process.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Database</CardDescription>
                <CardTitle className="text-3xl">
                  {input.health.db.ready ? "Ready" : "Down"}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {input.health.db.file}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Poll interval</CardDescription>
                <CardTitle className="text-3xl">
                  {input.health.poller.intervalMs}ms
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                In flight: {input.health.poller.inFlight ? "yes" : "no"}
              </CardContent>
            </Card>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Poller status</CardTitle>
              <CardDescription>
                Latest scheduler heartbeat and completion markers.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="font-medium text-foreground">Running</p>
                <p>{input.health.poller.running ? "yes" : "no"}</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Last started</p>
                <p>{formatTimestamp(input.health.poller.lastStartedAt)}</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Last completed</p>
                <p>{formatTimestamp(input.health.poller.lastCompletedAt)}</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Last succeeded</p>
                <p>{formatTimestamp(input.health.poller.lastSucceededAt)}</p>
              </div>
              <div className="md:col-span-2 xl:col-span-4">
                <p className="font-medium text-foreground">Last error</p>
                <p>{input.health.poller.lastError ?? "No poller error recorded."}</p>
              </div>
            </CardContent>
          </Card>
        </>
      ) : input.loading ? (
        <section className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Card key={index}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-20" />
              </CardHeader>
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
