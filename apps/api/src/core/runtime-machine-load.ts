import { statfsSync } from "node:fs";
import os from "node:os";
import type {
  SymphonyRuntimeMachineLoadSnapshot
} from "@symphony/contracts";
import type { SymphonyRuntimeMachineLoadSummary } from "@symphony/db";

const DEFAULT_MACHINE_LOAD_INTERVAL_MS = 15_000;
const HIGH_CPU_PERCENT = 85;
const HIGH_MEMORY_PERCENT = 80;
const HIGH_DISK_PERCENT = 85;

type CpuSnapshot = {
  idle: number;
  total: number;
};

type ActiveRunMachineLoad = {
  sampleCount: number;
  cpuSampleCount: number;
  diskSampleCount: number;
  cpuPercentSum: number;
  memoryPercentSum: number;
  diskPercentSum: number;
  maxCpuPercent: number | null;
  maxMemoryPercent: number;
  maxDiskPercent: number | null;
  hadHighCpu: boolean;
  hadHighMemory: boolean;
  hadHighDisk: boolean;
  lastCapturedAt: string | null;
};

export type RuntimeMachineLoadMonitor = {
  start(): void;
  stop(): void;
  snapshot(): SymphonyRuntimeMachineLoadSnapshot | null;
  startRun(runId: string): void;
  finalizeRun(runId: string): SymphonyRuntimeMachineLoadSummary | null;
};

export function createRuntimeMachineLoadMonitor(input: {
  samplePath: string;
  intervalMs?: number;
  now?: () => Date;
}): RuntimeMachineLoadMonitor {
  return new DefaultRuntimeMachineLoadMonitor(input);
}

class DefaultRuntimeMachineLoadMonitor implements RuntimeMachineLoadMonitor {
  readonly #samplePath: string;
  readonly #intervalMs: number;
  readonly #now: () => Date;
  readonly #activeRuns = new Map<string, ActiveRunMachineLoad>();
  #timer: ReturnType<typeof setInterval> | null = null;
  #latestSnapshot: SymphonyRuntimeMachineLoadSnapshot | null = null;
  #previousCpuSnapshot: CpuSnapshot | null = null;

  constructor(input: {
    samplePath: string;
    intervalMs?: number;
    now?: () => Date;
  }) {
    this.#samplePath = input.samplePath;
    this.#intervalMs = Math.max(5_000, input.intervalMs ?? DEFAULT_MACHINE_LOAD_INTERVAL_MS);
    this.#now = input.now ?? (() => new Date());
  }

  start(): void {
    if (this.#timer) {
      return;
    }

    this.#recordSample();
    this.#timer = setInterval(() => {
      this.#recordSample();
    }, this.#intervalMs);
    this.#timer.unref?.();
  }

  stop(): void {
    if (!this.#timer) {
      return;
    }

    clearInterval(this.#timer);
    this.#timer = null;
  }

  snapshot(): SymphonyRuntimeMachineLoadSnapshot | null {
    return this.#latestSnapshot;
  }

  startRun(runId: string): void {
    const state = createActiveRunMachineLoad();
    this.#activeRuns.set(runId, state);
    const snapshot = this.#captureSnapshot();

    if (snapshot) {
      this.#latestSnapshot = snapshot;
      applySnapshotToRun(state, snapshot);
    }
  }

  finalizeRun(runId: string): SymphonyRuntimeMachineLoadSummary | null {
    const state = this.#activeRuns.get(runId);

    if (!state) {
      return null;
    }

    const snapshot = this.#captureSnapshot();

    if (snapshot) {
      this.#latestSnapshot = snapshot;
      applySnapshotToRun(state, snapshot);
    }

    this.#activeRuns.delete(runId);

    return state.sampleCount > 0
      ? {
          sampleCount: state.sampleCount,
          maxCpuPercent: state.maxCpuPercent,
          avgCpuPercent:
            state.cpuSampleCount > 0
              ? Math.round(state.cpuPercentSum / state.cpuSampleCount)
              : null,
          maxMemoryPercent: state.maxMemoryPercent,
          avgMemoryPercent: Math.round(state.memoryPercentSum / state.sampleCount),
          maxDiskPercent: state.maxDiskPercent,
          avgDiskPercent:
            state.diskSampleCount > 0
              ? Math.round(state.diskPercentSum / state.diskSampleCount)
              : null,
          hadHighCpu: state.hadHighCpu,
          hadHighMemory: state.hadHighMemory,
          hadHighDisk: state.hadHighDisk
        }
      : null;
  }

  #recordSample(): void {
    const snapshot = this.#captureSnapshot();

    if (!snapshot) {
      return;
    }

    this.#latestSnapshot = snapshot;

    for (const activeRun of this.#activeRuns.values()) {
      applySnapshotToRun(activeRun, snapshot);
    }
  }

  #captureSnapshot(): SymphonyRuntimeMachineLoadSnapshot | null {
    const capturedAt = this.#now().toISOString();
    const memoryTotalBytes = os.totalmem();
    const memoryUsedBytes = Math.max(0, memoryTotalBytes - os.freemem());
    const memoryPercent =
      memoryTotalBytes > 0
        ? Math.round((memoryUsedBytes / memoryTotalBytes) * 100)
        : 0;
    const diskUsage = readDiskUsage(this.#samplePath);

    const currentCpuSnapshot = readCpuSnapshot();
    const cpuPercent = readCpuPercent(this.#previousCpuSnapshot, currentCpuSnapshot);
    this.#previousCpuSnapshot = currentCpuSnapshot;

    return {
      capturedAt,
      cpuPercent,
      memoryUsedBytes,
      memoryTotalBytes,
      memoryPercent,
      diskUsedBytes: diskUsage?.usedBytes ?? null,
      diskTotalBytes: diskUsage?.totalBytes ?? null,
      diskPercent: diskUsage?.percent ?? null,
      samplePath: this.#samplePath
    };
  }
}

function createActiveRunMachineLoad(): ActiveRunMachineLoad {
  return {
    sampleCount: 0,
    cpuSampleCount: 0,
    diskSampleCount: 0,
    cpuPercentSum: 0,
    memoryPercentSum: 0,
    diskPercentSum: 0,
    maxCpuPercent: null,
    maxMemoryPercent: 0,
    maxDiskPercent: null,
    hadHighCpu: false,
    hadHighMemory: false,
    hadHighDisk: false,
    lastCapturedAt: null
  };
}

function applySnapshotToRun(
  state: ActiveRunMachineLoad,
  snapshot: SymphonyRuntimeMachineLoadSnapshot
): void {
  if (state.lastCapturedAt === snapshot.capturedAt) {
    return;
  }

  state.sampleCount += 1;
  state.memoryPercentSum += snapshot.memoryPercent;
  state.maxMemoryPercent = Math.max(state.maxMemoryPercent, snapshot.memoryPercent);
  state.hadHighMemory ||= snapshot.memoryPercent >= HIGH_MEMORY_PERCENT;

  if (typeof snapshot.cpuPercent === "number") {
    state.cpuSampleCount += 1;
    state.cpuPercentSum += snapshot.cpuPercent;
    state.maxCpuPercent = Math.max(state.maxCpuPercent ?? 0, snapshot.cpuPercent);
    state.hadHighCpu ||= snapshot.cpuPercent >= HIGH_CPU_PERCENT;
  }

  if (typeof snapshot.diskPercent === "number") {
    state.diskSampleCount += 1;
    state.diskPercentSum += snapshot.diskPercent;
    state.maxDiskPercent = Math.max(state.maxDiskPercent ?? 0, snapshot.diskPercent);
    state.hadHighDisk ||= snapshot.diskPercent >= HIGH_DISK_PERCENT;
  }

  state.lastCapturedAt = snapshot.capturedAt;
}

function readCpuPercent(
  previousSnapshot: CpuSnapshot | null,
  currentSnapshot: CpuSnapshot
): number | null {
  if (!previousSnapshot) {
    return null;
  }

  const totalDelta = currentSnapshot.total - previousSnapshot.total;
  const idleDelta = currentSnapshot.idle - previousSnapshot.idle;

  if (totalDelta <= 0) {
    return null;
  }

  const busyPercent = ((totalDelta - idleDelta) / totalDelta) * 100;
  return Math.max(0, Math.min(100, Math.round(busyPercent)));
}

function readCpuSnapshot(): CpuSnapshot {
  const cpus = os.cpus();

  return cpus.reduce<CpuSnapshot>(
    (snapshot, cpu) => {
      const total =
        cpu.times.user +
        cpu.times.nice +
        cpu.times.sys +
        cpu.times.irq +
        cpu.times.idle;

      snapshot.idle += cpu.times.idle;
      snapshot.total += total;
      return snapshot;
    },
    {
      idle: 0,
      total: 0
    }
  );
}

function readDiskUsage(samplePath: string): {
  usedBytes: number;
  totalBytes: number;
  percent: number;
} | null {
  try {
    const stats = statfsSync(samplePath);
    const totalBytes = Number(stats.blocks) * Number(stats.bsize);
    const freeBytes = Number(stats.bfree) * Number(stats.bsize);

    if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
      return null;
    }

    const usedBytes = Math.max(0, totalBytes - Math.max(0, freeBytes));
    return {
      usedBytes,
      totalBytes,
      percent: Math.max(0, Math.min(100, Math.round((usedBytes / totalBytes) * 100)))
    };
  } catch {
    return null;
  }
}
