"use client";

export type AnalysisQuery = {
  harness?: "codex" | "opencode" | "pi";
  provider?: string;
  model?: string;
};

export function buildAnalysisQueryFromSearchParams(
  searchParams: Pick<URLSearchParams, "get">
): AnalysisQuery {
  const harness = parseHarness(searchParams.get("harness"));
  const provider = parseOptionalValue(searchParams.get("provider"));
  const model = parseOptionalValue(searchParams.get("model"));

  return {
    ...(harness ? { harness } : {}),
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {})
  };
}

export function buildAnalysisSearchParams(query: AnalysisQuery): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (query.harness) {
    searchParams.set("harness", query.harness);
  }

  if (query.provider) {
    searchParams.set("provider", query.provider);
  }

  if (query.model) {
    searchParams.set("model", query.model);
  }

  return searchParams;
}

export function hasActiveAnalysisFilters(query: AnalysisQuery): boolean {
  return Boolean(query.harness || query.provider || query.model);
}

function parseHarness(value: string | null): AnalysisQuery["harness"] {
  if (value === "codex" || value === "opencode" || value === "pi") {
    return value;
  }

  return undefined;
}

function parseOptionalValue(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
