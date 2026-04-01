import { afterEach, describe, expect, it } from "vitest";
import {
  createSymphonyRuntimeAppServicesHarness,
  type SymphonyRuntimeAppServicesHarness
} from "../test-support/create-symphony-runtime-app-services-harness.js";

const harnesses: SymphonyRuntimeAppServicesHarness[] = [];

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.cleanup()));
});

describe("runtime services", () => {
  it("loads the default app services through real local composition", async () => {
    const harness = await createSymphonyRuntimeAppServicesHarness();
    harnesses.push(harness);

    const { services, env } = harness;
    const refresh = await services.orchestrator.requestRefresh();

    expect(services.workflow.promptTemplate).toBe("Prompt body");
    expect(services.workflowConfig.tracker.kind).toBe("memory");
    expect(refresh).toEqual(
      expect.objectContaining({
        queued: true,
        coalesced: false,
        operations: ["poll", "reconcile"]
      })
    );
    expect(services.health.snapshot()).toEqual(
      expect.objectContaining({
        healthy: true,
        db: {
          file: env.dbFile,
          ready: true
        }
      })
    );

    await waitFor(() => {
      const poller = services.health.snapshot().poller;
      return poller.lastCompletedAt !== null && poller.inFlight === false;
    });

    const runtimeLogs = await services.runtimeLogs.list();

    expect(runtimeLogs.logs.map((entry) => entry.eventType)).toEqual(
      expect.arrayContaining([
        "db_initialized",
        "tracker_placeholder_active",
        "poller_started",
        "manual_refresh_queued",
        "poll_started",
        "poll_completed"
      ])
    );
  });
});

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2_000
): Promise<void> {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for runtime services to settle.");
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
}
