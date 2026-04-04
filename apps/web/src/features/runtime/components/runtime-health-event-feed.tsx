import React from "react";
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

export function RuntimeHealthEventFeed(input: {
  rows: RuntimeHealthViewModel["recentEventRows"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent runtime events</CardTitle>
        <CardDescription>
          Latest scheduler and runtime events, rendered as a readable investigation feed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {input.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No runtime events have been captured yet.
          </p>
      ) : (
        <div className="flex flex-col gap-4">
          {input.rows.map((row) => (
            <Accordion
              key={row.entryId}
              type="multiple"
              className="rounded-xl border border-border/70 px-4"
            >
              <AccordionItem value={row.entryId} className="border-none">
                <AccordionTrigger className="py-4 hover:no-underline">
                  <div className="flex min-w-0 flex-1 flex-col gap-3 pr-4 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={levelVariantMap[row.level]}>{row.level}</Badge>
                      <Badge variant="secondary">{row.source}</Badge>
                      <Badge variant="outline">{row.eventType}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {row.recordedAt}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-medium text-foreground">{row.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.scopeLabel}
                      </p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <pre className="overflow-x-auto rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                    {row.detail}
                  </pre>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          ))}
        </div>
      )}
      </CardContent>
    </Card>
  );
}
