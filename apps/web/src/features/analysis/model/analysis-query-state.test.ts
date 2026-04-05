import { describe, expect, it } from "vitest";
import {
  buildAnalysisQueryFromSearchParams,
  buildAnalysisSearchParams,
  hasActiveAnalysisFilters
} from "@/features/analysis/model/analysis-query-state";

describe("analysis query state", () => {
  it("parses harness, provider, and model filters from search params", () => {
    const searchParams = new URLSearchParams(
      "harness=opencode&provider=openrouter&model=xiaomi%2Fmimo-v2-pro"
    );

    expect(buildAnalysisQueryFromSearchParams(searchParams)).toEqual({
      harness: "opencode",
      provider: "openrouter",
      model: "xiaomi/mimo-v2-pro"
    });
  });

  it("builds a compact search string for active filters only", () => {
    const searchParams = buildAnalysisSearchParams({
      provider: "openrouter",
      model: "gpt-5.4"
    });

    expect(searchParams.toString()).toBe("provider=openrouter&model=gpt-5.4");
  });

  it("tracks whether any analysis filter is active", () => {
    expect(hasActiveAnalysisFilters({})).toBe(false);
    expect(hasActiveAnalysisFilters({ harness: "codex" })).toBe(true);
  });
});
