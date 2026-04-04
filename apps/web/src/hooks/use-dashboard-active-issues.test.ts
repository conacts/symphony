import { describe, expect, it } from "vitest";
import { buildSymphonyRuntimeStateResult } from "@/test-support/build-symphony-dashboard-view-fixtures";
import { collectActiveIssueDescriptors } from "@/hooks/use-dashboard-active-issues";

describe("useDashboardActiveIssues helpers", () => {
  it("collects active issues from running and retrying runtime entries", () => {
    const runtimeSummary = buildSymphonyRuntimeStateResult();

    expect(collectActiveIssueDescriptors(runtimeSummary)).toEqual([
      {
        issueIdentifier: "COL-165",
        fallbackState: "In Progress"
      },
      {
        issueIdentifier: "COL-166",
        fallbackState: "Retrying"
      }
    ]);
  });

  it("deduplicates retrying issues that are already running", () => {
    const runtimeSummary = buildSymphonyRuntimeStateResult({
      retrying: [
        {
          issueIdentifier: "COL-165"
        }
      ]
    });

    expect(collectActiveIssueDescriptors(runtimeSummary)).toEqual([
      {
        issueIdentifier: "COL-165",
        fallbackState: "In Progress"
      }
    ]);
  });

  it("returns an empty list when there is no runtime summary", () => {
    expect(collectActiveIssueDescriptors(null)).toEqual([]);
  });
});
