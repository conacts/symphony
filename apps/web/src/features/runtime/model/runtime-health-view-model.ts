import type { SymphonyRuntimeHealthResult } from "@symphony/contracts";
import { formatTimestamp } from "@/core/display-formatters";

export type RuntimeHealthViewModel = {
  summaryCards: Array<{
    label: string;
    value: string;
    detail: string;
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
};

export function buildRuntimeHealthViewModel(
  input: SymphonyRuntimeHealthResult,
  now: Date = new Date()
): RuntimeHealthViewModel {
  const lastCycleMs = getLastCycleMs(
    input.poller.lastStartedAt,
    input.poller.lastCompletedAt
  );
  const lastSuccessAgeMs = getAgeMs(input.poller.lastSucceededAt, now);

  return {
    summaryCards: [
      {
        label: "Overall",
        value: input.healthy ? "Healthy" : "Degraded",
        detail: "Combined database and scheduler health from the active runtime."
      },
      {
        label: "Database",
        value: input.db.ready ? "Ready" : "Down",
        detail: input.db.file
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
      }
    ],
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
        label: "Poll interval",
        value: `${input.poller.intervalMs}ms`
      },
      {
        label: "In flight",
        value: input.poller.inFlight ? "yes" : "no"
      },
      {
        label: "Healthy",
        value: input.healthy ? "yes" : "no"
      }
    ]
  };
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
