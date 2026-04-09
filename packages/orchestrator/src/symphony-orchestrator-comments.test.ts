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
        stateTransition: {
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

  it("uses stopped wording when the pause transition fails", () => {
    const comment = buildFailureCommentBody(
      issue,
      "agent exited",
      "paused_failure",
      {
        stateTransition: {
          kind: "failed",
          targetState: "Paused",
          reason: "Tracker state remained `In Progress`."
        },
        workspaceCleanupMode: "preserve"
      }
    );

    expect(comment).toContain("Symphony agent stopped after a runtime failure.");
    expect(comment).not.toContain("Symphony agent paused after a runtime failure.");
    expect(comment).toContain("Symphony could not move the issue to `Paused`");
  });

  it("uses stopped wording for rate-limit comments when the pause transition fails", () => {
    const comment = buildFailureCommentBody(
      issue,
      "rate_limit_exceeded",
      "rate_limited",
      {
        stateTransition: {
          kind: "failed",
          targetState: "Paused",
          reason: "Tracker state remained `In Progress`."
        },
        workspaceCleanupMode: "preserve"
      }
    );

    expect(comment).toContain("Symphony agent stopped after hitting a Pi rate limit.");
    expect(comment).not.toContain("Symphony agent paused after hitting a Pi rate limit.");
  });

  it("formats blocked implementation comments with blocker guidance", () => {
    const comment = buildFailureCommentBody(
      issue,
      "Integration tests require a missing seed fixture.",
      "blocked_repo",
      {
        stateTransition: {
          kind: "moved",
          targetState: "Blocked"
        },
        workspaceCleanupMode: "preserve"
      }
    );

    expect(comment).toContain("Symphony agent reported a repo or workspace blocker.");
    expect(comment).toContain("Workspace policy: preserve.");
    expect(comment).toContain("Symphony moved the issue to `Blocked`.");
    expect(comment).toContain("move it back to `Todo`");
  });

  it("formats blocked merge comments with merge rerun guidance", () => {
    const comment = buildFailureCommentBody(
      issue,
      "Conflicts in packages/workspace/src/docker-client.ts",
      "blocked_merge",
      {
        stateTransition: {
          kind: "moved",
          targetState: "Blocked"
        },
        workspaceCleanupMode: "preserve"
      }
    );

    expect(comment).toContain("Symphony merge automation reported a merge blocker.");
    expect(comment).toContain("move it back to `Approved`");
  });
});
