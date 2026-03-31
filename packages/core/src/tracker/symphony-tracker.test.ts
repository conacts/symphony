import { describe, expect, it } from "vitest";
import {
  createMemorySymphonyTracker,
  isLinearIssueInScope,
  isSymphonyAutoReworkDisabled,
  isSymphonyWorkflowDisabled
} from "./symphony-tracker.js";
import { buildSymphonyTrackerIssue } from "../test-support/build-symphony-tracker-issue.js";
import { buildSymphonyWorkflowConfig } from "../test-support/build-symphony-workflow-config.js";

describe("symphony tracker helpers", () => {
  it("evaluates workflow and auto-rework labels", () => {
    const issue = buildSymphonyTrackerIssue({
      labels: ["symPhony:Disabled", "symphony:no-auto-rework"]
    });

    expect(isSymphonyWorkflowDisabled(issue)).toBe(true);
    expect(isSymphonyAutoReworkDisabled(issue)).toBe(true);
  });

  it("evaluates linear project and team scope rules", () => {
    const trackerProject = buildSymphonyWorkflowConfig().tracker;
    const baseConfig = buildSymphonyWorkflowConfig();
    const trackerTeam = buildSymphonyWorkflowConfig({
      tracker: {
        ...baseConfig.tracker,
        projectSlug: null,
        teamKey: "COL",
        excludedProjectIds: ["project-2"]
      }
    }).tracker;

    const issue = buildSymphonyTrackerIssue();
    const excluded = buildSymphonyTrackerIssue({
      id: "issue-2",
      identifier: "COL-222",
      projectId: "project-2"
    });

    expect(isLinearIssueInScope(trackerProject, issue)).toBe(true);
    expect(isLinearIssueInScope(trackerTeam, issue)).toBe(true);
    expect(isLinearIssueInScope(trackerTeam, excluded)).toBe(false);
  });

  it("provides a deterministic memory tracker seam for orchestration tests", async () => {
    const config = buildSymphonyWorkflowConfig().tracker;
    const todo = buildSymphonyTrackerIssue();
    const review = buildSymphonyTrackerIssue({
      id: "issue-2",
      identifier: "COL-456",
      state: "In Review"
    });
    const tracker = createMemorySymphonyTracker([todo, review]);

    const candidates = await tracker.fetchCandidateIssues(config);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.identifier).toBe("COL-123");

    await tracker.updateIssueState(todo.id, "In Progress");
    await tracker.createComment(todo.id, "Symphony status update.");

    expect(tracker.getIssue(todo.id)?.state).toBe("In Progress");
    expect(tracker.listOperations()).toEqual([
      {
        kind: "update_state",
        issueId: todo.id,
        stateName: "In Progress"
      },
      {
        kind: "comment",
        issueId: todo.id,
        body: "Symphony status update."
      }
    ]);
  });
});
