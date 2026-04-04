import { describe, expect, it } from "vitest";
import {
  symphonyCodexOverflowRecordSchema,
  symphonyCodexRunRecordSchema,
  symphonyCodexTurnRecordSchema,
  symphonyCodexToolCallRecordSchema
} from "./responses.js";

describe("codex analytics contracts", () => {
  it("accepts valid Codex run and turn statuses", () => {
    expect(() =>
      symphonyCodexRunRecordSchema.parse({
        runId: "run-1",
        threadId: "thread-1",
        issueId: "issue-1",
        issueIdentifier: "COL-1",
        startedAt: "2026-04-03T20:37:38.000Z",
        endedAt: "2026-04-03T20:38:38.000Z",
        status: "completed",
        failureKind: null,
        failureOrigin: null,
        failureMessagePreview: null,
        finalTurnId: "turn-1",
        lastAgentMessageItemId: null,
        lastAgentMessagePreview: null,
        lastAgentMessageOverflowId: null,
        inputTokens: 10,
        cachedInputTokens: 2,
        outputTokens: 5,
        totalTokens: 15,
        turnCount: 1,
        itemCount: 1,
        commandCount: 0,
        toolCallCount: 0,
        fileChangeCount: 0,
        agentMessageCount: 1,
        reasoningCount: 0,
        errorCount: 0,
        latestEventAt: "2026-04-03T20:38:38.000Z",
        latestEventType: "turn.completed",
        insertedAt: "2026-04-03T20:37:38.000Z",
        updatedAt: "2026-04-03T20:38:38.000Z"
      })
    ).not.toThrow();

    expect(() =>
      symphonyCodexTurnRecordSchema.parse({
        turnId: "turn-1",
        runId: "run-1",
        threadId: "thread-1",
        startedAt: "2026-04-03T20:37:38.000Z",
        endedAt: "2026-04-03T20:38:38.000Z",
        status: "failed",
        failureKind: "turn_failed",
        failureMessagePreview: "Tool failed.",
        lastAgentMessageItemId: null,
        lastAgentMessagePreview: null,
        lastAgentMessageOverflowId: null,
        inputTokens: 10,
        cachedInputTokens: 0,
        outputTokens: 4,
        totalTokens: 14,
        usage: {
          input_tokens: 10,
          cached_input_tokens: 0,
          output_tokens: 4
        },
        itemCount: 1,
        commandCount: 0,
        toolCallCount: 1,
        fileChangeCount: 0,
        agentMessageCount: 0,
        reasoningCount: 0,
        errorCount: 1,
        latestEventAt: "2026-04-03T20:38:38.000Z",
        latestEventType: "turn.failed",
        insertedAt: "2026-04-03T20:37:38.000Z",
        updatedAt: "2026-04-03T20:38:38.000Z"
      })
    ).not.toThrow();
  });

  it("rejects invalid Codex analytics statuses", () => {
    expect(() =>
      symphonyCodexRunRecordSchema.parse({
        runId: "run-1",
        threadId: null,
        issueId: "issue-1",
        issueIdentifier: "COL-1",
        startedAt: "2026-04-03T20:37:38.000Z",
        endedAt: null,
        status: "finished",
        failureKind: null,
        failureOrigin: null,
        failureMessagePreview: null,
        finalTurnId: null,
        lastAgentMessageItemId: null,
        lastAgentMessagePreview: null,
        lastAgentMessageOverflowId: null,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        turnCount: 0,
        itemCount: 0,
        commandCount: 0,
        toolCallCount: 0,
        fileChangeCount: 0,
        agentMessageCount: 0,
        reasoningCount: 0,
        errorCount: 0,
        latestEventAt: null,
        latestEventType: null,
        insertedAt: "2026-04-03T20:37:38.000Z",
        updatedAt: "2026-04-03T20:37:38.000Z"
      })
    ).toThrow(/Invalid option/i);

    expect(() =>
      symphonyCodexToolCallRecordSchema.parse({
        runId: "run-1",
        turnId: "turn-1",
        itemId: "tool-1",
        server: "linear",
        tool: "get_issue",
        status: "running",
        errorMessage: null,
        argumentsJson: {
          issueId: "COL-1"
        },
        resultPreview: null,
        resultOverflowId: null,
        startedAt: "2026-04-03T20:37:38.000Z",
        completedAt: null,
        durationMs: null,
        insertedAt: "2026-04-03T20:37:38.000Z",
        updatedAt: "2026-04-03T20:37:38.000Z"
      })
    ).toThrow(/Invalid option/i);
  });

  it("requires endedAt for terminal Codex runs and turns", () => {
    expect(() =>
      symphonyCodexRunRecordSchema.parse({
        runId: "run-1",
        threadId: null,
        issueId: "issue-1",
        issueIdentifier: "COL-1",
        startedAt: "2026-04-03T20:37:38.000Z",
        endedAt: null,
        status: "completed",
        failureKind: null,
        failureOrigin: null,
        failureMessagePreview: null,
        finalTurnId: null,
        lastAgentMessageItemId: null,
        lastAgentMessagePreview: null,
        lastAgentMessageOverflowId: null,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        turnCount: 0,
        itemCount: 0,
        commandCount: 0,
        toolCallCount: 0,
        fileChangeCount: 0,
        agentMessageCount: 0,
        reasoningCount: 0,
        errorCount: 0,
        latestEventAt: null,
        latestEventType: null,
        insertedAt: "2026-04-03T20:37:38.000Z",
        updatedAt: "2026-04-03T20:37:38.000Z"
      })
    ).toThrow(/endedAt/i);

    expect(() =>
      symphonyCodexTurnRecordSchema.parse({
        turnId: "turn-1",
        runId: "run-1",
        threadId: null,
        startedAt: "2026-04-03T20:37:38.000Z",
        endedAt: null,
        status: "failed",
        failureKind: "turn_failed",
        failureMessagePreview: "Tool failed.",
        lastAgentMessageItemId: null,
        lastAgentMessagePreview: null,
        lastAgentMessageOverflowId: null,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        usage: null,
        itemCount: 0,
        commandCount: 0,
        toolCallCount: 0,
        fileChangeCount: 0,
        agentMessageCount: 0,
        reasoningCount: 0,
        errorCount: 1,
        latestEventAt: null,
        latestEventType: null,
        insertedAt: "2026-04-03T20:37:38.000Z",
        updatedAt: "2026-04-03T20:37:38.000Z"
      })
    ).toThrow(/endedAt/i);
  });

  it("accepts overflow records with full stored content", () => {
    expect(() =>
      symphonyCodexOverflowRecordSchema.parse({
        overflowId: "overflow-1",
        runId: "run-1",
        turnId: "turn-1",
        itemId: "item-1",
        kind: "tool_result",
        contentJson: {
          content: [
            {
              type: "text",
              text: "Large MCP result"
            }
          ]
        },
        contentText: null,
        byteCount: 42,
        insertedAt: "2026-04-03T20:37:38.000Z"
      })
    ).not.toThrow();
  });
});
