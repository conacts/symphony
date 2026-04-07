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

const buildArgs = [
  "exec",
  "turbo",
  "run",
  "build",
  "--filter=@symphony/api^...",
  "--filter=@symphony/web^..."
];
const build = spawn("pnpm", buildArgs, {
  cwd: repoRoot,
  env: baseEnv,
  stdio: "inherit"
});

build.on("exit", (code, signal) => {
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
