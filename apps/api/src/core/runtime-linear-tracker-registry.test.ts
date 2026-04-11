import { describe, expect, it } from "vitest";
import {
  createRepositoryScopedLinearTracker,
  type RepositoryLinearTrackerFactory
} from "./runtime-linear-tracker-registry.js";
import type { AdmittedRuntimeRepository } from "./runtime-admitted-repositories.js";
import type {
  SymphonyTracker,
  SymphonyTrackerConfig,
  SymphonyTrackerIssue
} from "@symphony/tracker";

describe("repository linear tracker registry", () => {
  it("fans out fetches and routes mutations to the resolved repository", async () => {
    const calls: Array<{
      repositoryKey: string;
      method: string;
      apiKey: string | null;
      issueId?: string;
      stateName?: string;
      body?: string;
    }> = [];
    const factory: RepositoryLinearTrackerFactory = (config) => {
      const repositoryKey = `${config.teamKey ?? "none"}:${config.apiKey ?? "none"}`;
      return createFakeTracker(repositoryKey, config, calls);
    };

    const trackerConfig: SymphonyTrackerConfig = {
      kind: "linear",
      endpoint: "https://api.linear.app/graphql",
      apiKey: "shared-linear-token",
      teamKey: "SYM",
      excludedProjectIds: [],
      assignee: null,
      dispatchableStates: ["Todo"],
      terminalStates: ["Done"],
      claimTransitionToState: "Bootstrapping",
      claimTransitionFromStates: ["Todo"],
      startupFailureTransitionToState: "Failed",
      pauseTransitionToState: "Paused",
      blockedTransitionToState: "Blocked"
    };

    const tracker = createRepositoryScopedLinearTracker({
      trackerTemplate: trackerConfig,
      admittedRepositories: [
        buildAdmittedRepository("conacts/symphony", { teamKey: "SYM" }),
        buildAdmittedRepository("conacts/coldets-v2", { teamKey: "COL" })
      ],
      createTracker: factory
    });

    const issues = await tracker.fetchCandidateIssues(trackerConfig);

    expect(issues.map((issue) => issue.identifier)).toEqual(
      expect.arrayContaining(["SYMPHONY-1", "COLDETS-1"])
    );

    const issue = await tracker.fetchIssueByIdentifier(trackerConfig, "COLDETS-1");

    expect(issue?.identifier).toBe("COLDETS-1");

    await tracker.updateIssueState(issue?.id ?? "", "In Progress");
    await tracker.createComment(issue?.id ?? "", "hello");

    expect(
      calls.filter((call) => call.repositoryKey.startsWith("COL"))
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: "fetchCandidateIssues" }),
        expect.objectContaining({ method: "fetchIssueByIdentifier" }),
        expect.objectContaining({ method: "updateIssueState" }),
        expect.objectContaining({ method: "createComment" })
      ])
    );

    expect(
      calls.filter((call) => call.repositoryKey.startsWith("SYM"))
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ method: "fetchCandidateIssues" })])
    );
  });
});

function buildAdmittedRepository(
  repositoryKey: string,
  linearBinding: AdmittedRuntimeRepository["linearBinding"]
): AdmittedRuntimeRepository {
  return {
    repositoryKey,
    repoRoot: `/tmp/${repositoryKey.replace("/", "-")}`,
    linearBinding,
    promptContract: {
      repoRoot: "/tmp",
      promptPath: "/tmp/.symphony/prompt.md",
      template: "Prompt body\n",
      variables: []
    },
    runtimeManifest: {
      repoRoot: "/tmp",
      manifestPath: "/tmp/.symphony/runtime.ts",
      manifest: {
        schemaVersion: 1,
        repositoryKey,
        linear: linearBinding,
        workspace: {
          packageManager: "pnpm",
          workingDirectory: "."
        },
        services: {},
        workflow: null,
        pi: null,
        env: {
          host: {
            required: [],
            optional: []
          },
          inject: {}
        },
        lifecycle: {
          bootstrap: [],
          migrate: [],
          verify: [
            {
              name: "verify",
              run: "pnpm test"
            }
          ],
          seed: [],
          cleanup: []
        }
      }
    }
  };
}

function createFakeTracker(
  repositoryKey: string,
  config: SymphonyTrackerConfig,
  calls: Array<{
    repositoryKey: string;
    method: string;
    apiKey: string | null;
    issueId?: string;
    stateName?: string;
    body?: string;
  }>
): SymphonyTracker {
  const issue = issueForConfig(config, repositoryKey);

  return {
    async fetchCandidateIssues() {
      calls.push({ repositoryKey, method: "fetchCandidateIssues", apiKey: config.apiKey });
      return [issue];
    },
    async fetchIssuesByStates() {
      calls.push({ repositoryKey, method: "fetchIssuesByStates", apiKey: config.apiKey });
      return [issue];
    },
    async fetchIssueStatesByIds(_config, issueIds) {
      calls.push({ repositoryKey, method: "fetchIssueStatesByIds", apiKey: config.apiKey });
      return issueIds.includes(issue.id) ? [issue] : [];
    },
    async fetchIssueByIdentifier(_config, issueIdentifier) {
      calls.push({
        repositoryKey,
        method: "fetchIssueByIdentifier",
        apiKey: config.apiKey
      });
      return issue.identifier === issueIdentifier ? issue : null;
    },
    async createComment(issueId, body) {
      calls.push({ repositoryKey, method: "createComment", apiKey: config.apiKey, issueId, body });
    },
    async updateIssueState(issueId, stateName) {
      calls.push({
        repositoryKey,
        method: "updateIssueState",
        apiKey: config.apiKey,
        issueId,
        stateName
      });
    }
  };
}

function issueForConfig(
  config: SymphonyTrackerConfig,
  repositoryKey: string
): SymphonyTrackerIssue {
  const prefix = config.teamKey ?? "repo";
  const identifier = prefix === "SYM" ? "SYMPHONY-1" : "COLDETS-1";
  return {
    id: `${repositoryKey}-issue`,
    identifier,
    title: `Issue for ${repositoryKey}`,
    description: null,
    priority: null,
    state: "Todo",
    branchName: `symphony/${identifier}`,
    url: null,
    projectId: "project-1",
    projectName: "Project",
    teamKey: config.teamKey,
    assigneeId: null,
    blockedBy: [],
    labels: [],
    assignedToWorker: true,
    createdAt: null,
    updatedAt: null
  };
}
