"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ChevronDown, Columns3 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { buildIssueIndexViewModel } from "@/core/forensics-view-model";
import type { RuntimeSummaryConnectionState } from "@/core/runtime-summary-view-model";
import type {
  SymphonyForensicsIssueListResult,
  SymphonyForensicsIssuesQuery
} from "@symphony/contracts";

const defaultColumns = [
  "issue",
  "runs",
  "problemRate",
  "latestProblem",
  "lastCompleted",
  "retries",
  "avgDuration",
  "lastActive"
] as const;

const columnLabels: Record<(typeof defaultColumns)[number], string> = {
  issue: "Issue",
  runs: "Runs",
  problemRate: "Problem rate",
  latestProblem: "Latest problem",
  lastCompleted: "Last completed",
  retries: "Retries",
  avgDuration: "Avg duration",
  lastActive: "Last active"
};

const timeRangeOptions = [
  { value: "all", label: "All time" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" }
] as const;

const sortOptions = [
  { value: "lastActive", label: "Last active" },
  { value: "problemRate", label: "Problem rate" },
  { value: "retries", label: "Retries" },
  { value: "runCount", label: "Run count" },
  { value: "avgDuration", label: "Avg duration" }
] as const;

export function IssueIndexView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  issueIndex: SymphonyForensicsIssueListResult | null;
  loading: boolean;
  onQueryChange: (query: SymphonyForensicsIssuesQuery) => void;
  query: SymphonyForensicsIssuesQuery;
  runtimeBaseUrl: string;
}) {
  const [columns, setColumns] = useState<string[]>([...defaultColumns]);
  const viewModel = input.issueIndex ? buildIssueIndexViewModel(input.issueIndex) : null;

  function updateQuery(next: Partial<SymphonyForensicsIssuesQuery>) {
    input.onQueryChange({
      ...input.query,
      ...next
    });
  }

  function updateTimeRange(value: "all" | "24h" | "7d" | "30d") {
    const now = Date.now();
    const lookbackMs =
      value === "24h"
        ? 24 * 60 * 60 * 1000
        : value === "7d"
          ? 7 * 24 * 60 * 60 * 1000
          : value === "30d"
            ? 30 * 24 * 60 * 60 * 1000
            : null;

    updateQuery({
      timeRange: value,
      startedAfter: lookbackMs === null ? undefined : new Date(now - lookbackMs).toISOString(),
      startedBefore: undefined
    });
  }

  function toggleColumn(column: string) {
    setColumns((current) =>
      current.includes(column)
        ? current.filter((currentColumn) => currentColumn !== column)
        : [...current, column]
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Issue forensics degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {viewModel ? (
        <>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold tracking-tight">Issues</h1>
              <p className="text-sm text-muted-foreground">
                Historical process forensics for Symphony issue execution
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    {labelForTimeRange(input.query.timeRange ?? "all")}
                    <ChevronDown className="ml-2 size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Time range</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={input.query.timeRange ?? "all"}
                    onValueChange={(value) =>
                      updateTimeRange(value as "all" | "24h" | "7d" | "30d")
                    }
                  >
                    {timeRangeOptions.map((option) => (
                      <DropdownMenuRadioItem key={option.value} value={option.value}>
                        {option.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {viewModel.summaryCards.map((card) => (
              <Card key={card.label}>
                <CardHeader className="space-y-1 pb-2">
                  <CardDescription>{card.label}</CardDescription>
                  <CardTitle className="text-2xl">{card.value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </section>

          <Card>
            <CardHeader className="gap-4">
              <div className="flex flex-col gap-1">
                <CardTitle>Issue table</CardTitle>
                <CardDescription>
                  Recent issue activity and outcome trends.
                </CardDescription>
              </div>
              <div className="flex flex-col gap-2 xl:flex-row xl:flex-wrap">
                <FilterDropdown
                  label="Outcome"
                  value={input.query.outcome ?? ""}
                  options={[
                    { value: "", label: "All outcomes" },
                    ...viewModel.facets.outcomes.map((outcome) => ({
                      value: outcome,
                      label: outcome
                    }))
                  ]}
                  onChange={(value) =>
                    updateQuery({
                      outcome: value === "" ? undefined : value
                    })
                  }
                />
                <FilterDropdown
                  label="Error class"
                  value={input.query.errorClass ?? ""}
                  options={[
                    { value: "", label: "All error classes" },
                    ...viewModel.facets.errorClasses.map((errorClass) => ({
                      value: errorClass,
                      label: errorClass
                    }))
                  ]}
                  onChange={(value) =>
                    updateQuery({
                      errorClass: value === "" ? undefined : value
                    })
                  }
                />
                <FilterDropdown
                  label="Sort by"
                  value={input.query.sortBy ?? "lastActive"}
                  options={sortOptions.map((option) => ({
                    value: option.value,
                    label: option.label
                  }))}
                  onChange={(value) =>
                    updateQuery({
                      sortBy: value as SymphonyForensicsIssuesQuery["sortBy"]
                    })
                  }
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Columns3 className="mr-2 size-4" />
                      Columns
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel>Columns</DropdownMenuLabel>
                    {defaultColumns.map((column) => (
                      <DropdownMenuCheckboxItem
                        key={column}
                        checked={columns.includes(column)}
                        onCheckedChange={() => toggleColumn(column)}
                      >
                        {columnLabels[column]}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent>
              {viewModel.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No recorded issue runs match the current forensic scope.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {columns.includes("issue") ? <TableHead>Issue</TableHead> : null}
                      {columns.includes("runs") ? <TableHead>Runs</TableHead> : null}
                      {columns.includes("problemRate") ? <TableHead>Problem rate</TableHead> : null}
                      {columns.includes("latestProblem") ? (
                        <TableHead>Latest problem</TableHead>
                      ) : null}
                      {columns.includes("lastCompleted") ? (
                        <TableHead>Last completed</TableHead>
                      ) : null}
                      {columns.includes("retries") ? <TableHead>Retries</TableHead> : null}
                      {columns.includes("avgDuration") ? (
                        <TableHead>Avg duration</TableHead>
                      ) : null}
                      {columns.includes("lastActive") ? <TableHead>Last active</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewModel.rows.map((row) => (
                      <TableRow key={row.issueIdentifier}>
                        {columns.includes("issue") ? (
                          <TableCell>
                            <Link
                              className="font-medium underline underline-offset-4"
                              href={row.issueHref}
                            >
                              {row.issueIdentifier}
                            </Link>
                          </TableCell>
                        ) : null}
                        {columns.includes("runs") ? <TableCell>{row.runCount}</TableCell> : null}
                        {columns.includes("problemRate") ? (
                          <TableCell>{row.problemRate}</TableCell>
                        ) : null}
                        {columns.includes("latestProblem") ? (
                          <TableCell>{row.latestProblemOutcome}</TableCell>
                        ) : null}
                        {columns.includes("lastCompleted") ? (
                          <TableCell>{row.lastCompletedOutcome}</TableCell>
                        ) : null}
                        {columns.includes("retries") ? <TableCell>{row.retryCount}</TableCell> : null}
                        {columns.includes("avgDuration") ? (
                          <TableCell>{row.avgDuration}</TableCell>
                        ) : null}
                        {columns.includes("lastActive") ? (
                          <TableCell>{row.lastActive}</TableCell>
                        ) : null}
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
          {Array.from({ length: 8 }, (_, index) => (
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
            <CardTitle>Issue forensics unavailable</CardTitle>
            <CardDescription>{input.connection.detail}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}

function FilterDropdown(input: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{
    value: string;
    label: string;
  }>;
  value: string;
}) {
  const currentLabel =
    input.options.find((option) => option.value === input.value)?.label ?? input.label;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">
          {currentLabel}
          <ChevronDown className="ml-2 size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{input.label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={input.value} onValueChange={input.onChange}>
          {input.options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function labelForTimeRange(value: string): string {
  return timeRangeOptions.find((option) => option.value === value)?.label ?? "All time";
}
