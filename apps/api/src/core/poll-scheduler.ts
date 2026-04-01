import type { SymphonyOrchestratorSnapshot } from "@symphony/core/orchestration";
import type { SymphonyRuntimeLogStore } from "@symphony/db";
import type { SymphonyLogger } from "@symphony/logger";

export type SymphonyRuntimePollSchedulerSnapshot = {
  running: boolean;
  intervalMs: number;
  inFlight: boolean;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastSucceededAt: string | null;
  lastError: string | null;
};

export class SymphonyRuntimePollScheduler {
  readonly #intervalMs: number;
  readonly #logger: SymphonyLogger;
  readonly #runtimeLogs: SymphonyRuntimeLogStore;
  readonly #runPollCycle: () => Promise<SymphonyOrchestratorSnapshot>;
  readonly #isPollCycleInFlight: () => boolean;
  readonly #onFatalError: (error: Error) => void;
  #timer: ReturnType<typeof setInterval> | null = null;
  #state: SymphonyRuntimePollSchedulerSnapshot;

  constructor(input: {
    intervalMs: number;
    logger: SymphonyLogger;
    runtimeLogs: SymphonyRuntimeLogStore;
    runPollCycle: () => Promise<SymphonyOrchestratorSnapshot>;
    isPollCycleInFlight: () => boolean;
    onFatalError?: (error: Error) => void;
  }) {
    this.#intervalMs = input.intervalMs;
    this.#logger = input.logger;
    this.#runtimeLogs = input.runtimeLogs;
    this.#runPollCycle = input.runPollCycle;
    this.#isPollCycleInFlight = input.isPollCycleInFlight;
    this.#onFatalError =
      input.onFatalError ??
      ((error) => {
        setImmediate(() => {
          throw error;
        });
      });
    this.#state = {
      running: false,
      intervalMs: input.intervalMs,
      inFlight: false,
      lastStartedAt: null,
      lastCompletedAt: null,
      lastSucceededAt: null,
      lastError: null
    };
  }

  snapshot(): SymphonyRuntimePollSchedulerSnapshot {
    return {
      ...this.#state
    };
  }

  start(): void {
    if (this.#timer) {
      return;
    }

    this.#state.running = true;
    void this.#tick("startup");

    this.#timer = setInterval(() => {
      void this.#tick("interval");
    }, this.#intervalMs);
  }

  stop(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }

    this.#state.running = false;
  }

  async #tick(trigger: "startup" | "interval"): Promise<void> {
    if (this.#isPollCycleInFlight()) {
      this.#logger.warn("Skipped scheduled poll because a poll cycle is already in flight", {
        trigger
      });
      await this.#runtimeLogs.record({
        level: "warn",
        source: "poller",
        eventType: "poll_skipped_overlap",
        message: "Skipped poll because a poll cycle was already in flight.",
        payload: {
          trigger
        }
      });
      return;
    }

    const startedAt = new Date().toISOString();
    this.#state.inFlight = true;
    this.#state.lastStartedAt = startedAt;

    await this.#runtimeLogs.record({
      level: "info",
      source: "poller",
      eventType: "poll_started",
      message: "Started scheduled poll cycle.",
      payload: {
        trigger
      },
      recordedAt: startedAt
    });

    try {
      await this.#runPollCycle();
      const completedAt = new Date().toISOString();
      this.#state.lastCompletedAt = completedAt;
      this.#state.lastSucceededAt = completedAt;
      this.#state.lastError = null;

      await this.#runtimeLogs.record({
        level: "info",
        source: "poller",
        eventType: "poll_completed",
        message: "Completed scheduled poll cycle.",
        payload: {
          trigger
        },
        recordedAt: completedAt
      });
    } catch (error) {
      const completedAt = new Date().toISOString();
      const message = error instanceof Error ? error.message : String(error);
      this.#state.lastCompletedAt = completedAt;
      this.#state.lastError = message;

      this.#logger.error("Scheduled poll cycle failed", {
        trigger,
        error
      });

      await this.#runtimeLogs.record({
        level: "error",
        source: "poller",
        eventType: "poll_failed",
        message: "Scheduled poll cycle failed.",
        payload: {
          trigger,
          error: message
        },
        recordedAt: completedAt
      });

      if (isFatalRuntimeError(error)) {
        this.stop();
        this.#onFatalError(
          error instanceof Error ? error : new Error(message)
        );
      }
    } finally {
      this.#state.inFlight = false;
    }
  }
}

function isFatalRuntimeError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "fatal" in error &&
    (error as Error & { fatal?: unknown }).fatal === true
  );
}
