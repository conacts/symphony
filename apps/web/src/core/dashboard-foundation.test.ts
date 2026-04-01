import { describe, expect, it } from "vitest";
import {
  buildSymphonyDashboardFoundation,
  buildSymphonyRuntimeSurfaceUrls
} from "./dashboard-foundation.js";
import { buildSymphonyDashboardEnv } from "../test-support/build-symphony-dashboard-env.js";

describe("dashboard foundation", () => {
  it("derives the typed runtime surface catalog from the dashboard env", () => {
    const runtimeSurface = buildSymphonyRuntimeSurfaceUrls(
      "https://runtime.symphony.local"
    );

    expect(runtimeSurface.stateUrl).toBe(
      "https://runtime.symphony.local/api/v1/state"
    );
    expect(runtimeSurface.refreshUrl).toBe(
      "https://runtime.symphony.local/api/v1/refresh"
    );
    expect(runtimeSurface.issuesUrl).toBe(
      "https://runtime.symphony.local/api/v1/issues"
    );
    expect(runtimeSurface.websocketUrl).toBe(
      "wss://runtime.symphony.local/api/v1/ws"
    );
  });

  it("keeps the dashboard shell aligned to contracts and shared UI boundaries", () => {
    const foundation = buildSymphonyDashboardFoundation({
      runtimeBaseUrl: buildSymphonyDashboardEnv().SYMPHONY_RUNTIME_BASE_URL!
    });

    expect(foundation.contractsPackageName).toBe("@symphony/contracts");
    expect(foundation.schemaVersion).toBe("1");
    expect(foundation.navigation).toHaveLength(1);
    expect(foundation.websocketUrl).toBe("ws://127.0.0.1:4500/api/v1/ws");
    expect(foundation.runtimeSurface.stateUrl).toBe(
      "http://127.0.0.1:4500/api/v1/state"
    );
    expect(foundation.runtimeSurface.refreshUrl).toBe(
      "http://127.0.0.1:4500/api/v1/refresh"
    );
    expect(foundation.connection.kind).toBe("waiting");
  });
});
