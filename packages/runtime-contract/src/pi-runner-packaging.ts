export const defaultPiRunnerExecutableName = "symphony-pi-runner";
export const defaultPiRunnerExecutablePath =
  `/usr/local/bin/${defaultPiRunnerExecutableName}`;
export const defaultPiRunnerPackageRoot = "/opt/symphony/pi-runner";
export const defaultPiRunnerTsxLoaderRelativePath =
  "node_modules/tsx/dist/loader.mjs";
export const defaultPiRunnerEntrypointRelativePath =
  "src/pi/runner-entrypoint.ts";

export function resolvePiRunnerPackagedAssetPaths(
  packageRoot: string = defaultPiRunnerPackageRoot
): readonly [string, string] {
  const normalizedPackageRoot = normalizePiRunnerPackageRoot(packageRoot);

  return [
    `${normalizedPackageRoot}/${defaultPiRunnerTsxLoaderRelativePath}`,
    `${normalizedPackageRoot}/${defaultPiRunnerEntrypointRelativePath}`
  ] as const;
}

function normalizePiRunnerPackageRoot(packageRoot: string): string {
  const trimmedPackageRoot = packageRoot.trim();
  if (trimmedPackageRoot === "") {
    throw new TypeError("Pi runner package root must be non-empty.");
  }

  return trimmedPackageRoot.replace(/\/+$/u, "");
}
