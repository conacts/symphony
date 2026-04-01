"use client";

import React, { useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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
  recordedAt: string;
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
                Rendered prompts and raw event timelines.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible defaultValue="turn-1">
                {viewModel.turns.map((turn) => (
                  <AccordionItem
                    key={turn.turnSequence}
                    value={`turn-${turn.turnSequence}`}
                  >
                    <AccordionTrigger>
                      <div className="flex flex-col gap-1 text-left">
                        <span>{turn.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {turn.sessionLabel} · {turn.status} · {turn.eventCount} events
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="flex flex-col gap-4">
                        <pre className="overflow-x-auto rounded-xl border border-border/70 bg-background/70 p-4 text-xs leading-6 text-muted-foreground">
                          {turn.promptText}
                        </pre>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Seq</TableHead>
                              <TableHead>At</TableHead>
                              <TableHead>Event</TableHead>
                              <TableHead>Summary</TableHead>
                              <TableHead>Payload</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {turn.events.map((event) => (
                              <TableRow key={`${turn.turnSequence}:${event.eventSequence}`}>
                                <TableCell>{event.eventSequence}</TableCell>
                                <TableCell>{event.recordedAt}</TableCell>
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
                                        recordedAt: event.recordedAt,
                                        summary: event.summary,
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
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
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
                    ? `${selectedPayload.eventType} · seq ${selectedPayload.eventSequence} · ${selectedPayload.recordedAt}`
                    : "Payload details"}
                </DrawerDescription>
              </DrawerHeader>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 pb-4">
                {selectedPayload ? (
                  <>
                    <div className="text-sm text-muted-foreground">
                      {selectedPayload.summary}
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
