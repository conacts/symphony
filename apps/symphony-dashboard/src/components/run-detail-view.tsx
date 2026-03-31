import React from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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
import { buildRunDetailViewModel } from "@/core/forensics-view-model";
import type { SymphonyForensicsRunDetailResult } from "@symphony/contracts";

export function RunDetailView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  loading: boolean;
  runDetail: SymphonyForensicsRunDetailResult | null;
}) {
  const viewModel = input.runDetail
    ? buildRunDetailViewModel(input.runDetail)
    : null;

  return (
    <div className="flex flex-col gap-6">
      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Run detail degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {viewModel ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {viewModel.metrics.map((metric) => (
              <Card key={metric.label}>
                <CardHeader>
                  <CardDescription>{metric.label}</CardDescription>
                  <CardTitle className="text-2xl">{metric.value}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {metric.detail}
                </CardContent>
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
                              <TableHead>Event</TableHead>
                              <TableHead>At</TableHead>
                              <TableHead>Summary</TableHead>
                              <TableHead>Payload</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {turn.events.map((event) => (
                              <TableRow key={`${turn.turnSequence}:${event.eventSequence}`}>
                                <TableCell>{event.eventSequence}</TableCell>
                                <TableCell>{event.eventType}</TableCell>
                                <TableCell>{event.recordedAt}</TableCell>
                                <TableCell>{event.summary}</TableCell>
                                <TableCell>
                                  <details>
                                    <summary>{event.payloadLabel}</summary>
                                    <pre className="mt-2 overflow-x-auto rounded-lg border border-border/70 bg-background/70 p-3 text-xs leading-6 text-muted-foreground">
                                      {event.payloadText}
                                    </pre>
                                  </details>
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
        </>
      ) : input.loading ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
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
