import React from "react";
import { ArrowUpRightIcon } from "lucide-react";
import type { SymphonyRuntimeIssueResult } from "@symphony/contracts";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export function IssueRequeuePanel(input: {
  error: string | null;
  issue: SymphonyRuntimeIssueResult | null;
  issueIdentifier: string;
  loading: boolean;
}) {
  const [modelPreview, setModelPreview] = React.useState<string | null>(null);
  const codexConfig = input.issue?.operator.codex ?? null;

  React.useEffect(() => {
    setModelPreview(null);
  }, [input.issue?.issueId, codexConfig?.selectedModel]);

  const selectedModel =
    modelPreview ?? codexConfig?.selectedModel ?? codexConfig?.defaultModel ?? null;
  const overrideLabel =
    selectedModel &&
    codexConfig &&
    selectedModel !== codexConfig.defaultModel
      ? `${codexConfig.modelOverrideLabelPrefix}${selectedModel}`
      : null;

  if (input.loading && !input.issue) {
    return (
      <section className="flex flex-col gap-4">
        <Skeleton className="h-9 w-72" />
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">
          {input.issue?.tracked.title ?? input.issueIdentifier}
        </h1>

        {input.issue ? (
          <div className="flex flex-wrap gap-2">
            {input.issue.tracked.url ? (
              <Button asChild variant="outline">
                <a
                  href={input.issue.tracked.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  Linear
                  <ArrowUpRightIcon data-icon="inline-end" />
                </a>
              </Button>
            ) : null}

            {input.issue.operator.githubPullRequestSearchUrl ? (
              <Button asChild variant="outline">
                <a
                  href={input.issue.operator.githubPullRequestSearchUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  GitHub
                  <ArrowUpRightIcon data-icon="inline-end" />
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Runtime issue context unavailable</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      {!input.issue ? (
        <p className="text-sm text-muted-foreground">
          No runtime issue context is available yet for this issue.
        </p>
      ) : null}

      {input.issue ? (
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Codex model</CardTitle>
            <CardDescription>
              The runtime default and the resolved model Symphony will use for future runs.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Selected model</p>
                <p className="font-medium">{selectedModel ?? "Unavailable"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Default model</p>
                <p className="font-medium">
                  {codexConfig?.defaultModel ?? "Unavailable"}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Model override helper</p>
              <Select
                value={selectedModel ?? undefined}
                onValueChange={(value) => {
                  setModelPreview(value);
                }}
              >
                <SelectTrigger className="w-full md:w-80">
                  <SelectValue placeholder="Choose a model" />
                </SelectTrigger>
                <SelectContent>
                  {codexConfig?.availableModels.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                {overrideLabel
                  ? `Apply the Linear label ${overrideLabel} to use this model for future runs.`
                  : "No label required. The current selection already matches the runtime default."}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Supported overrides</p>
              <div className="flex flex-wrap gap-2">
                {codexConfig?.availableModels.map((model) => (
                  <Badge key={model} variant="secondary">
                    {model}
                  </Badge>
                ))}
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              {codexConfig?.selectionHelpText}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
