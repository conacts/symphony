import type { SymphonyForensicsRunSummary } from "@symphony/contracts";
import type { CodexAnalysisSampleResource } from "@/features/analysis/hooks/load-codex-analysis-sample";
import type { AnalysisQuery } from "@/features/analysis/model/analysis-query-state";

export type AnalysisFilterOption = {
  value: string;
  label: string;
};

export type AnalysisFilterOptions = {
  harnesses: AnalysisFilterOption[];
  providers: AnalysisFilterOption[];
  models: AnalysisFilterOption[];
};

export function filterCodexAnalysisSample(
  input: CodexAnalysisSampleResource,
  query: AnalysisQuery
): CodexAnalysisSampleResource {
  return {
    ...input,
    sampledRuns: input.sampledRuns.filter((sampledRun) =>
      matchesAnalysisQuery(sampledRun.run, sampledRun.artifacts.run, query)
    )
  };
}

export function buildAnalysisFilterOptions(
  input: CodexAnalysisSampleResource
): AnalysisFilterOptions {
  const harnesses = new Map<string, AnalysisFilterOption>();
  const providers = new Map<string, AnalysisFilterOption>();
  const models = new Map<string, AnalysisFilterOption>();

  for (const sampledRun of input.sampledRuns) {
    const harness = sampledRun.artifacts.run.harnessKind ?? sampledRun.run.agentHarness;
    if (harness) {
      harnesses.set(harness, {
        value: harness,
        label: formatHarnessLabel(harness)
      });
    }

    const providerId = sampledRun.artifacts.run.providerId;
    if (providerId) {
      providers.set(providerId, {
        value: providerId,
        label: sampledRun.artifacts.run.providerName ?? providerId
      });
    }

    const model = sampledRun.artifacts.run.model ?? sampledRun.run.codexModel;
    if (model) {
      models.set(model, {
        value: model,
        label: model
      });
    }
  }

  return {
    harnesses: sortOptions(harnesses),
    providers: sortOptions(providers),
    models: sortOptions(models)
  };
}

export function countSampledIssues(input: CodexAnalysisSampleResource): number {
  return new Set(input.sampledRuns.map((sampledRun) => sampledRun.issueIdentifier)).size
}

export function formatHarnessLabel(harness: string): string {
  if (harness === "codex") {
    return "Codex";
  }

  if (harness === "opencode") {
    return "OpenCode";
  }

  if (harness === "pi") {
    return "Pi";
  }

  return harness;
}

function matchesAnalysisQuery(
  run: SymphonyForensicsRunSummary,
  artifactsRun: CodexAnalysisSampleResource["sampledRuns"][number]["artifacts"]["run"],
  query: AnalysisQuery
): boolean {
  if (query.harness) {
    const harness = artifactsRun.harnessKind ?? run.agentHarness;
    if (harness !== query.harness) {
      return false;
    }
  }

  if (query.provider) {
    if (artifactsRun.providerId !== query.provider) {
      return false;
    }
  }

  if (query.model) {
    const model = artifactsRun.model ?? run.codexModel;
    if (model !== query.model) {
      return false;
    }
  }

  return true;
}

function sortOptions(options: Map<string, AnalysisFilterOption>): AnalysisFilterOption[] {
  return Array.from(options.values()).sort((left, right) =>
    left.label.localeCompare(right.label)
  );
}
