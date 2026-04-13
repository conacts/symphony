import { describe, expect, it } from "vitest";
import { buildSymphonyRuntimeStateResult } from "@/test-support/build-symphony-dashboard-view-fixtures";
import { collectActiveIssueDescriptors } from "@/hooks/use-dashboard-active-issues";

describe("useDashboardActiveIssues helpers", () => {
  it("collects active issues from running and retrying runtime entries", () => {
    const runtimeSummary = buildSymphonyRuntimeStateResult();

    expect(collectActiveIssueDescriptors(runtimeSummary)).toEqual([
      {
        trackerIssueKey: "COL-165",
        fallbackState: "In Progress"
      },
      {
        trackerIssueKey: "COL-166",
        fallbackState: "Retrying"
      }
    ]);
  });

  it("deduplicates retrying issues that are already running", () => {
    const runtimeSummary = buildSymphonyRuntimeStateResult({
      retrying: [
        {
          trackerIssueKey: "COL-165"
        }
      ]
    });

    expect(collectActiveIssueDescriptors(runtimeSummary)).toEqual([
      {
        trackerIssueKey: "COL-165",
        fallbackState: "In Progress"
      }
    ]);
  });

  it("returns an empty list when there is no runtime summary", () => {
    expect(collectActiveIssueDescriptors(null)).toEqual([]);
  });
});
