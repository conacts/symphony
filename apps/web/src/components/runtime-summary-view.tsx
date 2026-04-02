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

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Running sessions</CardTitle>
                <CardDescription>
                  Active issues, last known agent activity, and token usage.
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

            <div className="flex flex-col gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Retry queue</CardTitle>
                  <CardDescription>
                    Issues waiting for the next retry window.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {input.runtimeSummary.retryRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No issues are currently backing off.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Issue</TableHead>
                          <TableHead>Execution</TableHead>
                          <TableHead>Attempt</TableHead>
                          <TableHead>Due at</TableHead>
                          <TableHead>Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {input.runtimeSummary.retryRows.map((row) => (
                          <TableRow key={`${row.issueIdentifier}:${row.attempt}`}>
                            <TableCell>{row.issueIdentifier}</TableCell>
                            <TableCell>{row.execution}</TableCell>
                            <TableCell>{row.attempt}</TableCell>
                            <TableCell>{row.dueAt}</TableCell>
                            <TableCell>{row.error}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Rate limits</CardTitle>
                  <CardDescription>
                    Latest upstream rate-limit snapshot, when available.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <pre className="overflow-x-auto rounded-xl border border-border/70 bg-background/70 p-4 text-xs leading-6 text-muted-foreground">
                    {input.runtimeSummary.rateLimitsText}
                  </pre>
                </CardContent>
              </Card>
            </div>
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
