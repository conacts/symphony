import { access, mkdtemp, rm } from "node:fs/promises";
import { build, type PluginBuild } from "esbuild";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
    await createRuntimeManifestBundle(manifestPath, bundlePath);
    const moduleNamespace = (await import(
      `${pathToFileURL(bundlePath).href}?ts=${Date.now()}`
    )) as Record<string, unknown>;
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
              filter: /^@symphony\/core\/runtime-manifest$/
            },
            () => ({
              path: fileURLToPath(
                new URL("./authoring-shim.ts", import.meta.url)
              )
            })
          );
        }
      }
    ]
  });
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
