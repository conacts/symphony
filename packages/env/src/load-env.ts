import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

export type EnvLoadOptions = {
  cwd?: string;
  mode?: string;
  skipLocal?: boolean;
  strict?: boolean;
  quiet?: boolean;
};

const DEFAULT_MODE = "development";
const DEFAULT_QUIET = true;

function resolveCandidateFiles(mode: string, skipLocal: boolean): string[] {
  return [
    `.env.${mode}.local`,
    ...(skipLocal ? [] : [".env.local"]),
    `.env.${mode}`,
    ".env"
  ];
}

function resolveExistingFiles(cwd: string, files: readonly string[]): string[] {
  const loaded: string[] = [];

  for (const file of files) {
    const fullPath = path.join(cwd, file);
    if (!fs.existsSync(fullPath)) {
      continue;
    }

    loaded.push(fullPath);
  }

  return loaded;
}

function resolveLoadedValues(files: readonly string[], quiet: boolean): Record<string, string> {
  const loadedEnv: Record<string, string> = {};

  for (const filePath of [...files].reverse()) {
    // Keep env-file loading free of dotenvx's encryption/crypto runtime so serverless bundles
    // don't pull in the eciesjs/@noble graph during cold start.
    dotenv.config({
      override: true,
      path: filePath,
      processEnv: loadedEnv,
      quiet
    });
  }

  return loadedEnv;
}

export function loadEnv(options: EnvLoadOptions = {}): string[] {
  const mode = options.mode ?? process.env.NODE_ENV ?? DEFAULT_MODE;
  const cwd = options.cwd ?? process.cwd();
  const skipLocal = options.skipLocal || mode === "test";
  const files = resolveCandidateFiles(mode, skipLocal);
  const loaded = resolveExistingFiles(cwd, files);

  if (options.strict && loaded.length === 0) {
    throw new Error(
      `No env files found for mode "${mode}" in ${cwd}. Checked: ${files.join(", ")}`
    );
  }

  if (loaded.length > 0) {
    const loadedValues = resolveLoadedValues(loaded, options.quiet ?? DEFAULT_QUIET);
    for (const [key, value] of Object.entries(loadedValues)) {
      if (process.env[key] !== undefined) {
        continue;
      }
      process.env[key] = value;
    }
  }

  return loaded;
}
