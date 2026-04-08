#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { spawn, execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

function parseArguments(argv) {
  const separatorIndex = argv.indexOf("--");
  const optionArgs =
    separatorIndex === -1 ? argv : argv.slice(0, separatorIndex);
  const commandArgs =
    separatorIndex === -1 ? [] : argv.slice(separatorIndex + 1);

  let label = "command";
  for (let index = 0; index < optionArgs.length; index += 1) {
    const value = optionArgs[index];
    if (value === "--label") {
      label = optionArgs[index + 1] ?? label;
      index += 1;
    }
  }

  if (commandArgs.length === 0) {
    throw new Error(
      'Usage: node scripts/monitor-command.mjs --label <name> -- <command> [args...]'
    );
  }

  return {
    label,
    commandArgs
  };
}

function sanitize(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/gu, "-");
}

function parsePsRows(stdout) {
  return stdout
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = line.match(
        /^(\d+)\s+(\d+)\s+([0-9.]+)\s+([0-9.]+)\s+(\d+)\s+(\S+)\s+(.*)$/u
      );

      if (!match) {
        return null;
      }

      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        cpuPercent: Number(match[3]),
        memPercent: Number(match[4]),
        rssKb: Number(match[5]),
        comm: match[6],
        args: match[7]
      };
    })
    .filter((row) => row !== null);
}

function collectDescendants(rows, rootPid) {
  const byParent = new Map();
  for (const row of rows) {
    const children = byParent.get(row.ppid) ?? [];
    children.push(row);
    byParent.set(row.ppid, children);
  }

  const pending = [rootPid];
  const descendants = new Set([rootPid]);

  while (pending.length > 0) {
    const current = pending.pop();
    const children = byParent.get(current) ?? [];
    for (const child of children) {
      if (!descendants.has(child.pid)) {
        descendants.add(child.pid);
        pending.push(child.pid);
      }
    }
  }

  return rows.filter((row) => descendants.has(row.pid));
}

function summarizeByCommand(samples) {
  const summary = new Map();

  for (const sample of samples) {
    for (const processInfo of sample.processes) {
      const key = processInfo.args;
      const existing =
        summary.get(key) ?? {
          args: key,
          comm: processInfo.comm,
          peakCpuPercent: 0,
          peakMemPercent: 0,
          peakRssKb: 0,
          sampleCount: 0
        };

      existing.peakCpuPercent = Math.max(existing.peakCpuPercent, processInfo.cpuPercent);
      existing.peakMemPercent = Math.max(existing.peakMemPercent, processInfo.memPercent);
      existing.peakRssKb = Math.max(existing.peakRssKb, processInfo.rssKb);
      existing.sampleCount += 1;
      summary.set(key, existing);
    }
  }

  return [...summary.values()].sort(
    (left, right) => right.peakCpuPercent - left.peakCpuPercent
  );
}

async function main() {
  const { label, commandArgs } = parseArguments(process.argv.slice(2));
  const child = spawn(commandArgs[0], commandArgs.slice(1), {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env
  });

  const startedAt = Date.now();
  const samples = [];
  let closeCode = null;

  child.once("close", (code) => {
    closeCode = code;
  });

  while (closeCode === null) {
    const { stdout } = await execFile("ps", [
      "-Ao",
      "pid,ppid,%cpu,%mem,rss,comm,args"
    ]);
    const rows = parsePsRows(stdout);
    const processes = collectDescendants(rows, child.pid);

    samples.push({
      timestamp: new Date().toISOString(),
      processes
    });

    if (closeCode === null) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  const endedAt = Date.now();
  const summary = summarizeByCommand(samples).slice(0, 20);
  const outputDirectory = path.join(
    process.cwd(),
    ".symphony",
    "metrics",
    "command-profiles"
  );

  await fs.mkdir(outputDirectory, {
    recursive: true
  });

  const outputPath = path.join(
    outputDirectory,
    `${sanitize(label)}-${new Date().toISOString().replace(/[:]/gu, "-")}.json`
  );

  await fs.writeFile(
    outputPath,
    JSON.stringify(
      {
        label,
        command: commandArgs,
        cwd: process.cwd(),
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date(endedAt).toISOString(),
        durationMs: endedAt - startedAt,
        exitCode: closeCode,
        topProcesses: summary,
        samples
      },
      null,
      2
    ),
    "utf8"
  );

  console.error(`Command profile written to ${outputPath}`);
  if (summary.length > 0) {
    console.error("Peak CPU by process:");
    for (const processInfo of summary.slice(0, 10)) {
      console.error(
        `- ${processInfo.peakCpuPercent.toFixed(1)}% ${processInfo.args}`
      );
    }
  }

  process.exit(closeCode ?? 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
