import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { SymphonyPromptContractError } from "./prompt-contract.js";
import {
  runSymphonyRuntimeDoctor,
  type SymphonyRuntimeDoctorInput
} from "./runtime-doctor.js";
import { SymphonyRuntimeManifestError } from "./runtime-manifest.js";

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

describe("runtime doctor", () => {
  it("validates the full repo contract and returns a redacted report", async () => {
    const repoRoot = await createTempRepo();
    await writeRuntimeManifest(
      repoRoot,
      `
import { defineSymphonyRuntime } from "@symphony/runtime-contract";

export default defineSymphonyRuntime({
  schemaVersion: 1,
  workspace: {
    packageManager: "pnpm"
  },
  services: {
    postgres: {
      type: "postgres",
      image: "postgres:16",
      database: "app",
      username: "app",
      password: "service-secret",
      init: [
        {
          name: "init",
          run: "pnpm db:init"
        }
      ]
    }
  },
  env: {
    host: {
      required: ["OPENAI_API_KEY"],
      optional: ["GITHUB_TOKEN"]
    },
    inject: {
      DATABASE_URL: {
        kind: "service",
        service: "postgres",
        value: "connectionString"
      },
      SYMPHONY_ISSUE_IDENTIFIER: {
        kind: "runtime",
        value: "issueIdentifier"
      }
    }
  },
  lifecycle: {
    bootstrap: [],
    migrate: [],
    verify: [
      {
        name: "verify",
        run: "pnpm verify"
      }
    ]
  }
});
`
    );
    await writePrompt(repoRoot, "Issue {{ issue.identifier }} in {{ repo.name }}");

    const report = await runDoctor({
      repoRoot,
      environmentSource: {
        OPENAI_API_KEY: "host-secret",
        GITHUB_TOKEN: "github-secret"
      }
    });

    expect(report.schemaVersion).toBe(1);
    expect(report.env.requiredHostKeys).toEqual(["OPENAI_API_KEY"]);
    expect(report.env.presentRequiredHostKeys).toEqual(["OPENAI_API_KEY"]);
    expect(report.env.injectedKeys).toEqual([
      "DATABASE_URL",
      "GITHUB_TOKEN",
      "OPENAI_API_KEY",
      "SYMPHONY_ISSUE_IDENTIFIER"
    ]);
    expect(report.services).toEqual([
      {
        serviceKey: "postgres",
        type: "postgres",
        host: "postgres",
        port: 5432,
        database: "app",
        username: "app",
        passwordConfigured: true,
        connectionStringConfigured: true,
        initStepNames: ["init"],
        readiness: null,
        resources: null
      }
    ]);
    expect(report.prompt.variables).toEqual(["issue.identifier", "repo.name"]);

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("host-secret");
    expect(serialized).not.toContain("github-secret");
    expect(serialized).not.toContain("service-secret");
  });

  it("fails fast when a required host env binding is missing", async () => {
    const repoRoot = await createTempRepo();
    await writeRuntimeManifest(
      repoRoot,
      `
import { defineSymphonyRuntime } from "@symphony/runtime-contract";

export default defineSymphonyRuntime({
  schemaVersion: 1,
  workspace: {
    packageManager: "pnpm"
  },
  env: {
    host: {
      required: ["OPENAI_API_KEY"],
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
        run: "pnpm verify"
      }
    ]
  }
});
`
    );
    await writePrompt(repoRoot, "Issue {{ issue.identifier }}");

    await expect(
      runDoctor({
        repoRoot,
        environmentSource: {}
      })
    ).rejects.toThrowError(SymphonyRuntimeManifestError);
    await expect(
      runDoctor({
        repoRoot,
        environmentSource: {}
      })
    ).rejects.toThrowError(/Required host environment variable OPENAI_API_KEY is missing/i);
  });

  it("fails fast when the prompt contract is missing", async () => {
    const repoRoot = await createTempRepo();
    await writeRuntimeManifest(
      repoRoot,
      `
import { defineSymphonyRuntime } from "@symphony/runtime-contract";

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
        name: "verify",
        run: "pnpm verify"
      }
    ]
  }
});
`
    );

    await expect(
      runDoctor({
        repoRoot,
        environmentSource: {}
      })
    ).rejects.toThrowError(SymphonyPromptContractError);
    await expect(
      runDoctor({
        repoRoot,
        environmentSource: {}
      })
    ).rejects.toThrowError(/Missing Symphony prompt contract/i);
  });
});

async function createTempRepo(): Promise<string> {
  const repoRoot = await mkdtemp(
    path.join(tmpdir(), "symphony-runtime-doctor-")
  );
  tempDirectories.push(repoRoot);

  await mkdir(path.join(repoRoot, ".symphony"), {
    recursive: true
  });

  return repoRoot;
}

async function writeRuntimeManifest(
  repoRoot: string,
  source: string
): Promise<void> {
  await writeFile(path.join(repoRoot, ".symphony", "runtime.ts"), source.trimStart());
}

async function writePrompt(repoRoot: string, template: string): Promise<void> {
  await writeFile(path.join(repoRoot, ".symphony", "prompt.md"), template);
}

function runDoctor(
  input: SymphonyRuntimeDoctorInput
): Promise<Awaited<ReturnType<typeof runSymphonyRuntimeDoctor>>> {
  return runSymphonyRuntimeDoctor(input);
}
