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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import type {
  RuntimeSummaryConnectionState,
  RuntimeSummaryViewModel
} from "@/core/runtime-summary-view-model";

export function RuntimeSummaryView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  loading: boolean;
  runtimeSummary: RuntimeSummaryViewModel | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Runtime summary degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {input.runtimeSummary ? (
        <>
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
            <p className="text-sm text-muted-foreground">
              Active Codex operator view for runtime pressure, retries, and upstream headroom.
            </p>
          </div>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {input.runtimeSummary.metrics.map((metric) => (
              <Card key={metric.label}>
                <CardHeader>
                  <CardDescription>{metric.label}</CardDescription>
                  <CardTitle className="text-3xl">{metric.value}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {metric.detail}
                </CardContent>
              </Card>
            ))}
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Retry pressure</CardTitle>
                <CardDescription>
                  Issues currently waiting for the next retry window.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {input.runtimeSummary.retryRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No issues are currently backing off.
                  </p>
                ) : (
                  input.runtimeSummary.retryRows.map((row) => (
                    <div
                      key={`${row.issueIdentifier}:${row.attempt}`}
                      className="rounded-xl border border-border/70 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{row.issueIdentifier}</p>
                        <p className="text-sm text-muted-foreground">
                          Attempt {row.attempt}
                        </p>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Due {row.dueAt}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {row.execution}
                      </p>
                      <p className="mt-3 text-sm">{row.error}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Provider headroom</CardTitle>
                <CardDescription>
                  Latest upstream rate-limit snapshot from the runtime surface.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {input.runtimeSummary.rateLimitRows.map((row) => (
                  <div
                    key={row.label}
                    className="rounded-xl border border-border/70 p-4"
                  >
                    <p className="text-sm text-muted-foreground">{row.label}</p>
                    <p className="mt-2 text-lg font-medium break-words">
                      {row.value}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section>
            <Card>
              <CardHeader>
                <CardTitle>Active runs</CardTitle>
                <CardDescription>
                  One table for the live work happening in this runtime right now.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {input.runtimeSummary.runningRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active sessions.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Issue</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>Session</TableHead>
                        <TableHead>Execution</TableHead>
                        <TableHead>Runtime / turns</TableHead>
                        <TableHead>Codex update</TableHead>
                        <TableHead>Tokens</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {input.runtimeSummary.runningRows.map((row) => (
                        <TableRow key={row.issueIdentifier}>
                          <TableCell>{row.issueIdentifier}</TableCell>
                          <TableCell>{row.state}</TableCell>
                          <TableCell>{row.sessionId ?? "n/a"}</TableCell>
                          <TableCell>{row.execution}</TableCell>
                          <TableCell>{row.runtimeAndTurns}</TableCell>
                          <TableCell>{row.codexUpdate}</TableCell>
                          <TableCell>{row.tokenSummary}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </section>
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
            <CardTitle>Runtime summary unavailable</CardTitle>
            <CardDescription>
              The dashboard could not load the runtime snapshot.
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
