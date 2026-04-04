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
} from "@/features/overview/model/overview-view-model";
import { OverviewRetryChart } from "@/features/overview/components/overview-retry-chart";
import { OverviewTokenChart } from "@/features/overview/components/overview-token-chart";

export function OverviewView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  loading: boolean;
  runtimeSummary: RuntimeSummaryViewModel | null;
}) {
  const runningMetric = input.runtimeSummary
    ? findMetric(input.runtimeSummary, "Running")
    : null;
  const retryingMetric = input.runtimeSummary
    ? findMetric(input.runtimeSummary, "Retrying")
    : null;
  const tokenMetric = input.runtimeSummary
    ? findMetric(input.runtimeSummary, "Total tokens")
    : null;
  const runtimeMetric = input.runtimeSummary
    ? findMetric(input.runtimeSummary, "Runtime")
    : null;

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
              Operator landing page for live pressure, active Codex work, and what needs intervention next.
            </p>
          </div>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle>Operator focus</CardTitle>
                <CardDescription>
                  The current runtime story in one place before you drill into the detailed surfaces below.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-border/70 p-4">
                  <p className="text-sm text-muted-foreground">Live work</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {runningMetric?.value ?? "0"} active runs
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {input.runtimeSummary.runningRows[0]
                      ? `${input.runtimeSummary.runningRows[0].issueIdentifier} is currently active.`
                      : "No runs are active right now."}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 p-4">
                  <p className="text-sm text-muted-foreground">Attention now</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {retryingMetric?.value ?? "0"} retries waiting
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {input.runtimeSummary.retryRows[0]
                      ? `${input.runtimeSummary.retryRows[0].issueIdentifier} is backing off because ${input.runtimeSummary.retryRows[0].error.toLowerCase()}`
                      : "No issues are currently waiting for another attempt."}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 p-4">
                  <p className="text-sm text-muted-foreground">Codex load</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {tokenMetric?.value ?? "0"}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {tokenMetric?.detail ?? "Token usage is unavailable."}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 p-4">
                  <p className="text-sm text-muted-foreground">Runtime posture</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {runtimeMetric?.value ?? "0s"}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {input.connection.detail}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader>
                <CardTitle>Latest pressure</CardTitle>
                <CardDescription>
                  The most recent retry, headroom, and Codex update signals from the runtime.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="rounded-xl border border-border/70 p-4">
                  <p className="text-sm text-muted-foreground">Latest retry</p>
                  <p className="mt-2 font-medium">
                    {input.runtimeSummary.retryRows[0]?.issueIdentifier ?? "None"}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {input.runtimeSummary.retryRows[0]?.error ??
                      "No issue is currently in backoff."}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 p-4">
                  <p className="text-sm text-muted-foreground">Headroom</p>
                  <p className="mt-2 font-medium">
                    {input.runtimeSummary.rateLimitRows[0]?.label ?? "Status"}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground break-words">
                    {input.runtimeSummary.rateLimitRows[0]?.value ??
                      "No upstream rate-limit snapshot is available yet."}
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 p-4">
                  <p className="text-sm text-muted-foreground">Latest Codex update</p>
                  <p className="mt-2 text-sm">
                    {input.runtimeSummary.runningRows[0]?.codexUpdate ??
                      "No live Codex session is reporting updates right now."}
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

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
            <OverviewTokenChart rows={input.runtimeSummary.tokenChartRows} />
            <OverviewRetryChart rows={input.runtimeSummary.retryChartRows} />
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Active runs</CardTitle>
                <CardDescription>
                  The primary operator surface for the work happening in this runtime right now.
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
          </section>

          <section>
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

function findMetric(
  runtimeSummary: RuntimeSummaryViewModel,
  label: string
) {
  return runtimeSummary.metrics.find((metric) => metric.label === label) ?? null;
}
