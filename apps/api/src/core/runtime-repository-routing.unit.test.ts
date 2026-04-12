import { describe, expect, it } from "vitest";
import type { SymphonyWorkspaceBindingCatalog } from "@symphony/db";
import { buildSymphonyTrackerIssue } from "@symphony/tracker";
import {
  resolveIssueRepository,
  resolveIssueRepositorySelection,
  resolveRepositoryForPersistedBindingScope,
  resolveRepositoryForLinearScope,
  resolveWorkspaceRepository
} from "./runtime-repository-routing.js";
import type { AdmittedRuntimeRepository } from "./runtime-admitted-repositories.js";

describe("runtime repository routing", () => {
  it("routes a multi-repo issue by Linear team binding", () => {
    const repository = resolveIssueRepository(
      [
        buildAdmittedRepository("conacts/symphony", { teamKey: "SYM" }),
        buildAdmittedRepository("conacts/coldets-v2", { teamKey: "COL" })
      ],
      buildSymphonyTrackerIssue({
        identifier: "SYM-101",
        teamKey: "SYM",
        labels: []
      })
    );

    expect(repository.repositoryKey).toBe("conacts/symphony");
  });

  it("rejects conflicting repo label overrides", () => {
    expect(() =>
      resolveIssueRepository(
        [
          buildAdmittedRepository("conacts/symphony", { teamKey: "SYM" }),
          buildAdmittedRepository("conacts/coldets-v2", { teamKey: "COL" })
        ],
        buildSymphonyTrackerIssue({
          identifier: "SYM-102",
          teamKey: "SYM",
          labels: ["repo:conacts/coldets-v2"]
        })
      )
    ).toThrowError(/conflicting repository routing/i);
  });

  it("rejects issues that do not match any admitted repo in multi-repo mode", () => {
    expect(() =>
      resolveIssueRepository(
        [
          buildAdmittedRepository("conacts/symphony", { teamKey: "SYM" }),
          buildAdmittedRepository("conacts/coldets-v2", { teamKey: "COL" })
        ],
        buildSymphonyTrackerIssue({
          identifier: "SYM-103",
          teamKey: "OTHER",
          labels: []
        })
      )
    ).toThrowError(/does not match any admitted repository by Linear scope/i);
  });

  it("rejects unknown repo labels instead of silently falling back", () => {
    expect(() =>
      resolveIssueRepository(
        [
          buildAdmittedRepository("conacts/symphony", { teamKey: "SYM" }),
          buildAdmittedRepository("conacts/coldets-v2", { teamKey: "COL" })
        ],
        buildSymphonyTrackerIssue({
          identifier: "SYM-104",
          teamKey: "SYM",
          labels: ["repo:conacts/unknown"]
        })
      )
    ).toThrowError(/unknown repository label/i);
  });

  it("allows a single admitted repo without an explicit Linear binding match", () => {
    const repository = resolveIssueRepository(
      [buildAdmittedRepository("conacts/symphony", { teamKey: "SYM" })],
      buildSymphonyTrackerIssue({
        identifier: "SYM-105",
        teamKey: "OTHER",
        labels: []
      })
    );

    expect(repository.repositoryKey).toBe("conacts/symphony");
  });

  it("rejects a single admitted repo when persisted binding scope does not match the issue", () => {
    expect(() =>
      resolveIssueRepository(
        [buildAdmittedRepository("conacts/symphony", { teamKey: "SYM" })],
        buildSymphonyTrackerIssue({
          identifier: "COL-106",
          teamKey: "COL",
          projectId: "project-coldets",
          labels: []
        }),
        {
          organizationId: "org_001",
          linearWorkspaceIdentityId: "linear_workspace_identity_001",
          repositories: [buildBindingCatalog().repositories[0]!]
        }
      )
    ).toThrowError(/persisted binding scope/i);
  });

  it("resolves the process default repository from the Linear tracker binding", () => {
    const repository = resolveRepositoryForLinearScope(
      [
        buildAdmittedRepository("conacts/symphony", { teamKey: "SYM" }),
        buildAdmittedRepository("conacts/coldets-v2", { teamKey: "COL" })
      ],
      {
        teamKey: "COL"
      }
    );

    expect(repository.repositoryKey).toBe("conacts/coldets-v2");
  });

  it("routes issues by persisted project binding before team binding", () => {
    const repository = resolveIssueRepository(
      [
        buildAdmittedRepository("conacts/symphony", { teamKey: "SYM" }),
        buildAdmittedRepository("conacts/coldets-v2", { teamKey: "COL" })
      ],
      buildSymphonyTrackerIssue({
        identifier: "COL-201",
        teamKey: "SYM",
        projectId: "project-coldets",
        labels: []
      }),
      buildBindingCatalog()
    );

    expect(repository.repositoryKey).toBe("conacts/coldets-v2");
  });

  it("returns the hosted repository workspace binding alongside persisted issue routing", () => {
    const selection = resolveIssueRepositorySelection(
      [
        buildAdmittedRepository("conacts/symphony", { teamKey: "SYM" }),
        buildAdmittedRepository("conacts/coldets-v2", { teamKey: "COL" })
      ],
      buildSymphonyTrackerIssue({
        identifier: "COL-202",
        teamKey: "SYM",
        projectId: "project-coldets",
        labels: []
      }),
      buildBindingCatalog()
    );

    expect(selection.repository.repositoryKey).toBe("conacts/coldets-v2");
    expect(selection.repositoryWorkspaceBinding).toEqual(
      expect.objectContaining({
        repositoryWorkspaceBindingId: "repository_workspace_binding_coldets",
        githubRepositoryIdentityId: "github_repository_identity_coldets",
        repositoryKey: "conacts/coldets-v2"
      })
    );
  });

  it("rejects persisted binding catalogs that match multiple repositories for the same team", () => {
    expect(() =>
      resolveIssueRepository(
        [
          buildAdmittedRepository("conacts/symphony", { teamKey: "SYM" }),
          buildAdmittedRepository("conacts/coldets-v2", { teamKey: "COL" })
        ],
        buildSymphonyTrackerIssue({
          identifier: "SYM-301",
          teamKey: "SYM",
          labels: []
        }),
        {
          organizationId: "org_001",
          linearWorkspaceIdentityId: "linear_workspace_identity_001",
          repositories: [
            buildBindingCatalog().repositories[0]!,
            {
              ...buildBindingCatalog().repositories[1]!,
              teamBindings: [
                ...buildBindingCatalog().repositories[1]!.teamBindings,
                {
                  repositoryTeamBindingId: "repository_team_binding_duplicate",
                  linearTeamIdentityId: "linear_team_identity_duplicate",
                  linearTeamId: "linear_team_duplicate",
                  linearTeamKey: "SYM",
                  source: "manual"
                }
              ]
            }
          ]
        }
      )
    ).toThrowError(/matches multiple repositories for team/i);
  });

  it("resolves the process default repository from the persisted binding scope", () => {
    const repository = resolveRepositoryForPersistedBindingScope({
      admittedRepositories: [
        buildAdmittedRepository("conacts/symphony", { teamKey: "SYM" }),
        buildAdmittedRepository("conacts/coldets-v2", { teamKey: "COL" })
      ],
      bindingCatalog: buildBindingCatalog(),
      tracker: {
        teamKey: "COL"
      }
    });

    expect(repository.repositoryKey).toBe("conacts/coldets-v2");
  });

  it("rejects multi-repo process defaults without a Linear tracker team", () => {
    expect(() =>
      resolveRepositoryForLinearScope(
        [
          buildAdmittedRepository("conacts/symphony", { teamKey: "SYM" }),
          buildAdmittedRepository("conacts/coldets-v2", { teamKey: "COL" })
        ],
        {
          teamKey: null
        }
      )
    ).toThrowError(/require tracker\.teamKey/i);
  });

  it("rejects workspace repo selection when multiple repos are admitted and no repositoryKey is present", () => {
    expect(() =>
      resolveWorkspaceRepository(
        [
          buildAdmittedRepository("conacts/symphony", { teamKey: "SYM" }),
          buildAdmittedRepository("conacts/coldets-v2", { teamKey: "COL" })
        ],
        null
      )
    ).toThrowError(/explicit repositoryKey/i);
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

function buildBindingCatalog(): SymphonyWorkspaceBindingCatalog {
  return {
    organizationId: "org_001",
    linearWorkspaceIdentityId: "linear_workspace_identity_001",
    repositories: [
      {
        repositoryWorkspaceBindingId: "repository_workspace_binding_symphony",
        githubInstallationIdentityId: "github_installation_identity_001",
        githubRepositoryIdentityId: "github_repository_identity_symphony",
        repositoryKey: "conacts/symphony",
        linearWorkspaceIdentityId: "linear_workspace_identity_001",
        source: "bootstrap",
        teamBindings: [
          {
            repositoryTeamBindingId: "repository_team_binding_symphony",
            linearTeamIdentityId: "linear_team_identity_symphony",
            linearTeamId: "linear_team_symphony",
            linearTeamKey: "SYM",
            source: "bootstrap"
          }
        ],
        projectBindings: [
          {
            repositoryProjectBindingId: "repository_project_binding_symphony",
            linearProjectIdentityId: "linear_project_identity_symphony",
            linearProjectId: "project-symphony",
            source: "bootstrap"
          }
        ]
      },
      {
        repositoryWorkspaceBindingId: "repository_workspace_binding_coldets",
        githubInstallationIdentityId: "github_installation_identity_001",
        githubRepositoryIdentityId: "github_repository_identity_coldets",
        repositoryKey: "conacts/coldets-v2",
        linearWorkspaceIdentityId: "linear_workspace_identity_001",
        source: "bootstrap",
        teamBindings: [
          {
            repositoryTeamBindingId: "repository_team_binding_coldets",
            linearTeamIdentityId: "linear_team_identity_coldets",
            linearTeamId: "linear_team_coldets",
            linearTeamKey: "COL",
            source: "bootstrap"
          }
        ],
        projectBindings: [
          {
            repositoryProjectBindingId: "repository_project_binding_coldets",
            linearProjectIdentityId: "linear_project_identity_coldets",
            linearProjectId: "project-coldets",
            source: "bootstrap"
          }
        ]
      }
    ]
  };
}
