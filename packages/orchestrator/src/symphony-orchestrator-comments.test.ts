import { describe, expect, it } from "vitest";
import { buildSymphonyTrackerIssue } from "@symphony/tracker";
import { buildFailureCommentBody } from "./symphony-orchestrator-comments.js";

describe("buildFailureCommentBody", () => {
  const issue = buildSymphonyTrackerIssue({
    state: "In Progress"
  });

  it("includes the preserve workspace policy in startup failure comments", () => {
    const comment = buildFailureCommentBody(
      issue,
      "workspace hook `before_run` exited with status 1.",
      "startup_failed",
      {
        startupFailureTransition: {
          kind: "moved",
          targetState: "Failed"
        },
        workspaceCleanupMode: "preserve"
      }
    );

    expect(comment).toContain("Workspace policy: preserve.");
    expect(comment).toContain("Symphony moved the issue to `Failed`.");
  });

  it("includes the destroy workspace policy when cleanup is terminal", () => {
    const comment = buildFailureCommentBody(
      issue,
      "runtime failed",
      "paused_failure",
      {
        workspaceCleanupMode: "destroy"
      }
    );

    expect(comment).toContain("Workspace policy: destroy.");
  });
});
