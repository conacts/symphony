import { describe, expect, it } from "vitest";
import {
  shouldDegradeRealtimeState,
  shouldRefreshAfterConnectionAck
} from "./realtime-resource.js";

describe("realtime resource helpers", () => {
  it("does not mark the dashboard degraded during first-boot startup races", () => {
    expect(
      shouldDegradeRealtimeState({
        hasResource: false,
        hasConnectedOnce: false
      })
    ).toBe(false);
  });

  it("marks the dashboard degraded once it had live data or a prior connection", () => {
    expect(
      shouldDegradeRealtimeState({
        hasResource: true,
        hasConnectedOnce: false
      })
    ).toBe(true);
    expect(
      shouldDegradeRealtimeState({
        hasResource: false,
        hasConnectedOnce: true
      })
    ).toBe(true);
  });

  it("refreshes after websocket acknowledgement when the snapshot is missing or stale", () => {
    expect(
      shouldRefreshAfterConnectionAck({
        hasResource: false,
        error: null
      })
    ).toBe(true);
    expect(
      shouldRefreshAfterConnectionAck({
        hasResource: true,
        error: "Runtime summary request failed with 502."
      })
    ).toBe(true);
    expect(
      shouldRefreshAfterConnectionAck({
        hasResource: true,
        error: null
      })
    ).toBe(false);
  });
});
