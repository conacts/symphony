import { describe, expect, it } from "vitest";
import {
  buildSymphonyRuntimePolicy,
  buildSymphonyTrackerIssue
} from "@symphony/test-support";
import {
  createMemorySymphonyTracker
} from "@symphony/tracker";
import {
  createWorkflowDispatchTracker
} from "./runtime-workflow-dispatch-tracker.js";

describe("runtime workflow dispatch tracker", () => {
  it("suppresses candidate issue discovery for workflow-authoritative dispatch", async () => {
    const issue = buildSymphonyTrackerIssue({
      state: "Todo"
    });
    const baseTracker = createMemorySymphonyTracker([issue]);
    const tracker = createWorkflowDispatchTracker({
      tracker: baseTracker
    });

    const candidates = await tracker.fetchCandidateIssues(
      buildSymphonyRuntimePolicy().tracker
    );

    expect(candidates).toEqual([]);
  });

  it("delegates non-candidate tracker operations to the underlying tracker", async () => {
    const issue = buildSymphonyTrackerIssue({
      state: "Todo"
    });
    const config = buildSymphonyRuntimePolicy().tracker;
    const baseTracker = createMemorySymphonyTracker([issue]);
    const tracker = createWorkflowDispatchTracker({
      tracker: baseTracker
    });

    expect(await tracker.fetchIssuesByStates(config, ["Todo"])).toEqual([issue]);
    expect(await tracker.fetchIssueByIdentifier(config, issue.identifier)).toEqual(issue);

    await tracker.updateIssueState(issue.id, "Paused");
    await tracker.createComment(issue.id, "state moved");

    expect(baseTracker.getIssue(issue.id)?.state).toBe("Paused");
    expect(baseTracker.listOperations()).toEqual([
      {
        kind: "update_state",
        issueId: issue.id,
        stateName: "Paused"
      },
      {
        kind: "comment",
        issueId: issue.id,
        body: "state moved"
      }
    ]);
  });
});
