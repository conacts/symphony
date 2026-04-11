import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createWorkspacePackageAliases } from "./workspace-package-aliases.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

function resolveAlias(specifier: string): string | null {
  const alias = createWorkspacePackageAliases({ repoRoot }).find((entry) =>
    entry.find.test(specifier)
  );

  return alias?.replacement ?? null;
}

describe("createWorkspacePackageAliases", () => {
  it("routes workspace package roots to source index files", () => {
    expect(resolveAlias("@symphony/contracts")).toBe(
      path.join(repoRoot, "packages/contracts/src/index.ts")
    );
  });

  it("routes exported workspace subpaths to source entrypoints", () => {
    expect(resolveAlias("@symphony/runtime-run-ledger/internal")).toBe(
      path.join(repoRoot, "packages/runtime-run-ledger/src/internal.ts")
    );
    expect(resolveAlias("@symphony/workspace/test-support")).toBe(
      path.join(repoRoot, "packages/workspace/src/test-support.ts")
    );
  });

  it("does not alias package metadata or unexported subpaths", () => {
    expect(resolveAlias("@symphony/contracts/package.json")).toBeNull();
    expect(resolveAlias("@symphony/contracts/internal")).toBeNull();
  });
});
