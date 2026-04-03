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
import type { RuntimeSummaryConnectionState } from "@/core/runtime-summary-view-model";
import { buildIssueForensicsBundleViewModel } from "@/core/forensics-view-model";
import type { SymphonyForensicsIssueForensicsBundleResult } from "@symphony/contracts";

export function IssueDetailView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  issueDetail: SymphonyForensicsIssueForensicsBundleResult | null;
  loading: boolean;
}) {
  const viewModel = input.issueDetail
    ? buildIssueForensicsBundleViewModel(input.issueDetail)
    : null;

  return (
    <div className="flex flex-col gap-8">
      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Issue detail degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {viewModel ? (
        <>
          <section className="grid gap-5 md:grid-cols-3">
            {viewModel.metrics.map((metric) => (
              <Card key={metric.label}>
                <CardHeader>
                  <CardDescription>{metric.label}</CardDescription>
                  <CardTitle className="text-3xl">{metric.value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Run history</CardTitle>
              <CardDescription>
                Browse recorded attempts for this issue.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {viewModel.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No recorded runs for this issue yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Run</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Total tokens</TableHead>
                      <TableHead>Turns / events</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Outcome</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewModel.rows.map((row) => (
                      <TableRow
                        key={row.runId}
                        tabIndex={0}
                        className="cursor-pointer"
                        onClick={() => window.location.assign(row.runHref)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            window.location.assign(row.runHref);
                          }
                        }}
                      >
                        <TableCell className="font-medium">
                          {row.runId.slice(0, 8)}
                        </TableCell>
                        <TableCell>{row.startedAt}</TableCell>
                        <TableCell>{row.durationSeconds}</TableCell>
                        <TableCell>{row.totalTokens}</TableCell>
                        <TableCell>{row.turnsAndEvents}</TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell>{row.outcome}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {viewModel.latestFailure ? (
            <Card>
              <CardHeader>
                <CardTitle>Latest failure</CardTitle>
                <CardDescription>
                  Most recent failing or degraded execution captured for this issue.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
                <div>
                  <p className="font-medium text-foreground">Run</p>
                  <p>{viewModel.latestFailure.runId}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Started</p>
                  <p>{viewModel.latestFailure.startedAt}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Outcome</p>
                  <p>{viewModel.latestFailure.outcome}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Error class</p>
                  <p>{viewModel.latestFailure.errorClass}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Timeline entries</p>
                  <p>{viewModel.latestFailure.timelineCount}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">Runtime logs</p>
                  <p>{viewModel.latestFailure.runtimeLogCount}</p>
                </div>
                <div className="md:col-span-3">
                  <p className="font-medium text-foreground">Message</p>
                  <p>{viewModel.latestFailure.errorMessage}</p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <section className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Issue timeline</CardTitle>
                <CardDescription>
                  Persisted tracker, runtime, workspace, and Codex events for this issue.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {viewModel.timelineRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No timeline entries have been recorded yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {viewModel.timelineRows.map((row) => (
                        <TableRow key={row.entryId}>
                          <TableCell>{row.recordedAt}</TableCell>
                          <TableCell>{row.source}</TableCell>
                          <TableCell>{row.eventType}</TableCell>
                          <TableCell className="max-w-sm truncate">{row.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Runtime logs</CardTitle>
                <CardDescription>
                  Persisted runtime-side logs associated with this issue.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {viewModel.runtimeLogRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No runtime logs have been recorded for this issue yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Level</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {viewModel.runtimeLogRows.map((row) => (
                        <TableRow key={row.entryId}>
                          <TableCell>{row.recordedAt}</TableCell>
                          <TableCell>{row.level}</TableCell>
                          <TableCell>{row.source}</TableCell>
                          <TableCell>{row.eventType}</TableCell>
                          <TableCell className="max-w-sm truncate">{row.message}</TableCell>
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
        <section className="grid gap-4 md:grid-cols-3">
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
        </section>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Issue detail unavailable</CardTitle>
            <CardDescription>{input.connection.detail}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
