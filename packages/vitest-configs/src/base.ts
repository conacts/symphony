import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

function createWorkspacePackageAliases(): Array<{ find: string; replacement: string }> {
  const packagesDirectory = path.join(repoRoot, "packages");

  return fs
    .readdirSync(packagesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const packageDirectory = path.join(packagesDirectory, entry.name);
      const packageJsonPath = path.join(packageDirectory, "package.json");
      const sourceIndexPath = path.join(packageDirectory, "src", "index.ts");

      if (!fs.existsSync(packageJsonPath) || !fs.existsSync(sourceIndexPath)) {
        return [];
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
        name?: unknown;
      };

      return typeof packageJson.name === "string" && packageJson.name.startsWith("@symphony/")
        ? [
            {
              find: packageJson.name,
              replacement: sourceIndexPath
            }
          ]
        : [];
    })
    .sort((left, right) => right.find.length - left.find.length);
}

const workspacePackageAliases = createWorkspacePackageAliases();

const base = defineConfig({
  resolve: {
    alias: workspacePackageAliases
  },
  test: {
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
    include: ["src/**/*.test.ts", "src/**/*.spec.ts", "tests/**/*.test.ts", "tests/**/*.spec.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "json", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "**/*.d.ts",
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/dist/**",
        "**/node_modules/**"
      ]
    }
  }
});

export default base;
