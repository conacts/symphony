import { describe, expect, it } from "vitest";
import {
  hasSubscribedToRequestedChannels,
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
        subscribedChannels: ["runtime"],
        requestedChannels: ["runtime"],
        hasResource: false,
        error: null
      })
    ).toBe(true);
    expect(
      shouldRefreshAfterConnectionAck({
        subscribedChannels: ["runtime"],
        requestedChannels: ["runtime"],
        hasResource: true,
        error: "Runtime summary request failed with 502."
      })
    ).toBe(true);
    expect(
      shouldRefreshAfterConnectionAck({
        subscribedChannels: ["runtime"],
        requestedChannels: ["runtime"],
        hasResource: true,
        error: null
      })
    ).toBe(false);
  });

  it("ignores websocket acknowledgements until the requested channels are subscribed", () => {
    expect(
      hasSubscribedToRequestedChannels({
        subscribedChannels: [],
        requestedChannels: ["problem-runs"]
      })
    ).toBe(false);

    expect(
      shouldRefreshAfterConnectionAck({
        subscribedChannels: [],
        requestedChannels: ["problem-runs"],
        hasResource: false,
        error: null
      })
    ).toBe(false);
  });
});
