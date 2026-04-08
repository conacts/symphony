import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import type {
  AgentCommandResourceProcessSummary,
  AgentCommandResourceProfile,
  AgentCommandResourceSample
} from "@symphony/agent-analytics";
import { extractItemEvent, type ThreadEvent } from "@symphony/agent-analytics";

const execFile = promisify(execFileCallback);
const sampleIntervalMs = 1_000;
const topProcessCount = 5;

type ProcessRow = {
  pid: number;
  ppid: number;
  cpuPercent: number;
  memPercent: number;
  rssKb: number;
  executable: string | null;
  command: string;
};

type ActiveCommandProfile = {
  itemId: string;
  samples: AgentCommandResourceSample[];
};

type CompletedCommandProfile = {
  itemId: string;
  profile: AgentCommandResourceProfile;
};

export class CommandResourceMonitor {
  #rootPid: number | null;
  #activeProfiles = new Map<string, ActiveCommandProfile>();
  #sampler: ReturnType<typeof setInterval> | null = null;
  #sampleInFlight: Promise<void> | null = null;

  constructor(rootPid: string | null | undefined) {
    const parsed = Number(rootPid);
    this.#rootPid = Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  async observe(event: ThreadEvent, recordedAt: string): Promise<CompletedCommandProfile[]> {
    const itemEvent = extractItemEvent(event);
    if (!itemEvent || itemEvent.item.type !== "command_execution") {
      return [];
    }

    const itemId = itemEvent.item.id;
    const completedProfiles: CompletedCommandProfile[] = [];

    if (itemEvent.type === "item.started") {
      this.#activeProfiles.set(itemId, {
        itemId,
        samples: []
      });
      await this.#collectSample(recordedAt);
      this.#ensureSampler();
      return completedProfiles;
    }

    if (!this.#activeProfiles.has(itemId)) {
      return completedProfiles;
    }

    await this.#collectSample(recordedAt);

    if (itemEvent.type === "item.completed") {
      const activeProfile = this.#activeProfiles.get(itemId);
      if (activeProfile) {
        completedProfiles.push({
          itemId,
          profile: buildResourceProfile(activeProfile.samples)
        });
      }
      this.#activeProfiles.delete(itemId);
      this.#stopSamplerIfIdle();
    }

    return completedProfiles;
  }

  async flush(): Promise<CompletedCommandProfile[]> {
    if (this.#sampleInFlight) {
      await this.#sampleInFlight;
    }

    const flushedProfiles = [...this.#activeProfiles.values()].map((profile) => ({
      itemId: profile.itemId,
      profile: buildResourceProfile(profile.samples)
    }));

    this.#activeProfiles.clear();
    this.#stopSamplerIfIdle();
    return flushedProfiles;
  }

  #ensureSampler(): void {
    if (this.#sampler || this.#rootPid === null) {
      return;
    }

    this.#sampler = setInterval(() => {
      void this.#collectSample(new Date().toISOString());
    }, sampleIntervalMs);
    this.#sampler.unref?.();
  }

  #stopSamplerIfIdle(): void {
    if (this.#activeProfiles.size > 0) {
      return;
    }

    if (this.#sampler) {
      clearInterval(this.#sampler);
      this.#sampler = null;
    }
  }

  async #collectSample(recordedAt: string): Promise<void> {
    const rootPid = this.#rootPid;
    if (rootPid === null || this.#activeProfiles.size === 0) {
      return;
    }

    if (this.#sampleInFlight) {
      await this.#sampleInFlight;
      return;
    }

    this.#sampleInFlight = (async () => {
      const sample = await captureProcessSample(rootPid, recordedAt);
      if (!sample) {
        return;
      }

      for (const profile of this.#activeProfiles.values()) {
        profile.samples.push(sample);
      }
    })();

    try {
      await this.#sampleInFlight;
    } finally {
      this.#sampleInFlight = null;
    }
  }
}

async function captureProcessSample(
  rootPid: number,
  recordedAt: string
): Promise<AgentCommandResourceSample | null> {
  let stdout: string;
  try {
    ({ stdout } = await execFile("ps", [
      "-Ao",
      "pid,ppid,%cpu,%mem,rss,comm,args"
    ]));
  } catch {
    return null;
  }
  const rows = parseProcessRows(stdout);
  const processes = collectDescendants(rows, rootPid);
  if (processes.length === 0) {
    return null;
  }

  const topProcesses = summarizeProcesses(processes).slice(0, topProcessCount);

  return {
    recordedAt,
    processCount: processes.length,
    totalCpuPercent: roundToTenths(
      processes.reduce((total, process) => total + process.cpuPercent, 0)
    ),
    totalMemPercent: roundToTenths(
      processes.reduce((total, process) => total + process.memPercent, 0)
    ),
    totalRssKb: Math.max(
      0,
      Math.round(processes.reduce((total, process) => total + process.rssKb, 0))
    ),
    topProcesses
  };
}

function parseProcessRows(stdout: string): ProcessRow[] {
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
        executable: normalizeString(match[6]),
        command: normalizeCommand(match[7])
      } satisfies ProcessRow;
    })
    .filter((row): row is ProcessRow => row !== null);
}

function collectDescendants(rows: ProcessRow[], rootPid: number): ProcessRow[] {
  const byParent = new Map<number, ProcessRow[]>();
  for (const row of rows) {
    const children = byParent.get(row.ppid) ?? [];
    children.push(row);
    byParent.set(row.ppid, children);
  }

  const pending = [rootPid];
  const descendantIds = new Set([rootPid]);

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) {
      continue;
    }

    const children = byParent.get(current) ?? [];
    for (const child of children) {
      if (descendantIds.has(child.pid)) {
        continue;
      }

      descendantIds.add(child.pid);
      pending.push(child.pid);
    }
  }

  return rows.filter((row) => descendantIds.has(row.pid));
}

function summarizeProcesses(
  rows: ProcessRow[]
): AgentCommandResourceProcessSummary[] {
  const summary = new Map<string, AgentCommandResourceProcessSummary>();

  for (const row of rows) {
    const key = `${row.executable ?? ""}\u0000${row.command}`;
    const existing = summary.get(key) ?? {
      command: row.command,
      executable: row.executable,
      peakCpuPercent: 0,
      peakMemPercent: 0,
      peakRssKb: 0,
      sampleCount: 0
    };

    existing.peakCpuPercent = Math.max(existing.peakCpuPercent, roundToTenths(row.cpuPercent));
    existing.peakMemPercent = Math.max(existing.peakMemPercent, roundToTenths(row.memPercent));
    existing.peakRssKb = Math.max(existing.peakRssKb, Math.max(0, Math.round(row.rssKb)));
    existing.sampleCount += 1;
    summary.set(key, existing);
  }

  return [...summary.values()].sort(
    (left, right) => right.peakCpuPercent - left.peakCpuPercent
  );
}

function buildResourceProfile(
  samples: AgentCommandResourceSample[]
): AgentCommandResourceProfile {
  const topProcesses = summarizeProcesses(
    samples.flatMap((sample) =>
      sample.topProcesses.map((process) => ({
        pid: 0,
        ppid: 0,
        cpuPercent: process.peakCpuPercent,
        memPercent: process.peakMemPercent,
        rssKb: process.peakRssKb,
        executable: process.executable,
        command: process.command
      }))
    )
  ).slice(0, topProcessCount);

  return {
    captureScope: "session_process_tree",
    samplingIntervalMs: sampleIntervalMs,
    firstSampledAt: samples[0]?.recordedAt ?? null,
    lastSampledAt: samples.at(-1)?.recordedAt ?? null,
    sampleCount: samples.length,
    peakCpuPercent: roundToTenths(
      samples.reduce((peak, sample) => Math.max(peak, sample.totalCpuPercent), 0)
    ),
    peakMemPercent: roundToTenths(
      samples.reduce((peak, sample) => Math.max(peak, sample.totalMemPercent), 0)
    ),
    peakRssKb: samples.reduce(
      (peak, sample) => Math.max(peak, sample.totalRssKb),
      0
    ),
    peakProcessCount: samples.reduce(
      (peak, sample) => Math.max(peak, sample.processCount),
      0
    ),
    topProcesses,
    samples
  };
}

function normalizeString(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCommand(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "<unknown-command>";
}

function roundToTenths(value: number): number {
  return Math.round(value * 10) / 10;
}
