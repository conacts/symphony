import { describe, expect, it } from "vitest";
import {
  computeDurationMs,
  isThreadEvent,
  previewItem
} from "./events.js";
import type { ThreadEvent, ThreadItem } from "./sdk-types.js";

describe("codex analytics events", () => {
  it("recognizes valid sdk thread events", () => {
    const event: ThreadEvent = {
      type: "turn.completed",
      usage: {
        input_tokens: 10,
        cached_input_tokens: 2,
        output_tokens: 5
      }
    };

    expect(isThreadEvent(event)).toBe(true);
    expect(isThreadEvent({ type: "turn.completed" })).toBe(false);
  });

  it("builds previews from sdk items", () => {
    const item: ThreadItem = {
      id: "msg-1",
      type: "agent_message",
      text: "hello from codex"
    };

    expect(previewItem(item)).toBe("hello from codex");
  });

  it("computes durations only for valid timestamps", () => {
    expect(
      computeDurationMs("2026-04-03T20:37:38.000Z", "2026-04-03T20:37:39.500Z")
    ).toBe(1500);
    expect(computeDurationMs("2026-04-03T20:37:39.500Z", "2026-04-03T20:37:38.000Z")).toBeNull();
  });
});
