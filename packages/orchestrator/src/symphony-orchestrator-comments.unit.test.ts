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

    expect(comment).toContain("State: `Failed`");
    expect(comment).toContain(
      "What changed: Pi stopped before the run became active because startup failed."
    );
    expect(comment).toContain("Workspace policy: preserve.");
    expect(comment).toContain("Retry policy: Symphony did not retry automatically.");
    expect(comment).toContain("Next step: Fix the startup problem.");
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

    expect(comment).toContain("State: `In Progress`");
    expect(comment).toContain(
      "What changed: Pi stopped because the runtime failed during an active run."
    );
    expect(comment).toContain("Symphony agent stopped after a runtime failure.");
    expect(comment).not.toContain("Symphony agent paused after a runtime failure.");
    expect(comment).toContain(
      "Tracker state mismatch: expected `Paused`, actual `In Progress`."
    );
    expect(comment).toContain(
      "Next step: Resolve the runtime or orchestration problem that failed the active run."
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
    expect(comment).toContain(
      "Next step: Wait for provider capacity to recover or adjust the account limits."
    );
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

    expect(comment).toContain("State: `Blocked`");
    expect(comment).toContain(
      "What changed: Pi stopped because active work hit a repo-side or task-side blocker that needs human intervention."
    );
    expect(comment).toContain("Symphony agent reported a repo or workspace blocker.");
    expect(comment).toContain("Workspace policy: preserve.");
    expect(comment).toContain("Next step: Resolve the repo or workspace blocker.");
    expect(comment).toContain("The issue is currently in `Blocked`.");
    expect(comment).toContain("move it to `Todo` to requeue");
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
    expect(comment).toContain("Next step: Resolve the merge problem.");
    expect(comment).toContain("move it to `Todo` to requeue");
  });

  it("surfaces exhausted retry guidance for transient provider pauses", () => {
    const comment = buildFailureCommentBody(
      buildSymphonyTrackerIssue({
        state: "Paused"
      }),
      "provider returned transient 5xx responses",
      "paused_provider_transient",
      {
        expectedTrackerState: "Paused",
        workspaceCleanupMode: "preserve"
      }
    );

    expect(comment).toContain(
      "Retry policy: Automatic retries were exhausted."
    );
    expect(comment).toContain(
      "Next step: Resolve the provider problem that exhausted the retry budget."
    );
    expect(comment).toContain(
      "The issue is currently in `Paused`. After completing the next step, move it to `Todo` to requeue."
    );
  });
});
