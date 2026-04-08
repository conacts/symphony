#!/usr/bin/env node

import { spawn } from "node:child_process";

function normalizeArgs(argv) {
  const args = [...argv];
  if (args[0] === "--") {
    args.shift();
  }

  if (args.length === 0) {
    return ["--run"];
  }

  return args;
}

const args = normalizeArgs(process.argv.slice(2));
const child = spawn("vitest", args, {
  cwd: process.cwd(),
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32"
});

child.once("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
