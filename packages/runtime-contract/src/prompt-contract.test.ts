import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildMockSymphonyPromptContractPayload,
  loadSymphonyPromptContract,
  renderSymphonyPromptContract,
  symphonyHarnessPromptAppendix,
  SymphonyPromptContractError
} from "./prompt-contract.js";

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
        "Workspace {{ workspace.path }} on {{ workspace.branch }}",
        "",
        "{{ run_mode_section }}",
        "",
        "{{ handoff_section }}"
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
      "workspace.branch",
      "run_mode_section",
      "handoff_section"
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
        "Workspace /workspace/symphony on symphony/runtime-contract-boundary",
        "",
        "Current run mode: Implementation",
        "- Complete the requested ticket work in the current workspace.",
        "- Keep the patch targeted and move directly toward a review-ready result.",
        "- End the run with a structured terminal module result.",
        "",
        symphonyHarnessPromptAppendix,
        ""
      ].join("\n")
    );
    expect(symphonyHarnessPromptAppendix).toContain(
      "Before editing, gather enough local context to make one clean patch"
    );
    expect(symphonyHarnessPromptAppendix).toContain(
      "Prefer built-in Pi tools for reading, searching, and editing files."
    );
    expect(symphonyHarnessPromptAppendix).toContain(
      "No legacy Symphony CLI completion command is available in this runtime."
    );
    expect(symphonyHarnessPromptAppendix).toContain(
      "Implementation and rework runs complete through a structured terminal module result."
    );
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

  it("appends the handoff section when the repo prompt omits the handoff slot", () => {
    const payload = {
      ...buildMockSymphonyPromptContractPayload(),
      handoff_section: [
        "Rework handoff:",
        "- Review context: https://github.com/openai/symphony/pull/123#issuecomment-456"
      ].join("\n")
    };

    expect(
      renderSymphonyPromptContract({
        template: "Issue {{ issue.identifier }}",
        payload
      })
    ).toBe(
      [
        "Issue ENG-123",
        "",
        "Rework handoff:",
        "- Review context: https://github.com/openai/symphony/pull/123#issuecomment-456",
        "",
        symphonyHarnessPromptAppendix,
        ""
      ].join("\n")
    );
  });

  it("does not duplicate the handoff section when the repo prompt already renders it", () => {
    const payload = {
      ...buildMockSymphonyPromptContractPayload(),
      handoff_section: [
        "Rework handoff:",
        "- Review context: https://github.com/openai/symphony/pull/123#issuecomment-456"
      ].join("\n")
    };

    expect(
      renderSymphonyPromptContract({
        template: ["Issue {{ issue.identifier }}", "", "{{ handoff_section }}"].join("\n"),
        payload
      })
    ).toBe(
      [
        "Issue ENG-123",
        "",
        "Rework handoff:",
        "- Review context: https://github.com/openai/symphony/pull/123#issuecomment-456",
        "",
        symphonyHarnessPromptAppendix,
        ""
      ].join("\n")
    );
  });

  it("renders the rework run-mode section when the issue is in Rework", () => {
    const payload = {
      ...buildMockSymphonyPromptContractPayload(),
      run_mode: "rework" as const,
      issue: {
        ...buildMockSymphonyPromptContractPayload().issue,
        state: "Rework"
      }
    };

    expect(
      renderSymphonyPromptContract({
        template: "{{ run_mode_section }}",
        payload
      })
    ).toBe(
      [
        "Current run mode: Rework",
        "- Read the latest Linear rework note and any relevant GitHub review comment context first.",
        "- Address the requested feedback before taking on any new work.",
        "- Keep the patch scoped to the requested revisions.",
        "",
        symphonyHarnessPromptAppendix,
        ""
      ].join("\n")
    );
  });

  it("renders the capability-managed completion contract for module-result runs", () => {
    const payload = {
      ...buildMockSymphonyPromptContractPayload(),
      completion_contract: "module_result" as const
    };

    const rendered = renderSymphonyPromptContract({
      template: "{{ run_mode_section }}",
      payload
    });

    expect(rendered).toContain(
      "End the run with a structured terminal module result."
    );
    expect(rendered).toContain(
      "Implementation and rework runs complete through a structured terminal module result."
    );
    expect(rendered).not.toContain(
      "`pnpm exec symphony tool finish ...`: Record delivery for implementation or rework runs"
    );
  });

  it("renders the approved merge run-mode section when the payload requests it", () => {
    const payload = {
      ...buildMockSymphonyPromptContractPayload(),
      run_mode: "approved_merge" as const
    };

    expect(
      renderSymphonyPromptContract({
        template: "{{ run_mode_section }}",
        payload
      })
    ).toBe(
      [
        "Current run mode: Approved Merge (Unsupported)",
        "- Approved merge is no longer a supported live run mode in Symphony.",
        "- Do not merge or try to emulate the removed CLI merge flow.",
        "- Stop and report the unsupported state through a structured blocked terminal module result.",
        "",
        symphonyHarnessPromptAppendix,
        ""
      ].join("\n")
    );
  });
});

async function createTempRepo(): Promise<string> {
  const repoRoot = await mkdtemp(
    path.join(tmpdir(), "symphony-prompt-contract-")
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
