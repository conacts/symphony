import { describe, expect, it } from "vitest";
import { buildSymphonyForensicsSuccessMetricsResult } from "@/test-support/build-symphony-dashboard-view-fixtures";
import { buildOverviewSuccessMetricsViewModel } from "@/features/overview/model/overview-success-metrics";

describe("overview success metrics view model", () => {
  it("formats executive cards, diagnostic cards, and daily trend rows", () => {
    const viewModel = buildOverviewSuccessMetricsViewModel(
      buildSymphonyForensicsSuccessMetricsResult()
    );

    expect(viewModel.cards[0]).toEqual({
      label: "Issue delivery rate",
      value: "66.7%",
      detail: "8 of 12 started issues reported delivery."
    });
    expect(viewModel.cards[1]?.value).toBe("2:00:00");
    expect(viewModel.cards[2]?.value).toBe("1,420");
    expect(viewModel.diagnostics[0]?.value).toBe("12.5%");
    expect(viewModel.diagnostics[3]?.value).toBe("42%");
    expect(viewModel.trendRows[0]).toEqual({
      date: "2026-03-29",
      label: "Mar 29",
      startedIssueCount: 2,
      deliveredIssueCount: 1,
      maxTurnFailureCount: 0
    });
  });
});
