#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execute } from "@oclif/core";

const binDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(binDir, "..", "..", "..");
const distCommandsDir = path.join(binDir, "..", "dist", "commands");
const workspaceMarkerPath = path.join(repoRoot, "pnpm-workspace.yaml");

const cliArgs = process.argv.slice(2);

if (shouldBootstrapBuiltCli(cliArgs) && !existsSync(distCommandsDir)) {
  ensureBuiltCli();
}

await execute({
  dir: import.meta.url,
  development: !existsSync(distCommandsDir)
});

function shouldBootstrapBuiltCli(args) {
  if (!existsSync(workspaceMarkerPath)) {
    return false;
  }

  if (args.length === 0) {
    return false;
  }

  const [firstArg] = args;
  return !["--help", "-h", "--version", "-v", "help"].includes(firstArg);
}

function ensureBuiltCli() {
  process.stderr.write(
    "Symphony CLI build outputs are missing; running `pnpm cli:build` once for this source checkout.\n"
  );

  runPnpmCommand(["--filter", "@symphony/cli...", "clean"]);
  runPnpmCommand(["cli:build"]);
}

function runPnpmCommand(args) {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
