"use client";

import React, { useEffect, useMemo, useState } from "react";
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
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from "@/components/ui/pagination";
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
import {
  formatErrorClassLabel,
  formatOutcomeLabel
} from "@/core/display-formatters";

const ISSUE_INVENTORY_PAGE_SIZE = 8;

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
}) {
  const [inventoryPage, setInventoryPage] = useState(1);
  const [inventoryFilters, setInventoryFilters] = useState({
    repo: "",
    outcome: "",
    errorClass: ""
  });
  const viewModel = input.issueIndex
    ? buildIssueIndexViewModel(input.issueIndex)
    : null;
  const inventoryFilterKey = [
    inventoryFilters.repo,
    inventoryFilters.outcome,
    inventoryFilters.errorClass,
    input.query.timeRange ?? "all",
    input.query.sortBy ?? "lastActive",
    input.query.sortDirection ?? "desc"
  ].join("|");
  const filteredInventoryRows = useMemo(() => {
    if (!viewModel) {
      return [];
    }

    return viewModel.rows.filter((row) => {
      if (
        inventoryFilters.repo &&
        row.repositoryKey !== inventoryFilters.repo
      ) {
        return false;
      }

      if (inventoryFilters.outcome) {
        const outcomeLabel = formatOutcomeLabel(inventoryFilters.outcome);
        if (
          row.latestProblemOutcome !== outcomeLabel &&
          row.lastCompletedOutcome !== outcomeLabel
        ) {
          return false;
        }
      }

      if (inventoryFilters.errorClass) {
        const errorClassLabel = formatErrorClassLabel(
          inventoryFilters.errorClass
        );
        if (row.latestErrorClass !== errorClassLabel) {
          return false;
        }
      }

      return true;
    });
  }, [inventoryFilters, viewModel]);
  const inventoryPageCount = Math.max(
    1,
    Math.ceil(filteredInventoryRows.length / ISSUE_INVENTORY_PAGE_SIZE)
  );
  const visibleInventoryPage = Math.min(inventoryPage, inventoryPageCount);
  const inventoryRows = useMemo(() => {
    const start = (visibleInventoryPage - 1) * ISSUE_INVENTORY_PAGE_SIZE;
    return filteredInventoryRows.slice(start, start + ISSUE_INVENTORY_PAGE_SIZE);
  }, [filteredInventoryRows, visibleInventoryPage]);
  const inventoryRangeStart =
    filteredInventoryRows.length === 0
      ? 0
      : (visibleInventoryPage - 1) * ISSUE_INVENTORY_PAGE_SIZE + 1;
  const inventoryRangeEnd =
    filteredInventoryRows.length === 0
      ? 0
      : Math.min(
          visibleInventoryPage * ISSUE_INVENTORY_PAGE_SIZE,
          filteredInventoryRows.length
        );

  useEffect(() => {
    setInventoryPage((current) => Math.min(current, inventoryPageCount));
  }, [inventoryPageCount]);

  useEffect(() => {
    setInventoryPage(1);
  }, [inventoryFilterKey]);

  function updateQuery(next: Partial<SymphonyForensicsIssuesQuery>) {
    setInventoryPage(1);
    input.onQueryChange({
      ...input.query,
      ...next
    });
  }

  function updateTimeRange(value: "all" | "24h" | "7d" | "30d") {
    updateQuery({
      timeRange: value,
      startedAfter: undefined,
      startedBefore: undefined
    });
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
                Weekly issue posture, failure mix, and a paginated inventory for drilling in.
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

          <section className="grid gap-6 xl:grid-cols-2">
            <IssueOutcomeChart rows={viewModel.outcomeChartRows} />
            <IssuePressureChart rows={viewModel.pressureChartRows} />
          </section>

          <Card>
            <CardHeader className="gap-4">
              <div className="flex flex-col gap-1">
                <CardTitle>Issue inventory</CardTitle>
                <CardDescription>
                  One row per issue, condensed into pages so the page stays readable.
                  Filters here only affect the inventory.
                </CardDescription>
              </div>
              <div className="flex flex-col gap-2 xl:flex-row xl:flex-wrap">
                <FilterDropdown
                  label="Repository"
                  value={inventoryFilters.repo}
                  options={[
                    { value: "", label: "All repositories" },
                    ...viewModel.facets.repositories.map((repositoryKey) => ({
                      value: repositoryKey,
                      label: repositoryKey
                    }))
                  ]}
                  onChange={(value) =>
                    setInventoryFilters((current) => ({
                      ...current,
                      repo: value
                    }))
                  }
                />
                <FilterDropdown
                  label="Outcome"
                  value={inventoryFilters.outcome}
                  options={[
                    { value: "", label: "All outcomes" },
                    ...viewModel.facets.outcomes.map((outcome) => ({
                      value: outcome,
                      label: formatOutcomeLabel(outcome)
                    }))
                  ]}
                  onChange={(value) =>
                    setInventoryFilters((current) => ({
                      ...current,
                      outcome: value
                    }))
                  }
                />
                <FilterDropdown
                  label="Error class"
                  value={inventoryFilters.errorClass}
                  options={[
                    { value: "", label: "All error classes" },
                    ...viewModel.facets.errorClasses.map((errorClass) => ({
                      value: errorClass,
                      label: formatErrorClassLabel(errorClass)
                    }))
                  ]}
                  onChange={(value) =>
                    setInventoryFilters((current) => ({
                      ...current,
                      errorClass: value
                    }))
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
              {filteredInventoryRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No recorded issue runs match the current inventory filters.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                    <p>
                      Showing {inventoryRangeStart}-{inventoryRangeEnd} of {filteredInventoryRows.length} issues.
                    </p>
                    <p>
                      Page {visibleInventoryPage} of {inventoryPageCount}
                    </p>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Issue</TableHead>
                        <TableHead>Runs</TableHead>
                        <TableHead>Retries</TableHead>
                        <TableHead>Problem rate</TableHead>
                        <TableHead>Latest problem</TableHead>
                        <TableHead>Last active</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventoryRows.map((row) => (
                        <TableRow key={`${row.repositoryKey}:${row.issueIdentifier}`}>
                          <TableCell className="font-medium">
                            <Link
                              href={row.issueHref}
                              className="w-fit underline-offset-4 hover:underline focus-visible:underline"
                            >
                              {row.issueIdentifier}
                            </Link>
                          </TableCell>
                          <TableCell>{row.runCount}</TableCell>
                          <TableCell>{row.retryCount}</TableCell>
                          <TableCell>{row.problemRate}</TableCell>
                          <TableCell>{row.latestProblemOutcome}</TableCell>
                          <TableCell>{row.lastActive}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {inventoryPageCount > 1 ? (
                    <Pagination className="justify-end">
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            href="#"
                            aria-disabled={visibleInventoryPage === 1}
                            onClick={(event) => {
                              event.preventDefault();
                              setInventoryPage((current) => Math.max(1, current - 1));
                            }}
                          />
                        </PaginationItem>
                        {Array.from({ length: inventoryPageCount }, (_, index) => {
                          const nextPage = index + 1;

                          return (
                            <PaginationItem key={nextPage}>
                              <PaginationLink
                                href="#"
                                isActive={visibleInventoryPage === nextPage}
                                onClick={(event) => {
                                  event.preventDefault();
                                  setInventoryPage(nextPage);
                                }}
                              >
                                {nextPage}
                              </PaginationLink>
                            </PaginationItem>
                          );
                        })}
                        <PaginationItem>
                          <PaginationNext
                            href="#"
                            aria-disabled={visibleInventoryPage === inventoryPageCount}
                            onClick={(event) => {
                              event.preventDefault();
                              setInventoryPage((current) =>
                                Math.min(inventoryPageCount, current + 1)
                              );
                            }}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  ) : null}
                </div>
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
