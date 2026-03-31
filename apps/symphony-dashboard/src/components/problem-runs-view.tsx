import React from "react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { buildProblemRunsViewModel } from "@/core/forensics-view-model";
import type { SymphonyForensicsProblemRunsResult } from "@symphony/contracts";

export function ProblemRunsView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  loading: boolean;
  problemRuns: SymphonyForensicsProblemRunsResult | null;
}) {
  const viewModel = input.problemRuns
    ? buildProblemRunsViewModel(input.problemRuns)
    : null;

  return (
    <div className="flex flex-col gap-6">
      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Problem-runs view degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {viewModel ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Problem runs</CardTitle>
              <CardDescription>
                First-class pause and failure outcomes like max turns, rate limits, and startup failures.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action="/problem-runs" className="grid gap-4 md:grid-cols-4">
                <label className="flex flex-col gap-2 text-sm">
                  Outcome
                  <Input defaultValue={viewModel.filters.outcome} name="outcome" />
                </label>
                <label className="flex flex-col gap-2 text-sm">
                  Issue
                  <Input
                    defaultValue={viewModel.filters.issueIdentifier}
                    name="issue_identifier"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm">
                  Limit
                  <Input
                    defaultValue={viewModel.filters.limit}
                    min="1"
                    name="limit"
                    type="number"
                  />
                </label>
                <div className="flex items-end">
                  <Button type="submit">Apply</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {viewModel.summaryCards.length > 0 ? (
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {viewModel.summaryCards.map((card) => (
                <Card key={card.outcome}>
                  <CardHeader>
                    <CardDescription>{card.outcome}</CardDescription>
                    <CardTitle className="text-3xl">{card.count}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    Matching runs in the current result set.
                  </CardContent>
                </Card>
              ))}
            </section>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Problem runs</CardTitle>
              <CardDescription>
                Drill into non-success outcomes and their corresponding issue history.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {viewModel.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No problem runs recorded.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Issue</TableHead>
                      <TableHead>Run</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Turns / events</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Outcome</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewModel.rows.map((row) => (
                      <TableRow key={row.runId}>
                        <TableCell>
                          <Link
                            className="underline underline-offset-4"
                            href={row.issueHref}
                          >
                            {row.issueIdentifier}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link
                            className="font-medium underline underline-offset-4"
                            href={row.runHref}
                          >
                            {row.runId.slice(0, 8)}
                          </Link>
                        </TableCell>
                        <TableCell>{row.startedAt}</TableCell>
                        <TableCell>{row.durationSeconds}</TableCell>
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
            <CardTitle>Problem-runs view unavailable</CardTitle>
            <CardDescription>{input.connection.detail}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
