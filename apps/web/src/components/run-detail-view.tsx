"use client";

import React, { useState } from "react";
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
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle
} from "@/components/ui/drawer";
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
import { buildRunDetailViewModel } from "@/core/forensics-view-model";
import type { SymphonyForensicsRunDetailResult } from "@symphony/contracts";

const turnsPerPage = 10;

type SelectedTurn = {
  eventCount: string;
  events: Array<{
    eventSequence: string;
    eventType: string;
    payloadText: string;
    recordedAt: string;
    summary: string;
  }>;
  promptText: string;
  latestEventAt: string;
  latestEventType: string;
  sessionLabel: string;
  status: string;
  turnTitle: string;
};

export function RunDetailView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  loading: boolean;
  runDetail: SymphonyForensicsRunDetailResult | null;
}) {
  const [page, setPage] = useState(1);
  const [selectedTurn, setSelectedTurn] = useState<SelectedTurn | null>(null);
  const viewModel = input.runDetail
    ? buildRunDetailViewModel(input.runDetail)
    : null;
  const totalPages = viewModel
    ? Math.max(1, Math.ceil(viewModel.turns.length / turnsPerPage))
    : 1;
  const paginatedTurns = viewModel
    ? viewModel.turns.slice((page - 1) * turnsPerPage, page * turnsPerPage)
    : [];

  return (
    <div className="flex flex-col gap-8">
      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Run detail degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {viewModel ? (
        <>
          <section className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              {viewModel.issueIdentifier}
            </h1>
            <p className="text-sm text-muted-foreground">
              Started {viewModel.startedAt}
            </p>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {viewModel.metrics.map((metric) => (
              <Card key={metric.label}>
                <CardHeader>
                  <CardDescription>{metric.label}</CardDescription>
                  <CardTitle className="text-2xl">{metric.value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Repo start</CardTitle>
                <CardDescription>
                  Best-effort snapshot captured before the work began.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded-xl border border-border/70 bg-background/70 p-4 text-xs leading-6 text-muted-foreground">
                  {viewModel.repoStartText}
                </pre>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Repo end</CardTitle>
                <CardDescription>
                  Best-effort snapshot captured after the run ended.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded-xl border border-border/70 bg-background/70 p-4 text-xs leading-6 text-muted-foreground">
                  {viewModel.repoEndText}
                </pre>
              </CardContent>
            </Card>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Turns</CardTitle>
              <CardDescription>
                Turn activity with the latest event details inline.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Turn</TableHead>
                    <TableHead>At</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Events</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead>Payload</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTurns.map((turn) => (
                    <TableRow key={turn.turnSequence}>
                      <TableCell className="font-medium">
                        {turn.turnSequence}
                      </TableCell>
                      <TableCell>{turn.latestEventAt}</TableCell>
                      <TableCell>{turn.sessionLabel}</TableCell>
                      <TableCell>{turn.status}</TableCell>
                      <TableCell>{turn.eventCount}</TableCell>
                      <TableCell>{turn.latestEventType}</TableCell>
                      <TableCell>{turn.latestSummary}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setSelectedTurn({
                              eventCount: turn.eventCount,
                              events: turn.events.map((event) => ({
                                eventSequence: event.eventSequence,
                                eventType: event.eventType,
                                payloadText: event.payloadText,
                                recordedAt: event.recordedAt,
                                summary: event.summary
                              })),
                              promptText: turn.promptText,
                              latestEventAt: turn.latestEventAt,
                              latestEventType: turn.latestEventType,
                              sessionLabel: turn.sessionLabel,
                              status: turn.status,
                              turnTitle: turn.title
                            })
                          }
                        >
                          View payload
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= totalPages}
                    onClick={() =>
                      setPage((current) => Math.min(totalPages, current + 1))
                    }
                  >
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Drawer
            direction="right"
            open={selectedTurn !== null}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedTurn(null);
              }
            }}
          >
            <DrawerContent className="h-svh data-[vaul-drawer-direction=right]:w-full data-[vaul-drawer-direction=right]:max-w-3xl">
              <DrawerHeader>
                <DrawerTitle>
                  {selectedTurn?.turnTitle ?? "Turn details"}
                </DrawerTitle>
                <DrawerDescription>
                  {selectedTurn
                    ? `${selectedTurn.latestEventType} · ${selectedTurn.latestEventAt}`
                    : "Turn details"}
                </DrawerDescription>
              </DrawerHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                {selectedTurn ? (
                  <>
                    <div className="flex flex-col gap-4">
                      <div className="rounded-xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
                        <div>
                          Session {selectedTurn.sessionLabel} · {selectedTurn.status} ·{" "}
                          {selectedTurn.eventCount} events
                        </div>
                        <div className="mt-2 font-medium text-foreground">
                          {selectedTurn.promptText}
                        </div>
                      </div>
                      {selectedTurn.events.map((event) => (
                        <div
                          key={event.eventSequence}
                          className="flex flex-col gap-3 rounded-xl border border-border/70 bg-background/70 p-4"
                        >
                          <div className="flex flex-col gap-1">
                            <div className="text-sm font-medium text-foreground">
                              Event {event.eventSequence} · {event.eventType}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {event.recordedAt}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {event.summary}
                            </div>
                          </div>
                          <pre className="overflow-x-auto text-xs leading-6 text-muted-foreground">
                            {event.payloadText}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
              <DrawerFooter>
                <DrawerClose asChild>
                  <Button variant="outline">Close</Button>
                </DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
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
            <CardTitle>Run detail unavailable</CardTitle>
            <CardDescription>{input.connection.detail}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
