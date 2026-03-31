import React from "react";
import Link from "next/link";
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
import { buildIssueIndexViewModel } from "@/core/forensics-view-model";
import type { SymphonyForensicsIssueListResult } from "@symphony/contracts";

export function IssueIndexView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  issueIndex: SymphonyForensicsIssueListResult | null;
  loading: boolean;
}) {
  const viewModel = input.issueIndex
    ? buildIssueIndexViewModel(input.issueIndex)
    : null;

  return (
    <div className="flex flex-col gap-6">
      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Issue index degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {viewModel ? (
        <>
          {viewModel.summaryCards.length > 0 ? (
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {viewModel.summaryCards.map((card) => (
                <Card key={card.outcome}>
                  <CardHeader>
                    <CardDescription>{card.outcome}</CardDescription>
                    <CardTitle className="text-3xl">{card.count}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    Recent problem runs in the current summary window.
                  </CardContent>
                </Card>
              ))}
            </section>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Issue index</CardTitle>
              <CardDescription>
                Issues ordered by their most recent recorded run.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {viewModel.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No recorded issue runs yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Issue</TableHead>
                      <TableHead>Runs</TableHead>
                      <TableHead>Latest run</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead>Latest problem</TableHead>
                      <TableHead>Last completed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewModel.rows.map((row) => (
                      <TableRow key={row.issueIdentifier}>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">{row.issueIdentifier}</span>
                            <Link
                              className="text-xs text-muted-foreground underline underline-offset-4"
                              href={row.issueHref}
                            >
                              Issue detail
                            </Link>
                          </div>
                        </TableCell>
                        <TableCell>{row.runCount}</TableCell>
                        <TableCell>{row.latestRunStartedAt}</TableCell>
                        <TableCell>{row.latestRunStatus}</TableCell>
                        <TableCell>{row.latestRunOutcome}</TableCell>
                        <TableCell>{row.latestProblemOutcome}</TableCell>
                        <TableCell>{row.lastCompletedOutcome}</TableCell>
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
            <CardTitle>Issue index unavailable</CardTitle>
            <CardDescription>{input.connection.detail}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
