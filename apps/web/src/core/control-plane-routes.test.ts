import { describe, expect, it } from "vitest";
import {
  buildIssueHref,
  buildIssueRunHref,
  buildIssueRunTurnHref,
  buildIssueRunTurnsHref,
  buildIssueTimelineHref,
  buildLegacyRunHref
} from "@/core/control-plane-routes";

describe("control plane routes", () => {
  it("builds nested issue, run, and turn routes", () => {
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
    expect(buildLegacyRunHref("run id")).toBe("/runs/run%20id");
  });
});
