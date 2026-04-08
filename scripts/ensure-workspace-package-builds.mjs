import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const targetPackagePath = path.resolve(process.cwd(), "package.json");
const targetPackage = JSON.parse(readFileSync(targetPackagePath, "utf8"));

const workspacePackages = new Map();
for (const relativeDir of ["packages", "apps"]) {
  const baseDir = path.join(repoRoot, relativeDir);
  for (const entry of safeReadDir(baseDir)) {
    const packageJsonPath = path.join(baseDir, entry, "package.json");
    if (!existsSync(packageJsonPath)) {
      continue;
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    if (typeof packageJson.name === "string" && packageJson.name.length > 0) {
      workspacePackages.set(packageJson.name, {
        dir: path.dirname(packageJsonPath),
        packageJson
      });
    }
  }
}

const missingBuilds = [];
for (const [dependencyName, dependencyVersion] of Object.entries({
  ...targetPackage.dependencies
})) {
  if (!isWorkspaceDependency(dependencyVersion)) {
    continue;
  }

  const workspaceDependency = workspacePackages.get(dependencyName);
  if (!workspaceDependency) {
    continue;
  }

  if (requiresBuiltArtifacts(workspaceDependency.packageJson) && !hasBuiltArtifacts(workspaceDependency)) {
    missingBuilds.push(dependencyName);
  }
}

if (missingBuilds.length > 0) {
  const result = spawnSync(
    "pnpm",
    [
      "--dir",
      repoRoot,
      ...missingBuilds.flatMap((dependencyName) => ["--filter", dependencyName]),
      "build"
    ],
    {
      stdio: "inherit"
    }
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function safeReadDir(dirPath) {
  try {
    return readDirNames(dirPath);
  } catch {
    return [];
  }
}

function readDirNames(dirPath) {
  return readdirSync(dirPath, {
    withFileTypes: true
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function isWorkspaceDependency(value) {
  return typeof value === "string" && value.startsWith("workspace:");
}

function requiresBuiltArtifacts(packageJson) {
  return [packageJson.main, packageJson.types]
    .filter((value) => typeof value === "string")
    .some((value) => value.startsWith("./dist/"));
}

function hasBuiltArtifacts(workspaceDependency) {
  return [workspaceDependency.packageJson.main, workspaceDependency.packageJson.types]
    .filter((value) => typeof value === "string")
    .every((relativePath) => existsSync(path.join(workspaceDependency.dir, relativePath)));
}
