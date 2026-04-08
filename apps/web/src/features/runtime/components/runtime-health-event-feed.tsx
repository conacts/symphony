"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from "@/components/ui/pagination";
import type { RuntimeHealthViewModel } from "@/features/runtime/model/runtime-health-view-model";

const levelVariantMap: Record<
  RuntimeHealthViewModel["recentEventRows"][number]["level"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  error: "destructive",
  warn: "secondary",
  info: "outline",
  debug: "outline"
};

const PAGE_SIZE = 5;

export function RuntimeHealthEventFeed(input: {
  rows: RuntimeHealthViewModel["recentEventRows"];
}) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(input.rows.length / PAGE_SIZE));

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return input.rows.slice(start, start + PAGE_SIZE);
  }, [input.rows, page]);

  const rangeStart = input.rows.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, input.rows.length);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent runtime events</CardTitle>
        <CardDescription>
          The latest scheduler and runtime events, paginated into compact accordion rows.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No runtime events have been captured yet.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <p>
                Showing {rangeStart}-{rangeEnd} of {input.rows.length} events.
              </p>
              <p>
                Page {page} of {pageCount}
              </p>
            </div>

            <Accordion type="single" collapsible className="rounded-xl border border-border/70">
              {pageRows.map((row) => (
                <AccordionItem key={row.entryId} value={row.entryId} className="px-4">
                  <AccordionTrigger className="py-4 hover:no-underline">
                    <div className="flex min-w-0 flex-1 flex-col gap-2 pr-4 text-left">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={levelVariantMap[row.level]}>{row.level}</Badge>
                        <Badge variant="secondary">{row.source}</Badge>
                        <Badge variant="outline">{row.eventType}</Badge>
                        <span className="text-xs text-muted-foreground">{row.recordedAt}</span>
                      </div>

                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">{row.message}</p>
                        <p className="text-xs text-muted-foreground">{row.scopeLabel}</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <pre className="overflow-x-auto rounded-lg bg-muted px-3 py-2 text-xs whitespace-pre-wrap break-words text-muted-foreground">
                      {row.detail}
                    </pre>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            {pageCount > 1 ? (
              <Pagination className="justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(event) => {
                        event.preventDefault();
                        setPage((current) => Math.max(1, current - 1));
                      }}
                      aria-disabled={page === 1}
                    />
                  </PaginationItem>
                  {Array.from({ length: pageCount }, (_, index) => {
                    const nextPage = index + 1;

                    return (
                      <PaginationItem key={nextPage}>
                        <PaginationLink
                          href="#"
                          isActive={page === nextPage}
                          onClick={(event) => {
                            event.preventDefault();
                            setPage(nextPage);
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
                      onClick={(event) => {
                        event.preventDefault();
                        setPage((current) => Math.min(pageCount, current + 1));
                      }}
                      aria-disabled={page === pageCount}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
