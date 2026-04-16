import { describe, expect, it } from "vitest";
import {
  buildSymphonyRuntimePolicy,
  createTestWorkspaceBackend
} from "@symphony/test-support";
import {
  createAgentRuntime,
  type SymphonyWorkflowRoutingAdapter
} from "@symphony/orchestrator";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import { createSymphonyRuntime } from "./symphony-runtime.js";

const inertTracker = {
  async fetchCandidateIssues() {
    return [];
  },
  async fetchIssuesByStates() {
    return [];
  },
  async fetchIssueStatesByIds() {
    return [];
  },
  async fetchIssueByIdentifier() {
    return null;
  },
  async createComment() {
    return;
  },
  async updateIssueState() {
    return;
  }
};

const inertLifecycleRouting: {
  workflowRoutingAdapter: SymphonyWorkflowRoutingAdapter;
} = {
  workflowRoutingAdapter: {
    routeDispatchBootstrap(input: { issue: SymphonyTrackerIssue }) {
      return {
        issue: input.issue,
        runMode: "implementation" as const,
        dispatchHandling: "external_run" as const
      };
    },
    activateRunStart(input: { issue: SymphonyTrackerIssue }) {
      return {
        issue: input.issue
      };
    },
    observeRunningIssueState(input: { issue: SymphonyTrackerIssue }) {
      return {
        issue: input.issue
      };
    },
    routeRunCompletion(input: { issue: SymphonyTrackerIssue }) {
      return {
        issue: input.issue
      };
    }
  }
};

describe("symphony runtime review seam", () => {
  it("constructs the runtime without optional review surfaces", async () => {
    const runtime = createSymphonyRuntime({
      runtimePolicy: buildSymphonyRuntimePolicy(),
      tracker: inertTracker,
      workspaceBackend: createTestWorkspaceBackend(),
      agentRuntime: createAgentRuntime({
        async startRun() {
          return {
            threadId: null,
            workerHost: null,
            launchTarget: null
          };
        },
        async stopRun() {}
      }),
      ...inertLifecycleRouting
    });

    expect(runtime.runtimePolicy.agent.harness).toBe("pi");
    expect(runtime.workspaceBackend).toBeDefined();
  });

  it("fails fast when lifecycle routing adapters are omitted", () => {
    expect(() =>
      createSymphonyRuntime({
        runtimePolicy: buildSymphonyRuntimePolicy(),
        tracker: inertTracker,
        workspaceBackend: createTestWorkspaceBackend(),
        agentRuntime: createAgentRuntime({
          async startRun() {
            return {
              threadId: null,
              workerHost: null,
              launchTarget: null
            };
          },
          async stopRun() {}
        }),
        workflowRoutingAdapter: undefined as never
      })
    ).toThrow(/workflow routing adapter/i);
  });
});
