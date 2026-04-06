import { describe, expect, it } from "vitest";
import {
  decodePiRuntimeEvent,
  decodePiUsage,
  extractPiRuntimeUsage
} from "./event-decoder.js";

describe("pi event decoder", () => {
  it("decodes message_end payloads into typed Pi events", () => {
    const event = decodePiRuntimeEvent({
      type: "message_end",
      api: "responses",
      provider: "anthropic",
      model: "claude-sonnet",
      stopReason: "tool_use",
      timestamp: "2026-04-05T12:00:00.000Z",
      message: {
        role: "assistant",
        responseId: "resp-1",
        usage: {
          input: 12,
          cacheRead: 7,
          cacheWrite: 3,
          output: 5,
          totalTokens: 27
        },
        content: [
          {
            type: "thinking",
            thinking: "Inspecting the repo"
          },
          {
            type: "text",
            text: "Implemented the fix"
          },
          {
            type: "toolCall",
            id: "tool-1"
          }
        ]
      }
    });

    expect(event).toMatchObject({
      type: "message_end",
      api: "responses",
      provider: "anthropic",
      model: "claude-sonnet",
      stopReason: "tool_use",
      timestamp: "2026-04-05T12:00:00.000Z",
      message: {
        role: "assistant",
        responseId: "resp-1",
        content: [
          {
            type: "thinking",
            thinking: "Inspecting the repo"
          },
          {
            type: "text",
            text: "Implemented the fix"
          },
          {
            type: "toolCall"
          }
        ]
      }
    });

    if (!event || event.type !== "message_end") {
      throw new Error("Expected a decoded message_end event");
    }

    expect(extractPiRuntimeUsage(event)).toEqual({
      input: 12,
      cacheRead: 7,
      cacheWrite: 3,
      output: 5,
      totalTokens: 27
    });
  });

  it("decodes queue updates into typed lists", () => {
    const event = decodePiRuntimeEvent({
      type: "queue_update",
      steering: ["Focus on tokens"],
      followUp: ["Summarize the findings"],
      inProgress: ["Backfill tables"],
      completed: ["Inspect DB"],
      cancelled: ["Unused branch"],
      tasks: [
        {
          label: "Capture usage"
        }
      ]
    });

    expect(event).toMatchObject({
      type: "queue_update",
      steering: ["Focus on tokens"],
      followUp: ["Summarize the findings"],
      inProgress: ["Backfill tables"],
      completed: ["Inspect DB"],
      cancelled: ["Unused branch"],
      tasks: [
        {
          label: "Capture usage"
        }
      ]
    });
  });

  it("computes a total when Pi usage omits it", () => {
    expect(
      decodePiUsage({
        input: 4,
        cacheRead: 8,
        cacheWrite: 2,
        output: 6
      })
    ).toEqual({
      input: 4,
      cacheRead: 8,
      cacheWrite: 2,
      output: 6,
      totalTokens: 20
    });
  });
});
