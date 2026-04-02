import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  defaultSymphonyRuntimeContractPaths,
  loadSymphonyRuntimeContract
} from "./repo-contract.js";

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

describe("runtime contract", () => {
  it("loads the repo runtime manifest and prompt contract together", async () => {
    const repoRoot = await createTempRepo();

    await writeFile(
      path.join(repoRoot, ".symphony", "runtime.ts"),
      `import { defineSymphonyRuntime } from "@symphony/runtime-contract";

export default defineSymphonyRuntime({
  schemaVersion: 1,
  workspace: {
    packageManager: "pnpm"
  },
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
        name: "smoke",
        run: "pnpm test:smoke"
      }
    ]
  }
});
`
    );
    await writeFile(
      path.join(repoRoot, ".symphony", "prompt.md"),
      "Issue {{ issue.identifier }}"
    );

    const loaded = await loadSymphonyRuntimeContract({
      repoRoot
    });

    expect(loaded.repoRoot).toBe(repoRoot);
    expect(loaded.runtimeManifest.manifest.schemaVersion).toBe(1);
    expect(loaded.promptContract.variables).toEqual(["issue.identifier"]);
  });

  it("exposes the default runtime contract snapshot paths", async () => {
    const repoRoot = await createTempRepo();

    expect(defaultSymphonyRuntimeContractPaths(repoRoot)).toEqual({
      repoRoot,
      manifestPath: path.join(repoRoot, ".symphony", "runtime.ts"),
      promptPath: path.join(repoRoot, ".symphony", "prompt.md")
    });
  });

  it("fails when the repo prompt contract is missing", async () => {
    const repoRoot = await createTempRepo();
    await writeFile(
      path.join(repoRoot, ".symphony", "runtime.ts"),
      `import { defineSymphonyRuntime } from "@symphony/runtime-contract";

export default defineSymphonyRuntime({
  schemaVersion: 1,
  workspace: {
    packageManager: "pnpm"
  },
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
        name: "smoke",
        run: "pnpm test:smoke"
      }
    ]
  }
});
`
    );

    await expect(
      loadSymphonyRuntimeContract({
        repoRoot
      })
    ).rejects.toThrowError(/Missing Symphony prompt contract/i);
  });
});

async function createTempRepo(): Promise<string> {
  const repoRoot = await mkdtemp(
    path.join(tmpdir(), "symphony-runtime-contract-")
  );
  tempDirectories.push(repoRoot);
  await mkdir(path.join(repoRoot, ".symphony"), {
    recursive: true
  });
  return repoRoot;
}
