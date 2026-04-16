#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}

async function main() {
  const repoRoot = process.cwd();
  const symphonyEnvFilePath = resolveSymphonyEnvFilePath();
  const fileEnv = await loadEnvFile(symphonyEnvFilePath);
  const apiPort = normalizePort(process.env.PORT, 4_400);
  const dashboardPort = normalizePort(
    process.env.SYMPHONY_DASHBOARD_PORT,
    3_000
  );
  const runtimeBaseUrl =
    normalizeText(process.env.SYMPHONY_RUNTIME_BASE_URL) ??
    `http://127.0.0.1:${apiPort}`;
  const dockerImage =
    normalizeText(process.env.SYMPHONY_DOCKER_WORKSPACE_IMAGE) ??
    "symphony/workspace-runner:local";
  const baseEnv = {
    ...fileEnv,
    ...process.env,
    SYMPHONY_SOURCE_REPO: repoRoot,
    SYMPHONY_SOURCE_REPOS: "",
    SYMPHONY_DB_FILE:
      normalizeText(process.env.SYMPHONY_DB_FILE) ??
      path.join(repoRoot, ".symphony", "runtime", "symphony.db"),
    SYMPHONY_RUNTIME_BASE_URL: runtimeBaseUrl,
    NEXT_PUBLIC_SYMPHONY_RUNTIME_BASE_URL:
      normalizeText(process.env.NEXT_PUBLIC_SYMPHONY_RUNTIME_BASE_URL) ??
      runtimeBaseUrl
  };
  const requiredEnvKeys = ["LINEAR_API_KEY"];
  const recommendedEnvKeys = ["GITHUB_TOKEN"];
  const services = [
    {
      name: "@symphony/api",
      command: "pnpm",
      args: ["--dir", "apps/api", "dev"],
      env: {
        ...baseEnv,
        NODE_ENV: normalizeText(process.env.NODE_ENV) ?? "development",
        PORT: String(apiPort)
      }
    },
    {
      name: "@symphony/web",
      command: "pnpm",
      args: ["--dir", "apps/web", "dev"],
      env: {
        ...baseEnv,
        NODE_ENV: normalizeText(process.env.NODE_ENV) ?? "development",
        PORT: String(dashboardPort)
      }
    }
  ];

  await runPreflight({
    baseEnv,
    requiredEnvKeys,
    recommendedEnvKeys,
    repoRoot,
    dockerImage
  });

  const serviceBuild = spawn(
    "pnpm",
    [
      "exec",
      "turbo",
      "run",
      "build",
      "--filter=@symphony/api^...",
      "--filter=@symphony/web^..."
    ],
    {
      cwd: repoRoot,
      env: baseEnv,
      stdio: "inherit"
    }
  );

  serviceBuild.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    if ((code ?? 0) !== 0) {
      process.exit(code ?? 1);
      return;
    }

    runServices(services, repoRoot);
  });
}

async function runPreflight(input) {
  const { baseEnv, requiredEnvKeys, recommendedEnvKeys, repoRoot, dockerImage } = input;
  const missingRequired = requiredEnvKeys.filter(
    (key) => normalizeText(baseEnv[key]) === null
  );

  if (missingRequired.length > 0) {
    const envFilePath = path.join(
      process.env.HOME ?? "~",
      ".config/symphony/symphony.env"
    );
    process.stderr.write(
      `Missing required environment variables: ${missingRequired.join(", ")}.\n` +
        `Set them in the shell or ${envFilePath} before running dev:host.\n`
    );
    process.exit(1);
  }

  const missingRecommended = recommendedEnvKeys.filter(
    (key) => normalizeText(baseEnv[key]) === null
  );

  if (missingRecommended.length > 0) {
    process.stdout.write(
      `Continuing without optional environment variables: ${missingRecommended.join(", ")}.\n`
    );
  }

  await ensureHostLinearCli({ baseEnv, repoRoot });
  await ensureDockerImage({ baseEnv, repoRoot, dockerImage });
}

function normalizeText(value) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function resolveSymphonyEnvFilePath() {
  return (
    normalizeText(process.env.SYMPHONY_ENV_FILE) ??
    path.join(process.env.HOME ?? "~", ".config/symphony/symphony.env")
  );
}

async function loadEnvFile(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    return parseEnvFile(raw);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

function parseEnvFile(raw) {
  const values = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    const normalized = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trim()
      : trimmed;

    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalized.slice(0, separatorIndex).trim();
    if (key.length === 0) {
      continue;
    }

    let value = normalized.slice(separatorIndex + 1).trimStart();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function normalizePort(value, fallback) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return fallback;
  }

  const parsed = Number.parseInt(normalized, 10);

  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65_535) {
    return fallback;
  }

  return parsed;
}

async function ensureDockerImage(input) {
  const { baseEnv, repoRoot, dockerImage } = input;
  process.stdout.write(
    `Refreshing workspace runner image ${dockerImage} with Docker layer cache.\n`
  );
  const buildExitCode = await runCommand(
    "pnpm",
    ["docker:workspace-image:build"],
    {
      cwd: repoRoot,
      env: baseEnv,
      stdio: "inherit"
    }
  );

  if (buildExitCode !== 0) {
    process.exit(buildExitCode);
  }
}

async function ensureHostLinearCli(input) {
  const { baseEnv, repoRoot } = input;
  const linearCliExitCode = await runCommand("lin", ["--help"], {
    cwd: repoRoot,
    env: baseEnv,
    stdio: "ignore"
  });

  if (linearCliExitCode === 0) {
    return;
  }

  process.stdout.write(
    "Installing Linear CLI on the host because `lin` is not available.\n"
  );

  const installExitCode = await runCommand(
    "npm",
    ["install", "-g", "@linear/cli@0.0.5"],
    {
      cwd: repoRoot,
      env: baseEnv,
      stdio: "inherit"
    }
  );

  if (installExitCode !== 0) {
    process.exit(installExitCode);
  }
}

function runServices(definitions, repoRoot) {
  const children = new Map();
  let shuttingDown = false;
  let exitCode = 0;

  for (const service of definitions) {
    const child = spawn(service.command, service.args, {
      cwd: repoRoot,
      env: service.env,
      stdio: "inherit"
    });

    children.set(service.name, child);
    child.on("exit", (code, signal) => {
      children.delete(service.name);

      if (shuttingDown) {
        if (children.size === 0) {
          process.exit(exitCode);
        }
        return;
      }

      exitCode = code ?? (signal ? 1 : 0);
      shuttingDown = true;

      for (const otherChild of children.values()) {
        otherChild.kill("SIGINT");
      }
    });
  }

  function shutdown(signal) {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    exitCode = 0;

    for (const child of children.values()) {
      child.kill(signal);
    }
  }

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

function runCommand(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, options);
    child.on("exit", (code, signal) => {
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}

export {
  loadEnvFile,
  parseEnvFile,
  resolveSymphonyEnvFilePath
};
