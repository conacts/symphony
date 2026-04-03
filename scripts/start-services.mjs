#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";

const services = [
  {
    name: "@symphony/api",
    command: "pnpm",
    args: ["--dir", "apps/api", "start"]
  },
  {
    name: "@symphony/web",
    command: "pnpm",
    args: ["--dir", "apps/web", "start"]
  }
];

const children = new Map();
let shuttingDown = false;
let exitCode = 0;

for (const service of services) {
  const child = spawn(service.command, service.args, {
    cwd: process.cwd(),
    env: process.env,
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
