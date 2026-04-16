"use client";

import React, { useEffect, useState } from "react";
import type {
  SymphonyRuntimeIssueCapabilityState,
  SymphonyRuntimeIssuePendingClarification,
  SymphonyRuntimeIssueResult
} from "@symphony/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { submitRuntimeClarificationAnswer } from "@/core/runtime-operator-client";

export function IssueCapabilityStatusCard(input: {
  issue: SymphonyRuntimeIssueResult;
  runtimeBaseUrl?: string;
  onUpdated?: () => Promise<void> | void;
}) {
  const capability = input.issue.operator.capability;
  const pendingClarification =
    input.issue.operator.pendingClarification ??
    capability?.pendingClarification ??
    null;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!pendingClarification || pendingClarification.kind !== "capability") {
      setAnswers({});
      setError(null);
      setSuccess(null);
      return;
    }

    setAnswers(
      Object.fromEntries(
        pendingClarification.questions.map((question) => [question.id, ""])
      )
    );
    setError(null);
    setSuccess(null);
  }, [pendingClarification?.kind, pendingClarification?.requestId]);

  if (!capability && !pendingClarification) {
    return null;
  }

  async function handleClarificationSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!pendingClarification || pendingClarification.kind !== "capability") {
      return;
    }

    if (!input.runtimeBaseUrl) {
      setError("Runtime base URL is unavailable for clarification submission.");
      return;
    }

    const trimmedAnswers = Object.fromEntries(
      pendingClarification.questions.map((question) => [
        question.id,
        (answers[question.id] ?? "").trim()
      ])
    );
    const firstMissingAnswer = pendingClarification.questions.find(
      (question) => trimmedAnswers[question.id]?.length === 0
    );
    if (firstMissingAnswer) {
      setError(`Answer ${firstMissingAnswer.id} before submitting clarification.`);
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await submitRuntimeClarificationAnswer(
        input.runtimeBaseUrl,
        pendingClarification.answerPath,
        {
          requestId: pendingClarification.requestId,
          answers: trimmedAnswers
        }
      );
      setSuccess(
        `Clarification recorded. Planner now reports ${formatPlanKind(
          result.capability.planKind
        )}.`
      );
      await input.onUpdated?.();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Failed to submit clarification."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {capability
              ? formatPlanKind(capability.planKind)
              : formatPendingClarificationKind(pendingClarification)}
          </Badge>
          {capability?.capabilityId ? (
            <Badge variant="outline" className="font-mono">
              {capability.capabilityId}
            </Badge>
          ) : null}
          {capability?.modelProfileId ? (
            <Badge variant="outline" className="font-mono">
              {capability.modelProfileId}
            </Badge>
          ) : null}
          {capability?.workEpoch ? (
            <Badge variant="outline">Epoch {capability.workEpoch}</Badge>
          ) : null}
          {pendingClarification?.kind === "contract_intake" ? (
            <Badge variant="outline">Execution not started</Badge>
          ) : null}
        </div>
        <div>
          <CardTitle>
            {pendingClarification?.kind === "contract_intake"
              ? "Ticket clarification"
              : "Capability Router"}
          </CardTitle>
          <CardDescription>
            {capability?.summary ?? pendingClarification?.summary}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {capability?.completion ? (
          <div className="rounded-xl border border-border/70 bg-muted/30 p-4 text-sm">
            <p className="font-medium text-foreground">Completion gate</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              {capability.completion.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {pendingClarification?.kind === "capability" ? (
          <form className="flex flex-col gap-4" onSubmit={handleClarificationSubmit}>
            <div className="rounded-xl border border-amber-300/60 bg-amber-50/70 p-4">
              <p className="text-sm font-medium text-foreground">
                Clarification required
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {pendingClarification.summary}
              </p>
            </div>

            {pendingClarification.questions.map((question) => (
              <label key={question.id} className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">
                  {question.prompt}
                </span>
                {question.context ? (
                  <span className="text-xs text-muted-foreground">
                    {question.context}
                  </span>
                ) : null}
                <Textarea
                  name={question.id}
                  value={answers[question.id] ?? ""}
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      [question.id]: event.target.value
                    }))
                  }
                  placeholder={`Answer ${question.id}`}
                  rows={3}
                />
              </label>
            ))}

            {error ? (
              <Alert variant="destructive">
                <AlertTitle>Clarification submission failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {success ? (
              <Alert>
                <AlertTitle>Clarification recorded</AlertTitle>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit Clarification"}
              </Button>
            </div>
          </form>
        ) : null}

        {pendingClarification?.kind === "contract_intake" ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-amber-300/60 bg-amber-50/70 p-4">
              <p className="text-sm font-medium text-foreground">
                Execution has not started yet
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {pendingClarification.summary}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                {pendingClarification.nextAction}
              </p>
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <p className="text-sm font-medium text-foreground">
                Missing ticket detail
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                {pendingClarification.questions.map((question) => (
                  <li key={question.id}>
                    {question.prompt}
                    {question.context ? ` ${question.context}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function formatPlanKind(
  planKind: SymphonyRuntimeIssueCapabilityState["planKind"]
): string {
  switch (planKind) {
    case "execute":
      return "Ready To Execute";
    case "awaiting_input":
      return "Awaiting Input";
    case "blocked":
      return "Blocked";
    case "ready_for_completion":
      return "Ready For Completion";
    default:
      return String(planKind);
  }
}

function formatPendingClarificationKind(
  pendingClarification: SymphonyRuntimeIssuePendingClarification | null
): string {
  if (pendingClarification?.kind === "contract_intake") {
    return "Ticket Clarification";
  }

  return "Awaiting Input";
}
