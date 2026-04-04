import { describe, expect, it, vi } from "vitest";
import {
  buildIssueQueryFromSearchParams,
  buildIssueSearchParams
} from "@/features/issues/model/issue-query-state";

describe("issue query state", () => {
  it("builds a forensics query from URL search params", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-04T12:00:00.000Z"));

    const query = buildIssueQueryFromSearchParams(
      new URLSearchParams(
        "timeRange=7d&outcome=failed&errorClass=RateLimitError&sortBy=problemRate"
      )
    );

    expect(query.timeRange).toBe("7d");
    expect(query.outcome).toBe("failed");
    expect(query.errorClass).toBe("RateLimitError");
    expect(query.sortBy).toBe("problemRate");
    expect(query.sortDirection).toBe("desc");
    expect(query.startedAfter).toBe("2026-03-28T12:00:00.000Z");

    vi.useRealTimers();
  });

  it("omits default values when serializing the URL query", () => {
    const searchParams = buildIssueSearchParams({
      timeRange: "all",
      outcome: undefined,
      errorClass: undefined,
      sortBy: "lastActive",
      sortDirection: "desc"
    });

    expect(searchParams.toString()).toBe("");
  });

  it("serializes non-default values into the URL query", () => {
    const searchParams = buildIssueSearchParams({
      timeRange: "24h",
      outcome: "failed",
      errorClass: "RuntimeError",
      sortBy: "retries",
      sortDirection: "asc"
    });

    expect(searchParams.toString()).toBe(
      "timeRange=24h&outcome=failed&errorClass=RuntimeError&sortBy=retries&sortDirection=asc"
    );
  });
});
