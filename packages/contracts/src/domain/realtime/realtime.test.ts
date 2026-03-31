import { describe, expect, it } from "vitest";
import {
  symphonyRealtimeClientMessageSchema,
  symphonyRealtimeServerMessageSchema
} from "./index.js";

describe("symphony realtime contracts", () => {
  it("parses explicit client subscribe messages", () => {
    const parsed = symphonyRealtimeClientMessageSchema.parse({
      type: "subscribe",
      channels: ["runtime", "issues"]
    });

    expect(parsed.type).toBe("subscribe");
  });

  it("parses bounded server update messages", () => {
    const parsed = symphonyRealtimeServerMessageSchema.parse({
      type: "runtime.snapshot.updated",
      channel: "runtime",
      generatedAt: "2026-03-31T00:00:00.000Z",
      invalidate: ["/api/v1/state"]
    });

    expect(parsed.type).toBe("runtime.snapshot.updated");
  });

  it("rejects arbitrary websocket command channels", () => {
    expect(() =>
      symphonyRealtimeClientMessageSchema.parse({
        type: "inject-message",
        body: "do something new"
      })
    ).toThrowError();
  });
});
