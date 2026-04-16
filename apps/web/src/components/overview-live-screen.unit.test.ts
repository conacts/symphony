import { describe, expect, it } from "vitest";
import { buildOverviewSuccessMetricsQuery } from "@/features/overview/components/overview-live-screen";

describe("overview live screen", () => {
  it("builds a stable 7-day success-metrics query from a single reference time", () => {
    const query = buildOverviewSuccessMetricsQuery(
      Date.parse("2026-04-06T02:21:43.000Z")
    );

    expect(query).toEqual({
      timeRange: "7d",
      startedAfter: "2026-03-30T02:21:43.000Z",
      startedBefore: undefined
    });
  });
});
