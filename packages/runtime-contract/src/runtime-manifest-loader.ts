import { access, mkdtemp, rm, symlink } from "node:fs/promises";
import { build, type PluginBuild } from "esbuild";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { asRecord } from "./internal/records.js";
import {
  defaultSymphonyRuntimeManifestPath,
  extractDefinedRuntimeManifest,
  SymphonyRuntimeManifestError,
  type SymphonyLoadedRuntimeManifest,
  type SymphonyRuntimeManifestLoadOptions
} from "./runtime-manifest.js";

export async function loadSymphonyRuntimeManifest(
  input: string | SymphonyRuntimeManifestLoadOptions
): Promise<SymphonyLoadedRuntimeManifest> {
  const repoRoot =
    typeof input === "string"
      ? path.resolve(input)
      : path.resolve(input.repoRoot);
  const manifestPath = resolveRuntimeManifestPath(repoRoot, input);
  const loaderDirectory = await mkdtemp(
    path.join(tmpdir(), "symphony-runtime-manifest-loader-")
  );
  const bundlePath = path.join(loaderDirectory, "runtime-manifest.bundle.mjs");

  try {
    await access(manifestPath);
  } catch (error) {
    await rm(loaderDirectory, {
      recursive: true,
      force: true
    });

    if (isMissingFileError(error)) {
      throw new SymphonyRuntimeManifestError(
        "missing_runtime_manifest",
        `Missing Symphony runtime manifest: ${manifestPath}`,
        {
          manifestPath
        }
      );
    }

    throw error;
  }

  try {
    await prepareRuntimeManifestLoaderDirectory(loaderDirectory, repoRoot);
    await createRuntimeManifestBundle(manifestPath, bundlePath);
    const moduleNamespace = asRecord(
      await import(`${pathToFileURL(bundlePath).href}?ts=${Date.now()}`)
    );
    if (!moduleNamespace) {
      throw new Error("Runtime manifest module did not resolve to an object.");
    }
    const manifest = extractDefinedRuntimeManifest(moduleNamespace, manifestPath);

    return {
      repoRoot,
      manifestPath,
      manifest
    };
  } catch (error) {
    if (error instanceof SymphonyRuntimeManifestError) {
      throw error.withManifestPath(manifestPath);
    }

    const detail =
      error instanceof Error && error.message.trim() !== ""
        ? error.message
        : "Unknown manifest loading error.";

    throw new SymphonyRuntimeManifestError(
      "runtime_manifest_load_failed",
      `Failed to load Symphony runtime manifest at ${manifestPath}: ${detail}`,
      {
        manifestPath,
        cause: error
      }
    );
  } finally {
    await rm(loaderDirectory, {
      recursive: true,
      force: true
    });
  }
}

function resolveRuntimeManifestPath(
  repoRoot: string,
  input: string | SymphonyRuntimeManifestLoadOptions
): string {
  if (typeof input === "string" || !input.manifestPath) {
    return defaultSymphonyRuntimeManifestPath(repoRoot);
  }

  return path.isAbsolute(input.manifestPath)
    ? input.manifestPath
    : path.join(repoRoot, input.manifestPath);
}

async function createRuntimeManifestBundle(
  manifestPath: string,
  bundlePath: string
): Promise<void> {
  const authoringShimPath = await resolveAuthoringShimPath();

  await build({
    entryPoints: [manifestPath],
    outfile: bundlePath,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    sourcemap: "inline",
    packages: "external",
    logLevel: "silent",
    plugins: [
      {
        name: "symphony-runtime-manifest-authoring-alias",
        setup(pluginBuild: PluginBuild) {
          pluginBuild.onResolve(
            {
              filter: /^@symphony\/runtime-contract$/
            },
            () => ({
              path: authoringShimPath
            })
          );
        }
      }
    ]
  });
}

async function prepareRuntimeManifestLoaderDirectory(
  loaderDirectory: string,
  repoRoot: string
): Promise<void> {
  const repoNodeModules = path.join(repoRoot, "node_modules");

  try {
    await access(repoNodeModules);
  } catch (error) {
    if (isMissingFileError(error)) {
      return;
    }

    throw error;
  }

  await symlink(
    repoNodeModules,
    path.join(loaderDirectory, "node_modules"),
    "junction"
  );
}

async function resolveAuthoringShimPath(): Promise<string> {
  for (const relativePath of ["./authoring-shim.js", "./authoring-shim.ts"]) {
    const candidatePath = fileURLToPath(new URL(relativePath, import.meta.url));

    try {
      await access(candidatePath);
      return candidatePath;
    } catch (error) {
      if (isMissingFileError(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Could not resolve the Symphony runtime manifest authoring shim.");
}

function isMissingFileError(
  error: unknown
): error is Error & {
  code?: string;
} {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
