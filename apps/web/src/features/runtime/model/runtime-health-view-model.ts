import type {
  SymphonyRuntimeHealthResult,
  SymphonyRuntimeLogsResult
} from "@symphony/contracts";
import {
  formatBytes,
  formatCount,
  formatEventTypeLabel,
  formatSourceLabel,
  formatStatusLabel,
  formatTimestamp,
  formatWholePercent
} from "@/core/display-formatters";

export type RuntimeHealthViewModel = {
  summaryCards: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
  incidentCards: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
  machineLoadCards: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
  machineLoadChartRows: Array<{
    label: string;
    value: number;
    valueLabel: string;
    threshold: number;
    status: "healthy" | "warning" | "critical" | "unknown";
    detail: string;
    capturedAt: string | null;
    samplePath: string | null;
  }>;
  signalRows: Array<{
    label: string;
    value: string;
    detail: string;
  }>;
  heartbeatRows: Array<{
    label: string;
    value: string;
  }>;
  storageRows: Array<{
    label: string;
    value: string;
  }>;
  logLevelChartRows: Array<{
    label: "Errors" | "Warnings" | "Info" | "Debug";
    count: number;
    fill: string;
  }>;
  recentEventRows: Array<{
    entryId: string;
    level: "debug" | "info" | "warn" | "error";
    source: string;
    eventType: string;
    recordedAt: string;
    message: string;
    scopeLabel: string;
    detail: string;
  }>;
};

export function buildRuntimeHealthViewModel(
  input: SymphonyRuntimeHealthResult,
  runtimeLogs: SymphonyRuntimeLogsResult | null,
  now: Date = new Date()
): RuntimeHealthViewModel {
  const lastCycleMs = getLastCycleMs(
    input.poller.lastStartedAt,
    input.poller.lastCompletedAt
  );
  const lastSuccessAgeMs = getAgeMs(input.poller.lastSucceededAt, now);
  const recentLogs = sortLogs(runtimeLogs);
  const recentWarnings = recentLogs.filter((entry) => entry.level === "warn");
  const recentErrors = recentLogs.filter((entry) => entry.level === "error");
  const latestAlert = recentErrors[0] ?? recentWarnings[0] ?? null;
  const loudestSource = buildLoudestSourceLabel(recentLogs);
  const machineLoad = input.machineLoad;

  return {
    summaryCards: [
      {
        label: "Overall",
        value: input.healthy ? "Healthy" : "Degraded",
        detail: "Combined database and scheduler health from the active runtime."
      },
      {
        label: "Recent alerts",
        value: formatCount(recentWarnings.length + recentErrors.length),
        detail:
          recentLogs.length === 0
            ? "No runtime events have been captured yet."
            : `Warnings ${formatCount(recentWarnings.length)} · Errors ${formatCount(recentErrors.length)} from the latest ${formatCount(recentLogs.length)} events.`
      },
      {
        label: "Poller",
        value: input.poller.running ? "Running" : "Stopped",
        detail: `Interval ${input.poller.intervalMs}ms`
      },
      {
        label: "Last cycle",
        value: formatElapsedMs(lastCycleMs),
        detail: input.poller.inFlight
          ? "A scheduler cycle is currently in flight."
          : "Duration of the most recent scheduler cycle."
      },
      {
        label: "Last success age",
        value: formatElapsedMs(lastSuccessAgeMs),
        detail: "Time since the last successful scheduler completion."
      }
    ],
    incidentCards: [
      {
        label: "Poller error state",
        value: input.poller.lastError ? "Active" : "Clear",
        detail: input.poller.lastError ?? "No scheduler error is currently recorded."
      },
      {
        label: "Latest alert",
        value: latestAlert ? formatEventTypeLabel(latestAlert.eventType) : "Clear",
        detail: latestAlert
          ? `${formatSourceLabel(latestAlert.source)} · ${formatTimestamp(latestAlert.recordedAt)}`
          : "No warning or error event is present in the recent runtime log sample."
      },
      {
        label: "Loudest source",
        value: loudestSource.label,
        detail: loudestSource.detail
      }
    ],
    machineLoadCards: [
      {
        label: "CPU load",
        value: formatWholePercent(machineLoad?.cpuPercent),
        detail: machineLoad
          ? `Host sample from ${formatTimestamp(machineLoad.capturedAt)}.`
          : "Machine load sampling has not produced a host snapshot yet."
      },
      {
        label: "Memory load",
        value: machineLoad ? formatWholePercent(machineLoad.memoryPercent) : "n/a",
        detail: machineLoad
          ? `${formatBytes(machineLoad.memoryUsedBytes)} used of ${formatBytes(
              machineLoad.memoryTotalBytes
            )}.`
          : "Machine load sampling has not produced a host snapshot yet."
      },
      {
        label: "Disk load",
        value: formatWholePercent(machineLoad?.diskPercent),
        detail: machineLoad
          ? `${formatBytes(machineLoad.diskUsedBytes)} used of ${formatBytes(
              machineLoad.diskTotalBytes
            )}.`
          : "Machine load sampling has not produced a host snapshot yet."
      }
    ],
    machineLoadChartRows: buildMachineLoadChartRows(machineLoad),
    signalRows: [
      {
        label: "Database readiness",
        value: input.db.ready ? "Ready" : "Down",
        detail: "Whether the runtime can currently reach its SQLite backing store."
      },
      {
        label: "Poller state",
        value: input.poller.running ? "Running" : "Stopped",
        detail: input.poller.inFlight
          ? "The scheduler is actively polling right now."
          : "The scheduler is idle between polling cycles."
      },
      {
        label: "Last success age",
        value: formatElapsedMs(lastSuccessAgeMs),
        detail: "Time since the last successful poller completion."
      },
      {
        label: "Last error",
        value: input.poller.lastError ? "Present" : "Clear",
        detail: input.poller.lastError ?? "No poller error recorded."
      },
      {
        label: "CPU load",
        value: formatWholePercent(machineLoad?.cpuPercent),
        detail: "Current sampled host CPU utilization."
      },
      {
        label: "Memory load",
        value: machineLoad ? formatWholePercent(machineLoad.memoryPercent) : "n/a",
        detail: machineLoad
          ? `${formatBytes(machineLoad.memoryUsedBytes)} in use.`
          : "Current sampled host memory utilization."
      },
      {
        label: "Disk load",
        value: formatWholePercent(machineLoad?.diskPercent),
        detail: machineLoad?.samplePath
          ? `Filesystem pressure for ${machineLoad.samplePath}.`
          : "Current sampled workspace filesystem utilization."
      }
    ],
    heartbeatRows: [
      {
        label: "Last started",
        value: formatTimestamp(input.poller.lastStartedAt)
      },
      {
        label: "Last completed",
        value: formatTimestamp(input.poller.lastCompletedAt)
      },
      {
        label: "Last succeeded",
        value: formatTimestamp(input.poller.lastSucceededAt)
      },
      {
        label: "Cycle duration",
        value: formatElapsedMs(lastCycleMs)
      }
    ],
    storageRows: [
      {
        label: "Database file",
        value: input.db.file
      },
      {
        label: "Database readiness",
        value: formatStatusLabel(input.db.ready ? "ready" : "down")
      },
      {
        label: "Poll interval",
        value: `${input.poller.intervalMs}ms`
      },
      {
        label: "Recent event sample",
        value: formatCount(recentLogs.length)
      },
      {
        label: "Load sample path",
        value: machineLoad?.samplePath ?? "n/a"
      }
    ],
    logLevelChartRows: [
      {
        label: "Errors",
        count: recentErrors.length,
        fill: "var(--chart-5)"
      },
      {
        label: "Warnings",
        count: recentWarnings.length,
        fill: "var(--chart-4)"
      },
      {
        label: "Info",
        count: recentLogs.filter((entry) => entry.level === "info").length,
        fill: "var(--chart-2)"
      },
      {
        label: "Debug",
        count: recentLogs.filter((entry) => entry.level === "debug").length,
        fill: "var(--chart-1)"
      }
    ],
    recentEventRows: recentLogs.map((entry) => ({
      entryId: entry.entryId,
      level: entry.level,
      source: formatSourceLabel(entry.source),
      eventType: formatEventTypeLabel(entry.eventType),
      recordedAt: formatTimestamp(entry.recordedAt),
      message: entry.message,
      scopeLabel: buildScopeLabel(entry),
      detail: formatRuntimeEventPayload(entry.payload)
    }))
  };
}

function sortLogs(runtimeLogs: SymphonyRuntimeLogsResult | null) {
  return [...(runtimeLogs?.logs ?? [])].sort(
    (left, right) =>
      Date.parse(right.recordedAt) - Date.parse(left.recordedAt)
  );
}

function buildMachineLoadChartRows(
  machineLoad: SymphonyRuntimeHealthResult["machineLoad"]
): RuntimeHealthViewModel["machineLoadChartRows"] {
  const cpuThreshold = 80;
  const memoryThreshold = 85;
  const diskThreshold = 90;

  if (!machineLoad) {
    return [
      {
        label: "CPU",
        value: 0,
        valueLabel: "n/a",
        threshold: cpuThreshold,
        status: "unknown",
        detail: "No CPU sample captured yet.",
        capturedAt: null,
        samplePath: null
      },
      {
        label: "Memory",
        value: 0,
        valueLabel: "n/a",
        threshold: memoryThreshold,
        status: "unknown",
        detail: "No memory sample captured yet.",
        capturedAt: null,
        samplePath: null
      },
      {
        label: "Disk",
        value: 0,
        valueLabel: "n/a",
        threshold: diskThreshold,
        status: "unknown",
        detail: "No disk sample captured yet.",
        capturedAt: null,
        samplePath: null
      }
    ];
  }

  return [
    {
      label: "CPU",
      value: machineLoad.cpuPercent ?? 0,
      valueLabel: formatWholePercent(machineLoad.cpuPercent),
      threshold: cpuThreshold,
      status: getLoadStatus(machineLoad.cpuPercent, cpuThreshold),
      detail: `Host sample captured at ${formatTimestamp(machineLoad.capturedAt)}.`,
      capturedAt: machineLoad.capturedAt,
      samplePath: machineLoad.samplePath
    },
    {
      label: "Memory",
      value: machineLoad.memoryPercent,
      valueLabel: formatWholePercent(machineLoad.memoryPercent),
      threshold: memoryThreshold,
      status: getLoadStatus(machineLoad.memoryPercent, memoryThreshold),
      detail: `${formatBytes(machineLoad.memoryUsedBytes)} used of ${formatBytes(
        machineLoad.memoryTotalBytes
      )}.`,
      capturedAt: machineLoad.capturedAt,
      samplePath: machineLoad.samplePath
    },
    {
      label: "Disk",
      value: machineLoad.diskPercent ?? 0,
      valueLabel: formatWholePercent(machineLoad.diskPercent),
      threshold: diskThreshold,
      status: getLoadStatus(machineLoad.diskPercent, diskThreshold),
      detail: machineLoad.samplePath
        ? `Filesystem sample for ${machineLoad.samplePath}.`
        : "Workspace filesystem sample was not available.",
      capturedAt: machineLoad.capturedAt,
      samplePath: machineLoad.samplePath
    }
  ];
}

function getLoadStatus(
  value: number | null | undefined,
  threshold: number
): "healthy" | "warning" | "critical" | "unknown" {
  if (value === null || value === undefined) {
    return "unknown";
  }

  if (value >= threshold) {
    return "critical";
  }

  if (value >= threshold - 10) {
    return "warning";
  }

  return "healthy";
}

function buildLoudestSourceLabel(
  logs: Array<SymphonyRuntimeLogsResult["logs"][number]>
) {
  if (logs.length === 0) {
    return {
      label: "n/a",
      detail: "No runtime events are available yet."
    };
  }

  const counts = new Map<string, number>();

  for (const entry of logs) {
    counts.set(entry.source, (counts.get(entry.source) ?? 0) + 1);
  }

  const [source, count] = [...counts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    return left[0].localeCompare(right[0]);
  })[0]!;

  return {
    label: formatSourceLabel(source),
    detail: `${formatCount(count)} events in the current runtime log sample.`
  };
}

function buildScopeLabel(
  entry: SymphonyRuntimeLogsResult["logs"][number]
) {
  if (entry.issueIdentifier && entry.runId) {
    return `${entry.issueIdentifier} · Run ${entry.runId}`;
  }

  if (entry.issueIdentifier) {
    return entry.issueIdentifier;
  }

  if (entry.runId) {
    return `Run ${entry.runId}`;
  }

  return "Runtime-wide event";
}

function formatRuntimeEventPayload(
  payload: SymphonyRuntimeLogsResult["logs"][number]["payload"]
) {
  if (payload === null) {
    return "No structured payload.";
  }

  if (typeof payload === "string") {
    return payload;
  }

  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

function getLastCycleMs(
  startedAt: string | null,
  completedAt: string | null
): number | null {
  if (!startedAt || !completedAt) {
    return null;
  }

  const startedMs = Date.parse(startedAt);
  const completedMs = Date.parse(completedAt);

  if (Number.isNaN(startedMs) || Number.isNaN(completedMs)) {
    return null;
  }

  return Math.max(0, completedMs - startedMs);
}

function getAgeMs(value: string | null, now: Date): number | null {
  if (!value) {
    return null;
  }

  const parsedMs = Date.parse(value);

  if (Number.isNaN(parsedMs)) {
    return null;
  }

  return Math.max(0, now.getTime() - parsedMs);
}

function formatElapsedMs(value: number | null): string {
  if (value === null) {
    return "n/a";
  }

  if (value < 1_000) {
    return `${value}ms`;
  }

  const totalSeconds = Math.floor(value / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${totalSeconds}s`;
}
