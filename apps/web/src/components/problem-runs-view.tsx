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
    <div className="flex min-w-0 flex-col gap-6">
      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Problem runs degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {viewModel ? (
        <>
          <section className="grid gap-4 md:grid-cols-2">
            {viewModel.summaryCards.map((card) => (
              <Card key={card.label}>
                <CardHeader>
                  <CardDescription>{card.label}</CardDescription>
                  <CardTitle className="text-3xl">{card.value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Outcome summary</CardTitle>
              <CardDescription>
                Aggregated outcomes across the current problem-run slice.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              {viewModel.outcomeSummary.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No problem outcomes are currently recorded.
                </p>
              ) : (
                viewModel.outcomeSummary.map((entry) => (
                  <div
                    key={entry.outcome}
                    className="rounded-lg border px-3 py-2 text-sm"
                  >
                    <p className="font-medium">{entry.outcome}</p>
                    <p className="text-muted-foreground">{entry.count} runs</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Latest problem runs</CardTitle>
              <CardDescription>
                Failure-focused run history across issues.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {viewModel.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No problem runs match the current scope.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Issue</TableHead>
                      <TableHead>Run</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead>Error class</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Total tokens</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewModel.rows.map((row) => (
                      <TableRow key={row.runId}>
                        <TableCell>{row.issueIdentifier}</TableCell>
                        <TableCell>{row.runId}</TableCell>
                        <TableCell>{row.startedAt}</TableCell>
                        <TableCell>{row.outcome}</TableCell>
                        <TableCell>{row.errorClass}</TableCell>
                        <TableCell>{row.durationSeconds}</TableCell>
                        <TableCell>{row.totalTokens}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      ) : input.loading ? (
        <section className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }, (_, index) => (
            <Card key={index}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-24" />
              </CardHeader>
            </Card>
          ))}
        </section>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Problem runs unavailable</CardTitle>
            <CardDescription>{input.connection.detail}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
