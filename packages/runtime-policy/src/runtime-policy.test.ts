import { describe, expect, it } from "vitest";
import {
  resolveRuntimePolicy,
  SymphonyRuntimePolicyError
} from "./runtime-policy.js";

describe("resolveRuntimePolicy", () => {
  it("provides the strict default runtime policy shape", () => {
    const config = resolveRuntimePolicy({}, {});

    expect(config.tracker.kind).toBe("memory");
    expect(config.tracker.dispatchableStates).toEqual([
      "Todo",
      "In Progress"
    ]);
    expect(config.tracker.terminalStates).toEqual(["Canceled", "Done"]);
    expect(config.workspace.root).toContain("symphony_workspaces");
    expect(config.agent.maxConcurrentAgents).toBe(10);
    expect(config.codex.approvalPolicy).toBe("never");
  });

  it("maps the legacy reject approval policy to never", () => {
    const config = resolveRuntimePolicy(
      {
        tracker: {
          kind: "memory"
        },
        codex: {
          approvalPolicy: {
            reject: {
              sandbox_approval: true,
              rules: true,
              mcp_elicitations: true
            }
          }
        }
      },
      {}
    );

    expect(config.codex.approvalPolicy).toBe("never");
  });

  it("resolves env-backed tracker values explicitly", () => {
    const config = resolveRuntimePolicy(
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
      resolveRuntimePolicy(
        {
          tracker: {
            kind: "jira"
          }
        },
        {}
      )
    ).toThrowError(SymphonyRuntimePolicyError);
  });
});
