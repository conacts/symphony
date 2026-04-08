import { describe, expect, it } from "vitest";
import { buildSymphonyTrackerIssue } from "@symphony/tracker";
import {
  resolveIssueRepository,
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
