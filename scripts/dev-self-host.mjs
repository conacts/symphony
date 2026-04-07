#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
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
  ...process.env,
  SYMPHONY_SOURCE_REPO: repoRoot,
  SYMPHONY_DB_FILE:
    normalizeText(process.env.SYMPHONY_DB_FILE) ??
    path.join(repoRoot, "symphony.db"),
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

await runPreflight();

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

  runServices(services);
});

async function runPreflight() {
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

  await ensureHostLinearCli();
  await ensureDockerImage();
}

function normalizeText(value) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
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

async function ensureDockerImage() {
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

async function ensureHostLinearCli() {
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

function runServices(definitions) {
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
