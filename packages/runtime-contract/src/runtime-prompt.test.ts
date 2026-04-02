import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildMockSymphonyPromptContractPayload,
  loadSymphonyPromptContract,
  renderSymphonyPromptContract,
  SymphonyPromptContractError
} from "./prompt-contract.js";
import {
  loadSymphonyRuntimePromptTemplate,
  SymphonyRuntimePromptError
} from "./runtime-prompt.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true
      })
    )
  );
});

describe("prompt contract", () => {
  it("loads and validates a repo-local prompt contract with the documented render surface", async () => {
    const repoRoot = await createTempRepo();
    await writePrompt(
      repoRoot,
      [
        "Issue {{ issue.identifier }}",
        "Repo {{ repo.name }}",
        "Default branch {{ repo.default_branch }}",
        "Run {{ run.id }}",
        "Workspace {{ workspace.path }} on {{ workspace.branch }}"
      ].join("\n")
    );

    const loaded = loadSymphonyPromptContract({
      repoRoot
    });

    expect(loaded.promptPath).toBe(path.join(repoRoot, ".symphony", "prompt.md"));
    expect(loaded.variables).toEqual([
      "issue.identifier",
      "repo.name",
      "repo.default_branch",
      "run.id",
      "workspace.path",
      "workspace.branch"
    ]);
    expect(
      renderSymphonyPromptContract({
        template: loaded.template,
        payload: buildMockSymphonyPromptContractPayload(),
        promptPath: loaded.promptPath
      })
    ).toBe(
      [
        "Issue ENG-123",
        "Repo symphony",
        "Default branch main",
        "Run run-123",
        "Workspace /workspace/symphony on codex/runtime-contract-boundary"
      ].join("\n")
    );
  });

  it("keeps the runtime-prompt compatibility exports wired to the same implementation", async () => {
    const repoRoot = await createTempRepo();
    await writePrompt(repoRoot, "Issue {{ issue.identifier }}");

    const loaded = loadSymphonyRuntimePromptTemplate({
      repoRoot
    });

    expect(loaded.variables).toEqual(["issue.identifier"]);
  });

  it("fails fast when the prompt file is missing", async () => {
    const repoRoot = await createTempRepo();

    expect(() =>
      loadSymphonyPromptContract({
        repoRoot
      })
    ).toThrowError(SymphonyPromptContractError);

    expect(() =>
      loadSymphonyPromptContract({
        repoRoot
      })
    ).toThrowError(/Missing Symphony prompt contract/i);
  });

  it("fails fast when the template contains unknown variables", async () => {
    const repoRoot = await createTempRepo();
    await writePrompt(repoRoot, "Issue {{ issue.notReal }}");

    expect(() =>
      loadSymphonyPromptContract({
        repoRoot
      })
    ).toThrowError(/Unknown prompt contract variable: issue.notReal/i);
  });

  it("fails fast when the template syntax is invalid", async () => {
    const repoRoot = await createTempRepo();
    await writePrompt(repoRoot, "Issue {{ issue.identifier ");

    expect(() =>
      loadSymphonyPromptContract({
        repoRoot
      })
    ).toThrowError(/opening template delimiter without a closing delimiter/i);
  });

  it("fails fast when rendering produces an empty prompt", () => {
    const payload = buildMockSymphonyPromptContractPayload();

    expect(() =>
      renderSymphonyPromptContract({
        template: "{{ issue.description }}",
        payload: {
          ...payload,
          issue: {
            ...payload.issue,
            description: null
          }
        }
      })
    ).toThrowError(/rendered an empty prompt/i);
  });

  it("supports the legacy camelCase prompt aliases for branch naming", () => {
    const payload = buildMockSymphonyPromptContractPayload();

    expect(
      renderSymphonyPromptContract({
        template: "{{ issue.branchName }}",
        payload
      })
    ).toBe("codex/runtime-contract-boundary");

    expect(SymphonyRuntimePromptError).toBe(SymphonyPromptContractError);
  });
});

async function createTempRepo(): Promise<string> {
  const repoRoot = await mkdtemp(
    path.join(tmpdir(), "symphony-runtime-prompt-")
  );
  tempDirectories.push(repoRoot);

  await mkdir(path.join(repoRoot, ".symphony"), {
    recursive: true
  });

  return repoRoot;
}

async function writePrompt(
  repoRoot: string,
  template: string
): Promise<void> {
  await writeFile(path.join(repoRoot, ".symphony", "prompt.md"), template);
}
