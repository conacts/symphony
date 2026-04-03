import { describe, expect, it } from "vitest";
import {
  resolveWorkflowConfig,
  SymphonyWorkflowError
} from "./symphony-workflow.js";

describe("resolveWorkflowConfig", () => {
  it("provides the strict default runtime policy shape", () => {
    const config = resolveWorkflowConfig({}, {});

    expect(config.tracker.kind).toBe("memory");
    expect(config.tracker.dispatchableStates).toEqual([
      "Todo",
      "In Progress"
    ]);
    expect(config.tracker.terminalStates).toEqual(["Canceled", "Done"]);
    expect(config.workspace.root).toContain("symphony_workspaces");
    expect(config.agent.maxConcurrentAgents).toBe(10);
  });

  it("resolves env-backed tracker values explicitly", () => {
    const config = resolveWorkflowConfig(
      {
        tracker: {
          kind: "linear",
          apiKey: "$LINEAR_API_KEY",
          assignee: "$LINEAR_ASSIGNEE",
          projectSlug: "coldets"
        }
      },
      {
        env: {
          LINEAR_API_KEY: "linear-token",
          LINEAR_ASSIGNEE: "worker-1"
        }
      }
    );

    expect(config.tracker.apiKey).toBe("linear-token");
    expect(config.tracker.assignee).toBe("worker-1");
  });

  it("fails fast on unsupported tracker kinds", () => {
    expect(() =>
      resolveWorkflowConfig(
        {
          tracker: {
            kind: "jira"
          }
        },
        {}
      )
    ).toThrowError(SymphonyWorkflowError);
  });
});
