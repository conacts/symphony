import { describe, expect, it } from "vitest";
import { buildSymphonyTrackerIssue } from "@symphony/tracker";
import { buildFailureCommentBody } from "./symphony-orchestrator-comments.js";

describe("buildFailureCommentBody", () => {
  const issue = buildSymphonyTrackerIssue({
    state: "In Progress"
  });

  it("includes the preserve workspace policy in startup failure comments", () => {
    const comment = buildFailureCommentBody(
      buildSymphonyTrackerIssue({
        state: "Failed"
      }),
      "workspace hook `before_run` exited with status 1.",
      "startup_failed",
      {
        expectedTrackerState: "Failed",
        workspaceCleanupMode: "preserve"
      }
    );

    expect(comment).toContain("Workspace policy: preserve.");
    expect(comment).toContain("The issue is currently in `Failed`.");
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

  it("uses stopped wording when the pause transition fails", () => {
    const comment = buildFailureCommentBody(
      issue,
      "agent exited",
      "paused_failure",
      {
        expectedTrackerState: "Paused",
        workspaceCleanupMode: "preserve"
      }
    );

    expect(comment).toContain("Symphony agent stopped after a runtime failure.");
    expect(comment).not.toContain("Symphony agent paused after a runtime failure.");
    expect(comment).toContain(
      "Tracker state mismatch: expected `Paused`, actual `In Progress`."
    );
    expect(comment).toContain(
      "The issue is currently in `In Progress`. Manual state cleanup may be required before the ticket is requeued."
    );
  });

  it("uses stopped wording for rate-limit comments when the pause transition fails", () => {
    const comment = buildFailureCommentBody(
      issue,
      "rate_limit_exceeded",
      "rate_limited",
      {
        expectedTrackerState: "Paused",
        workspaceCleanupMode: "preserve"
      }
    );

    expect(comment).toContain("Symphony agent stopped after hitting a Pi rate limit.");
    expect(comment).not.toContain("Symphony agent paused after hitting a Pi rate limit.");
  });

  it("formats blocked implementation comments with blocker guidance", () => {
    const comment = buildFailureCommentBody(
      buildSymphonyTrackerIssue({
        state: "Blocked"
      }),
      "Integration tests require a missing seed fixture.",
      "blocked_repo",
      {
        expectedTrackerState: "Blocked",
        workspaceCleanupMode: "preserve"
      }
    );

    expect(comment).toContain("Symphony agent reported a repo or workspace blocker.");
    expect(comment).toContain("Workspace policy: preserve.");
    expect(comment).toContain("The issue is currently in `Blocked`.");
    expect(comment).toContain("move it back to `Todo`");
  });

  it("formats blocked merge comments with Todo requeue guidance", () => {
    const comment = buildFailureCommentBody(
      buildSymphonyTrackerIssue({
        state: "Blocked"
      }),
      "Conflicts in packages/workspace/src/docker-client.ts",
      "blocked_merge",
      {
        expectedTrackerState: "Blocked",
        workspaceCleanupMode: "preserve"
      }
    );

    expect(comment).toContain("Symphony merge automation reported a merge blocker.");
    expect(comment).toContain("move it back to `Todo`");
  });
});
