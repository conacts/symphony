import { describe, expect, it } from "vitest";
import { buildSymphonyForensicsSuccessMetricsResult } from "@/test-support/build-symphony-dashboard-view-fixtures";
import { buildOverviewSuccessMetricsViewModel } from "@/features/overview/model/overview-success-metrics";

describe("overview success metrics view model", () => {
  it("formats executive cards, diagnostic cards, and completion rows", () => {
    const viewModel = buildOverviewSuccessMetricsViewModel(
      buildSymphonyForensicsSuccessMetricsResult()
    );

    expect(viewModel.cards[0]).toEqual({
      label: "Delivered issues",
      value: "16",
      detail: "Completed across 7 days in the selected window."
    });
    expect(viewModel.cards[1]?.value).toBe("2.3");
    expect(viewModel.cards[2]?.value).toBe("2.3");
    expect(viewModel.cards[3]?.value).toBe("62.5%");
    expect(viewModel.diagnostics[0]?.value).toBe("66.7%");
    expect(viewModel.diagnostics[1]?.value).toBe("1:55:00");
    expect(viewModel.diagnostics[2]?.value).toBe("1,480");
    expect(viewModel.diagnostics[3]?.value).toBe("44%");
    expect(viewModel.completionRows[0]).toEqual({
      date: "2026-03-25",
      label: "Mar 25",
      startedIssueCount: 2,
      deliveredIssueCount: 1,
      runsPerDeliveredIssue: 3
    });
  });
});
