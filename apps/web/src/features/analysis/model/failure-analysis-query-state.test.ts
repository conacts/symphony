import { describe, expect, it } from "vitest";
import {
  buildFailureAnalysisSearchParams,
  buildFailureAnalysisWindowStart,
  parseFailureAnalysisQueryFromSearchParams
} from "@/features/analysis/model/failure-analysis-query-state";

describe("failure analysis query state", () => {
  it("defaults to a weekly window and preserves the repo scope in search params", () => {
    const query = parseFailureAnalysisQueryFromSearchParams(
      new URLSearchParams("repo=symphony&model=gpt-4o&timeRange=30d")
    );

    expect(query).toEqual({
      model: "gpt-4o",
      timeRange: "30d"
    });

    const nextSearch = buildFailureAnalysisSearchParams(
      new URLSearchParams("repo=symphony"),
      {
        model: "gpt-4o",
        timeRange: "7d"
      }
    );

    expect(nextSearch.toString()).toBe("repo=symphony&model=gpt-4o");
    expect(
      buildFailureAnalysisWindowStart("7d", Date.parse("2026-03-31T18:00:00.000Z"))
    ).toBe(Date.parse("2026-03-24T00:00:00.000Z"));
  });
});
