"use client";

import React from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
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
import type { RuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";
import type {
  SymphonyForensicsIssueListResult,
  SymphonyForensicsIssuesQuery
} from "@symphony/contracts";
import { IssueOutcomeChart } from "@/features/issues/components/issue-outcome-chart";
import { IssuePressureChart } from "@/features/issues/components/issue-pressure-chart";
import { buildIssueIndexViewModel } from "@/features/issues/model/issue-view-model";

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
  const viewModel = input.issueIndex
    ? buildIssueIndexViewModel(input.issueIndex)
    : null;

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
      startedAfter:
        lookbackMs === null
          ? undefined
          : new Date(now - lookbackMs).toISOString(),
      startedBefore: undefined
    });
  }

  function navigateToIssue(href: string) {
    window.location.assign(href);
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
                Codex-native issue inventory for deciding what to inspect next.
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

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {viewModel.summaryCards.map((card) => (
              <Card key={card.label}>
                <CardHeader className="space-y-1 pb-2">
                  <CardDescription>{card.label}</CardDescription>
                  <CardTitle className="text-2xl">{card.value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <IssueOutcomeChart rows={viewModel.outcomeChartRows} />
            <IssuePressureChart rows={viewModel.pressureChartRows} />
          </section>

          <section className="grid gap-3 xl:grid-cols-2">
            {viewModel.focusCards.map((card) => (
              <Card key={card.label}>
                <CardHeader className="space-y-2">
                  <CardDescription>{card.label}</CardDescription>
                  <CardTitle className="text-xl">{card.value}</CardTitle>
                  <CardDescription>{card.detail}</CardDescription>
                </CardHeader>
                {card.href ? (
                  <CardContent className="pt-0">
                    <Button asChild size="sm" variant="outline">
                      <Link href={card.href}>Open issue</Link>
                    </Button>
                  </CardContent>
                ) : null}
              </Card>
            ))}
          </section>

          <Card>
            <CardHeader className="gap-4">
              <div className="flex flex-col gap-1">
                <CardTitle>Issue inventory</CardTitle>
                <CardDescription>
                  One row per issue, with enough context to decide where to drill in next.
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
                      <TableHead>Issue</TableHead>
                      <TableHead>Runs</TableHead>
                      <TableHead>Problem rate</TableHead>
                      <TableHead>Latest problem</TableHead>
                      <TableHead>Retries</TableHead>
                      <TableHead>Last active</TableHead>
                      <TableHead>Latest error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewModel.rows.map((row) => (
                      <TableRow
                        key={row.issueIdentifier}
                        tabIndex={0}
                        className="cursor-pointer"
                        onClick={() => navigateToIssue(row.issueHref)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            navigateToIssue(row.issueHref);
                          }
                        }}
                      >
                        <TableCell className="font-medium">
                          <div className="flex flex-col gap-1">
                            <span>{row.issueIdentifier}</span>
                            <span className="text-xs text-muted-foreground">
                              {row.flags.length > 0
                                ? row.flags.join(" · ")
                                : "No active issue flags"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{row.runCount}</TableCell>
                        <TableCell>{row.problemRate}</TableCell>
                        <TableCell>{row.latestProblemOutcome}</TableCell>
                        <TableCell>{row.retryCount}</TableCell>
                        <TableCell>{row.lastActive}</TableCell>
                        <TableCell className="max-w-sm">
                          <div className="flex flex-col gap-1">
                            <span>{row.latestErrorClass}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              {row.latestErrorMessage}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      ) : input.loading ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
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
    label: string;
    value: string;
  }>;
  value: string;
}) {
  const currentLabel =
    input.options.find((option) => option.value === input.value)?.label ??
    input.label;

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
  return (
    timeRangeOptions.find((option) => option.value === value)?.label ??
    "All time"
  );
}
