"use client";

import React from "react";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb";
import {
  buildIssueHref,
  buildIssuesHref,
  buildIssueRunHref,
  buildIssueRunTurnsHref
} from "@/core/control-plane-routes";

export function RunContextBreadcrumb(input: {
  issueIdentifier: string;
  runId: string;
  current: "run" | "turns" | "turn";
  turnLabel?: string;
}) {
  const issueHref = buildIssueHref(input.issueIdentifier);
  const issuesHref = buildIssuesHref();
  const runHref = buildIssueRunHref(input.issueIdentifier, input.runId);
  const turnsHref = buildIssueRunTurnsHref(input.issueIdentifier, input.runId);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href={issuesHref}>Issues</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href={issueHref}>{input.issueIdentifier}</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          {input.current === "run" ? (
            <BreadcrumbPage>{input.runId}</BreadcrumbPage>
          ) : (
            <BreadcrumbLink asChild>
              <Link href={runHref}>{input.runId}</Link>
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>
        {input.current === "run" ? null : (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {input.current === "turns" ? (
                <BreadcrumbPage>Turns</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link href={turnsHref}>Turns</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </>
        )}
        {input.current !== "turn" || !input.turnLabel ? null : (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{input.turnLabel}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
