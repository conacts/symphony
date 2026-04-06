import { describe, expect, it } from "vitest";
import { buildOverviewSuccessMetricsQuery } from "@/features/overview/components/overview-live-screen";

describe("overview live screen", () => {
  it("builds a stable 30-day success-metrics query from a single reference time", () => {
    const query = buildOverviewSuccessMetricsQuery(
      Date.parse("2026-04-06T02:21:43.000Z")
    );

    expect(query).toEqual({
      timeRange: "30d",
      startedAfter: "2026-03-07T02:21:43.000Z"
    });
  });
});
