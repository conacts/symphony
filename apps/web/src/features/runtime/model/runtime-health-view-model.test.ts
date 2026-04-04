import { describe, expect, it } from "vitest";
import {
  buildSymphonyRuntimeHealthResult,
  buildSymphonyRuntimeLogsResult
} from "@/test-support/build-symphony-dashboard-view-fixtures";
import { buildRuntimeHealthViewModel } from "@/features/runtime/model/runtime-health-view-model";

describe("runtime health view model", () => {
  it("builds operator-facing runtime health sections", () => {
    const viewModel = buildRuntimeHealthViewModel(
      buildSymphonyRuntimeHealthResult(),
      buildSymphonyRuntimeLogsResult(),
      new Date("2026-03-31T18:04:05.000Z")
    );

    expect(viewModel.summaryCards[0]).toEqual({
      label: "Overall",
      value: "Healthy",
      detail: "Combined database and scheduler health from the active runtime."
    });
    expect(viewModel.summaryCards[3]?.value).toBe("1s");
    expect(viewModel.summaryCards[4]?.value).toBe("4s");
    expect(viewModel.incidentCards[2]?.value).toBe("Runtime");
    expect(viewModel.signalRows[2]?.value).toBe("4s");
    expect(viewModel.storageRows[0]?.value).toBe("/tmp/symphony.db");
    expect(viewModel.logLevelChartRows[1]?.count).toBe(1);
    expect(viewModel.recentEventRows[0]?.eventType).toBe(
      "Tracker Placeholder Active"
    );
  });
});
