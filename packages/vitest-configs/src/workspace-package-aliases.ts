import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(__dirname, "../../..");

export type AliasEntry = { find: RegExp; replacement: string };

type PackageJsonExports = Record<
  string,
  string | { default?: string; import?: string; types?: string }
>;

function resolveSourceEntryPath(
  packageDirectory: string,
  exportTarget: string
): string | null {
  if (!exportTarget.startsWith("./dist/")) {
    return null;
  }

  const candidatePath = path.join(
    packageDirectory,
    exportTarget.replace("./dist/", "src/").replace(/\.d\.ts$|\.js$/u, ".ts")
  );

  return fs.existsSync(candidatePath) ? candidatePath : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function createWorkspacePackageAliases(input?: {
  repoRoot?: string;
}): AliasEntry[] {
  const repoRoot = input?.repoRoot ?? defaultRepoRoot;
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
        exports?: unknown;
      };

      if (typeof packageJson.name !== "string" || !packageJson.name.startsWith("@symphony/")) {
        return [];
      }

      const aliases: AliasEntry[] = [
        {
          find: new RegExp(`^${escapeRegExp(packageJson.name)}$`, "u"),
          replacement: sourceIndexPath
        }
      ];

      if (
        packageJson.exports &&
        typeof packageJson.exports === "object" &&
        !Array.isArray(packageJson.exports)
      ) {
        for (const [exportKey, exportValue] of Object.entries(
          packageJson.exports as PackageJsonExports
        )) {
          if (exportKey === "." || exportKey === "./package.json") {
            continue;
          }

          const exportTarget =
            typeof exportValue === "string"
              ? exportValue
              : exportValue.import ?? exportValue.default ?? exportValue.types;

          if (typeof exportTarget !== "string") {
            continue;
          }

          const sourcePath = resolveSourceEntryPath(packageDirectory, exportTarget);

          if (!sourcePath) {
            continue;
          }

          aliases.push({
            find: new RegExp(`^${escapeRegExp(`${packageJson.name}/${exportKey.slice(2)}`)}$`, "u"),
            replacement: sourcePath
          });
        }
      }

      return aliases;
    })
    .sort((left, right) => right.find.source.length - left.find.source.length);
}

export const workspacePackageAliases = createWorkspacePackageAliases();
