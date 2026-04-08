#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const symphonyEnvFilePath = resolveSymphonyEnvFilePath();
const fileEnv = await loadEnvFile(symphonyEnvFilePath);
const baseEnv = {
  ...fileEnv,
  ...process.env,
  SYMPHONY_SOURCE_REPO: repoRoot,
  SYMPHONY_SOURCE_REPOS: "",
  SYMPHONY_DB_FILE:
    normalizeText(process.env.SYMPHONY_DB_FILE) ??
    path.join(repoRoot, "symphony.db")
};

const services = [
  {
    name: "@symphony/api",
    command: "pnpm",
    args: ["--dir", "apps/api", "start"],
    env: baseEnv
  },
  {
    name: "@symphony/web",
    command: "pnpm",
    args: ["--dir", "apps/web", "start"],
    env: baseEnv
  }
];

const children = new Map();
let shuttingDown = false;
let exitCode = 0;

for (const service of services) {
  const child = spawn(service.command, service.args, {
    cwd: process.cwd(),
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
