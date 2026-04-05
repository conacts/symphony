"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
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
import type { AnalysisQuery } from "@/features/analysis/model/analysis-query-state";
import type { AnalysisFilterOptions } from "@/features/analysis/model/analysis-sample-filter";

const allHarnessesValue = "__all_harnesses__";
const allProvidersValue = "__all_providers__";
const allModelsValue = "__all_models__";

export function AnalysisFilterBar(input: {
  query: AnalysisQuery;
  options: AnalysisFilterOptions;
  sampledRunCount: number;
  sampledIssueCount: number;
  onQueryChange(query: AnalysisQuery): void;
}) {
  return (
    <Card>
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-base">Analysis filters</CardTitle>
        <CardDescription>
          Narrow the current analysis sample by harness, provider, and model.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Select
            value={input.query.harness ?? allHarnessesValue}
            onValueChange={(value) => {
              input.onQueryChange({
                ...input.query,
                harness: value === allHarnessesValue ? undefined : (value as AnalysisQuery["harness"])
              });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All harnesses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={allHarnessesValue}>All harnesses</SelectItem>
              {input.options.harnesses.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={input.query.provider ?? allProvidersValue}
            onValueChange={(value) => {
              input.onQueryChange({
                ...input.query,
                provider: value === allProvidersValue ? undefined : value
              });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All providers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={allProvidersValue}>All providers</SelectItem>
              {input.options.providers.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={input.query.model ?? allModelsValue}
            onValueChange={(value) => {
              input.onQueryChange({
                ...input.query,
                model: value === allModelsValue ? undefined : value
              });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All models" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={allModelsValue}>All models</SelectItem>
              {input.options.models.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              {input.sampledRunCount} sampled runs
            </Badge>
            <Badge variant="secondary">
              {input.sampledIssueCount} sampled issues
            </Badge>
          </div>

          <p className="text-sm text-muted-foreground">
            Filter options come from the currently sampled runs, so zero-result states remain explainable.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
