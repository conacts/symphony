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

const eventsPerPage = 25;

type SelectedEvent = {
  eventSequence: string;
  eventType: string;
  payloadText: string;
  promptText: string;
  recordedAt: string;
  sessionLabel: string;
  status: string;
  turnTitle: string;
  summary: string;
};

export function RunDetailView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  loading: boolean;
  runDetail: SymphonyForensicsRunDetailResult | null;
}) {
  const [page, setPage] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState<SelectedEvent | null>(null);
  const viewModel = input.runDetail
    ? buildRunDetailViewModel(input.runDetail)
    : null;
  const eventRows = viewModel
    ? viewModel.turns.flatMap((turn) =>
        turn.events.map((event) => ({
          eventSequence: event.eventSequence,
          eventType: event.eventType,
          payloadText: event.payloadText,
          promptText: turn.promptText,
          recordedAt: event.recordedAt,
          sessionLabel: turn.sessionLabel,
          status: turn.status,
          summary: event.summary,
          turnSequence: turn.turnSequence,
          turnTitle: turn.title
        }))
      )
    : [];
  const totalPages = viewModel
    ? Math.max(1, Math.ceil(eventRows.length / eventsPerPage))
    : 1;
  const paginatedEvents = viewModel
    ? eventRows.slice((page - 1) * eventsPerPage, page * eventsPerPage)
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
              <CardTitle>Events</CardTitle>
              <CardDescription>
                Event activity across the run, with turn context inline.
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
                    <TableHead>Event</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead>Payload</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedEvents.map((event) => (
                    <TableRow key={`${event.turnSequence}:${event.eventSequence}`}>
                      <TableCell className="font-medium">
                        {event.turnSequence}
                      </TableCell>
                      <TableCell>{event.recordedAt}</TableCell>
                      <TableCell>{event.sessionLabel}</TableCell>
                      <TableCell>{event.status}</TableCell>
                      <TableCell>{event.eventType}</TableCell>
                      <TableCell>{event.summary}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setSelectedEvent({
                              eventSequence: event.eventSequence,
                              eventType: event.eventType,
                              payloadText: event.payloadText,
                              promptText: event.promptText,
                              recordedAt: event.recordedAt,
                              sessionLabel: event.sessionLabel,
                              status: event.status,
                              turnTitle: event.turnTitle,
                              summary: event.summary
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
            open={selectedEvent !== null}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedEvent(null);
              }
            }}
          >
            <DrawerContent className="h-svh data-[vaul-drawer-direction=right]:w-full data-[vaul-drawer-direction=right]:max-w-3xl">
              <DrawerHeader>
                <DrawerTitle>
                  {selectedEvent?.turnTitle ?? "Event details"}
                </DrawerTitle>
                <DrawerDescription>
                  {selectedEvent
                    ? `${selectedEvent.eventType} · ${selectedEvent.recordedAt}`
                    : "Event details"}
                </DrawerDescription>
              </DrawerHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                {selectedEvent ? (
                  <>
                    <div className="flex flex-col gap-4">
                      <div className="rounded-xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
                        <div>
                          Session {selectedEvent.sessionLabel} · {selectedEvent.status}
                        </div>
                        <div className="mt-2 font-medium text-foreground">
                          {selectedEvent.promptText}
                        </div>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
                        Event {selectedEvent.eventSequence} · {selectedEvent.summary}
                      </div>
                      <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                        <pre className="overflow-x-auto text-xs leading-6 text-muted-foreground">
                          {selectedEvent.payloadText}
                        </pre>
                      </div>
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
