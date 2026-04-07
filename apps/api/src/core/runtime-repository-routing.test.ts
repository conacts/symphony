import { describe, expect, it } from "vitest";
import { buildSymphonyTrackerIssue } from "@symphony/tracker";
import {
  resolveIssueRepository,
  resolveRepositoryForLinearScope,
  resolveWorkspaceRepository
} from "./runtime-repository-routing.js";
import type { AdmittedRuntimeRepository } from "./runtime-admitted-repositories.js";

describe("runtime repository routing", () => {
  it("routes a multi-repo issue by Linear project binding", () => {
    const repository = resolveIssueRepository(
      [
        buildAdmittedRepository("conacts/symphony", {
          projectSlug: "symphony",
          teamKey: null
        }),
        buildAdmittedRepository("conacts/coldets-v2", {
          projectSlug: "coldets",
          teamKey: null
        })
      ],
      buildSymphonyTrackerIssue({
        identifier: "SYM-101",
        projectSlug: "symphony",
        labels: []
      })
    );

    expect(repository.repositoryKey).toBe("conacts/symphony");
  });

  it("rejects conflicting repo label overrides", () => {
    expect(() =>
      resolveIssueRepository(
        [
          buildAdmittedRepository("conacts/symphony", {
            projectSlug: "symphony",
            teamKey: null
          }),
          buildAdmittedRepository("conacts/coldets-v2", {
            projectSlug: "coldets",
            teamKey: null
          })
        ],
        buildSymphonyTrackerIssue({
          identifier: "SYM-102",
          projectSlug: "symphony",
          labels: ["repo:conacts/coldets-v2"]
        })
      )
    ).toThrowError(/conflicting repository routing/i);
  });

  it("rejects issues that do not match any admitted repo in multi-repo mode", () => {
    expect(() =>
      resolveIssueRepository(
        [
          buildAdmittedRepository("conacts/symphony", {
            projectSlug: "symphony",
            teamKey: null
          }),
          buildAdmittedRepository("conacts/coldets-v2", {
            projectSlug: "coldets",
            teamKey: null
          })
        ],
        buildSymphonyTrackerIssue({
          identifier: "SYM-103",
          projectSlug: "unknown-project",
          labels: []
        })
      )
    ).toThrowError(/does not match any admitted repository by Linear scope/i);
  });

  it("rejects unknown repo labels instead of silently falling back", () => {
    expect(() =>
      resolveIssueRepository(
        [
          buildAdmittedRepository("conacts/symphony", {
            projectSlug: "symphony",
            teamKey: null
          }),
          buildAdmittedRepository("conacts/coldets-v2", {
            projectSlug: "coldets",
            teamKey: null
          })
        ],
        buildSymphonyTrackerIssue({
          identifier: "SYM-104",
          projectSlug: "symphony",
          labels: ["repo:conacts/unknown"]
        })
      )
    ).toThrowError(/unknown repository label/i);
  });

  it("allows a single admitted repo without an explicit Linear binding match", () => {
    const repository = resolveIssueRepository(
      [
        buildAdmittedRepository("conacts/symphony", {
          projectSlug: "symphony",
          teamKey: null
        })
      ],
      buildSymphonyTrackerIssue({
        identifier: "SYM-105",
        projectSlug: "other-project",
        labels: []
      })
    );

    expect(repository.repositoryKey).toBe("conacts/symphony");
  });

  it("resolves the process default repository from the Linear tracker binding", () => {
    const repository = resolveRepositoryForLinearScope(
      [
        buildAdmittedRepository("conacts/symphony", {
          projectSlug: "symphony",
          teamKey: null
        }),
        buildAdmittedRepository("conacts/coldets-v2", {
          projectSlug: "coldets",
          teamKey: null
        })
      ],
      {
        projectSlug: "coldets",
        teamKey: null
      }
    );

    expect(repository.repositoryKey).toBe("conacts/coldets-v2");
  });

  it("rejects multi-repo process defaults without a Linear tracker binding", () => {
    expect(() =>
      resolveRepositoryForLinearScope(
        [
          buildAdmittedRepository("conacts/symphony", {
            projectSlug: "symphony",
            teamKey: null
          }),
          buildAdmittedRepository("conacts/coldets-v2", {
            projectSlug: "coldets",
            teamKey: null
          })
        ],
        {
          projectSlug: null,
          teamKey: null
        }
      )
    ).toThrowError(/require tracker\.projectSlug or tracker\.teamKey/i);
  });

  it("rejects workspace repo selection when multiple repos are admitted and no repositoryKey is present", () => {
    expect(() =>
      resolveWorkspaceRepository(
        [
          buildAdmittedRepository("conacts/symphony", {
            projectSlug: "symphony",
            teamKey: null
          }),
          buildAdmittedRepository("conacts/coldets-v2", {
            projectSlug: "coldets",
            teamKey: null
          })
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
