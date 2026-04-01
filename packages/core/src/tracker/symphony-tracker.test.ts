import { describe, expect, it } from "vitest";
import { createLinearSymphonyTracker } from "./linear-symphony-tracker.js";
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

  it("normalizes Linear issues and filters by assigned worker", async () => {
    const config = buildSymphonyWorkflowConfig({
      tracker: {
        ...buildSymphonyWorkflowConfig().tracker,
        assignee: "worker-1"
      }
    }).tracker;

    const tracker = createLinearSymphonyTracker({
      config,
      request: async (query) => {
        if (query.includes("SymphonyLinearPollByProject")) {
          return {
            data: {
              issues: {
                nodes: [
                  buildLinearIssueNode({
                    id: "issue-123",
                    identifier: "COL-123",
                    assigneeId: "worker-1"
                  }),
                  buildLinearIssueNode({
                    id: "issue-456",
                    identifier: "COL-456",
                    assigneeId: "someone-else"
                  })
                ],
                pageInfo: {
                  hasNextPage: false,
                  endCursor: null
                }
              }
            }
          };
        }

        if (query.includes("SymphonyLinearViewer")) {
          return {
            data: {
              viewer: {
                id: "worker-1"
              }
            }
          };
        }

        throw new Error("Unexpected query");
      }
    });

    const issues = await tracker.fetchCandidateIssues(config);

    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({
      id: "issue-123",
      identifier: "COL-123",
      blockedBy: ["issue-blocker"],
      labels: ["symphony:no-auto-rework"],
      assignedToWorker: true
    });
    expect(issues[1]).toMatchObject({
      id: "issue-456",
      identifier: "COL-456",
      assignedToWorker: false
    });
  });

  it("supports Linear issue lookup, comments, and state transitions", async () => {
    const config = buildSymphonyWorkflowConfig().tracker;
    const seenOperations: string[] = [];

    const tracker = createLinearSymphonyTracker({
      config,
      request: async (query) => {
        if (query.includes("SymphonyLinearIssueByIdentifier")) {
          seenOperations.push("lookup");
          return {
            data: {
              issue: buildLinearIssueNode({
                id: "issue-123",
                identifier: "COL-123"
              })
            }
          };
        }

        if (query.includes("SymphonyResolveStateId")) {
          seenOperations.push("resolve-state");
          return {
            data: {
              issue: {
                team: {
                  states: {
                    nodes: [
                      {
                        id: "state-123"
                      }
                    ]
                  }
                }
              }
            }
          };
        }

        if (query.includes("SymphonyUpdateIssueState")) {
          seenOperations.push("update-state");
          return {
            data: {
              issueUpdate: {
                success: true
              }
            }
          };
        }

        if (query.includes("SymphonyCreateComment")) {
          seenOperations.push("comment");
          return {
            data: {
              commentCreate: {
                success: true
              }
            }
          };
        }

        throw new Error("Unexpected query");
      }
    });

    const issue = await tracker.fetchIssueByIdentifier(config, "COL-123");
    await tracker.updateIssueState("issue-123", "In Progress");
    await tracker.createComment("issue-123", "Symphony status update.");

    expect(issue?.identifier).toBe("COL-123");
    expect(seenOperations).toEqual([
      "lookup",
      "resolve-state",
      "update-state",
      "comment"
    ]);
  });
});

function buildLinearIssueNode(input: {
  id: string;
  identifier: string;
  assigneeId?: string | null;
}): Record<string, unknown> {
  return {
    id: input.id,
    identifier: input.identifier,
    title: "Issue title",
    description: "Issue description",
    priority: 2,
    state: {
      name: "Todo"
    },
    branchName: `symphony/${input.identifier}`,
    url: `https://linear.app/coldets/issue/${input.identifier.toLowerCase()}`,
    team: {
      key: "COL"
    },
    project: {
      id: "project-1",
      name: "Project",
      slugId: "coldets"
    },
    assignee: input.assigneeId
      ? {
          id: input.assigneeId
        }
      : null,
    labels: {
      nodes: [
        {
          name: "symphony:no-auto-rework"
        }
      ]
    },
    inverseRelations: {
      nodes: [
        {
          type: "blocks",
          issue: {
            id: "issue-blocker",
            identifier: "COL-999",
            state: {
              name: "In Review"
            }
          }
        }
      ]
    },
    createdAt: "2026-03-31T00:00:00.000Z",
    updatedAt: "2026-03-31T00:00:00.000Z"
  };
}
