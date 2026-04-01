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

type SelectedPayload = {
  eventSequence: string;
  eventType: string;
  payloadText: string;
  promptText: string;
  recordedAt: string;
  sessionLabel: string;
  status: string;
  summary: string;
  turnTitle: string;
};

export function RunDetailView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  loading: boolean;
  runDetail: SymphonyForensicsRunDetailResult | null;
}) {
  const [selectedPayload, setSelectedPayload] = useState<SelectedPayload | null>(null);
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
                    <TableHead>Event</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead>Payload</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eventRows.map((event) => (
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
                            setSelectedPayload({
                              eventSequence: event.eventSequence,
                              eventType: event.eventType,
                              payloadText: event.payloadText,
                              promptText: event.promptText,
                              recordedAt: event.recordedAt,
                              sessionLabel: event.sessionLabel,
                              status: event.status,
                              summary: event.summary,
                              turnTitle: event.turnTitle
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
            </CardContent>
          </Card>

          <Drawer
            direction="right"
            open={selectedPayload !== null}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedPayload(null);
              }
            }}
          >
            <DrawerContent className="data-[vaul-drawer-direction=right]:w-full data-[vaul-drawer-direction=right]:max-w-2xl">
              <DrawerHeader>
                <DrawerTitle>
                  {selectedPayload?.turnTitle ?? "Payload"}
                </DrawerTitle>
                <DrawerDescription>
                  {selectedPayload
                    ? `${selectedPayload.eventType} · ${selectedPayload.turnTitle} · ${selectedPayload.recordedAt}`
                    : "Payload details"}
                </DrawerDescription>
              </DrawerHeader>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 pb-4">
                {selectedPayload ? (
                  <>
                    <div className="text-sm text-muted-foreground">
                      {selectedPayload.summary}
                    </div>
                    <div className="rounded-xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
                      <div>
                        Session {selectedPayload.sessionLabel} · {selectedPayload.status}
                      </div>
                      <div className="mt-2 font-medium text-foreground">
                        {selectedPayload.promptText}
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border/70 bg-background/70 p-4">
                      <pre className="overflow-x-auto text-xs leading-6 text-muted-foreground">
                        {selectedPayload.payloadText}
                      </pre>
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
