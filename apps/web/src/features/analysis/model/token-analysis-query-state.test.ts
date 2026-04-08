import { describe, expect, it } from "vitest";
import {
  buildTokenAnalysisSearchParams,
  buildTokenAnalysisWindowStart,
  parseTokenAnalysisQueryFromSearchParams
} from "@/features/analysis/model/token-analysis-query-state";

describe("token analysis query state", () => {
  it("parses the model and time-range controls from search params", () => {
    const searchParams = new URLSearchParams(
      "repo=symphony&model=xiaomi%2Fmimo-v2-pro&timeRange=30d"
    );

    expect(parseTokenAnalysisQueryFromSearchParams(searchParams)).toEqual({
      repo: "symphony",
      model: "xiaomi/mimo-v2-pro",
      timeRange: "30d"
    });
  });

  it("keeps the repo scope while updating only the token controls", () => {
    const searchParams = new URLSearchParams("repo=symphony&foo=bar");
    const next = buildTokenAnalysisSearchParams(searchParams, {
      model: "gpt-5.4",
      timeRange: "7d"
    });

    expect(next.toString()).toBe("repo=symphony&foo=bar&model=gpt-5.4");
  });

  it("builds the selected lookback window start", () => {
    const now = Date.UTC(2026, 3, 7, 12, 0, 0);

    expect(buildTokenAnalysisWindowStart("7d", now)).toBe(
      Date.UTC(2026, 2, 31, 0, 0, 0)
    );
    expect(buildTokenAnalysisWindowStart("all", now)).toBeNull();
  });
});
