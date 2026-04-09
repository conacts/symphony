import { describe, expect, it } from "vitest";
import {
  buildIssueBreadcrumbRoutes,
  buildIssuesHref,
  buildIssueHref,
  buildIssueRunHref,
  buildIssueRunBreadcrumbRoutes,
  buildIssueRunTurnHref,
  buildIssueRunTurnBreadcrumbRoutes,
  buildIssueRunTurnsBreadcrumbRoutes,
  buildIssueRunTurnsHref,
  buildIssueTimelineBreadcrumbRoutes,
  buildIssueTimelineHref,
  buildRunTranscriptHref
} from "@/core/control-plane-routes";

describe("control plane routes", () => {
  it("builds nested issue, run, and turn routes", () => {
    expect(buildIssuesHref()).toBe("/issues");
    expect(buildIssueHref("COL-165")).toBe("/issues/COL-165");
    expect(buildIssueTimelineHref("COL-165")).toBe("/issues/COL-165/timeline");
    expect(buildIssueRunHref("COL-165", "run_123")).toBe(
      "/issues/COL-165/runs/run_123"
    );
    expect(buildIssueRunTurnsHref("COL-165", "run_123")).toBe(
      "/issues/COL-165/runs/run_123/turns"
    );
    expect(buildIssueRunTurnHref("COL-165", "run_123", "turn_456")).toBe(
      "/issues/COL-165/runs/run_123/turns/turn_456"
    );
  });

  it("encodes dynamic segments", () => {
    expect(buildIssueRunHref("COL/165", "run id")).toBe(
      "/issues/COL%2F165/runs/run%20id"
    );
    expect(buildIssueRunTurnHref("COL/165", "run id", "turn/id")).toBe(
      "/issues/COL%2F165/runs/run%20id/turns/turn%2Fid"
    );
    expect(buildRunTranscriptHref("run id")).toBe("/runs/run%20id");
  });

  it("builds breadcrumb routes for issue and run drilldowns", () => {
    expect(buildIssueBreadcrumbRoutes("COL-165")).toEqual([
      { label: "Issues", href: "/issues" },
      { label: "COL-165", href: "/issues/COL-165" }
    ]);
    expect(buildIssueTimelineBreadcrumbRoutes("COL-165")).toEqual([
      { label: "Issues", href: "/issues" },
      { label: "COL-165", href: "/issues/COL-165" },
      { label: "Timeline", href: "/issues/COL-165/timeline" }
    ]);
    expect(buildIssueRunBreadcrumbRoutes("COL-165", "run_123")).toEqual([
      { label: "Issues", href: "/issues" },
      { label: "COL-165", href: "/issues/COL-165" },
      { label: "run_123", href: "/issues/COL-165/runs/run_123" }
    ]);
    expect(buildIssueRunTurnsBreadcrumbRoutes("COL-165", "run_123")).toEqual([
      { label: "Issues", href: "/issues" },
      { label: "COL-165", href: "/issues/COL-165" },
      { label: "run_123", href: "/issues/COL-165/runs/run_123" },
      { label: "Turns", href: "/issues/COL-165/runs/run_123/turns" }
    ]);
    expect(
      buildIssueRunTurnBreadcrumbRoutes("COL-165", "run_123", "turn_456")
    ).toEqual([
      { label: "Issues", href: "/issues" },
      { label: "COL-165", href: "/issues/COL-165" },
      { label: "run_123", href: "/issues/COL-165/runs/run_123" },
      { label: "Turns", href: "/issues/COL-165/runs/run_123/turns" },
      { label: "turn_456", href: "/issues/COL-165/runs/run_123/turns/turn_456" }
    ]);
  });
});
