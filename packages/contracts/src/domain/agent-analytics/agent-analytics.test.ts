import { describe, expect, it } from "vitest";
import {
  symphonyAgentCommandExecutionRecordSchema,
  symphonyAgentMessageRecordSchema,
  symphonyAgentOverflowRecordSchema,
  symphonyAgentRunRecordSchema,
  symphonyAgentTurnRecordSchema,
  symphonyAgentToolCallRecordSchema
} from "./responses.js";

describe("agent analytics contracts", () => {
  it("accepts valid agent run and turn statuses", () => {
    expect(() =>
      symphonyAgentRunRecordSchema.parse({
        runId: "run-1",
        threadId: "thread-1",
        trackerIssueId: "issue-1",
        trackerIssueKey: "COL-1",
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
        totalTokens: 17,
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
      symphonyAgentTurnRecordSchema.parse({
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

  it("requires canonical runtime thread ids and start timestamps", () => {
    expect(() =>
      symphonyAgentRunRecordSchema.parse({
        runId: "run-1",
        threadId: null,
        trackerIssueId: "issue-1",
        trackerIssueKey: "COL-1",
        startedAt: "2026-04-03T20:37:38.000Z",
        endedAt: null,
        status: "running",
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
    ).toThrow(/threadId/i);

    expect(() =>
      symphonyAgentRunRecordSchema.parse({
        runId: "run-1",
        threadId: "thread-1",
        trackerIssueId: "issue-1",
        trackerIssueKey: "COL-1",
        startedAt: null,
        endedAt: null,
        status: "running",
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
    ).toThrow(/startedAt/i);

    expect(() =>
      symphonyAgentTurnRecordSchema.parse({
        turnId: "turn-1",
        runId: "run-1",
        threadId: null,
        startedAt: "2026-04-03T20:37:38.000Z",
        endedAt: null,
        status: "running",
        failureKind: null,
        failureMessagePreview: null,
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
        errorCount: 0,
        latestEventAt: null,
        latestEventType: null,
        insertedAt: "2026-04-03T20:37:38.000Z",
        updatedAt: "2026-04-03T20:37:38.000Z"
      })
    ).toThrow(/threadId/i);

    expect(() =>
      symphonyAgentTurnRecordSchema.parse({
        turnId: "turn-1",
        runId: "run-1",
        threadId: "thread-1",
        startedAt: null,
        endedAt: null,
        status: "running",
        failureKind: null,
        failureMessagePreview: null,
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
        errorCount: 0,
        latestEventAt: null,
        latestEventType: null,
        insertedAt: "2026-04-03T20:37:38.000Z",
        updatedAt: "2026-04-03T20:37:38.000Z"
      })
    ).toThrow(/startedAt/i);
  });

  it("rejects invalid agent analytics statuses", () => {
    expect(() =>
      symphonyAgentRunRecordSchema.parse({
        runId: "run-1",
        threadId: "thread-1",
        trackerIssueId: "issue-1",
        trackerIssueKey: "COL-1",
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
      symphonyAgentToolCallRecordSchema.parse({
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

  it("requires endedAt for terminal agent runs and turns", () => {
    expect(() =>
      symphonyAgentRunRecordSchema.parse({
        runId: "run-1",
        threadId: "thread-1",
        trackerIssueId: "issue-1",
        trackerIssueKey: "COL-1",
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
      symphonyAgentTurnRecordSchema.parse({
        turnId: "turn-1",
        runId: "run-1",
        threadId: "thread-1",
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
      symphonyAgentOverflowRecordSchema.parse({
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

  it("accepts Pi message-end metadata on message records", () => {
    expect(() =>
      symphonyAgentMessageRecordSchema.parse({
        runId: "run-1",
        turnId: "turn-1",
        itemId: "message-1",
        textContent: "Investigating token totals",
        textPreview: "Investigating token totals",
        textOverflowId: null,
        recordedAt: "2026-04-03T20:37:38.000Z",
        piMessage: {
          responseId: "assistant-1",
          api: "responses",
          provider: "openrouter",
          model: "xiaomi/mimo-v2-pro",
          stopReason: "tool_use",
          responseTimestamp: "2026-04-03T20:37:38.000Z",
          inputTokens: 10,
          cachedInputTokens: 2,
          cacheWriteTokens: 1,
          outputTokens: 5,
          totalTokens: 17
        },
        insertedAt: "2026-04-03T20:37:38.000Z",
        updatedAt: "2026-04-03T20:37:38.000Z"
      })
    ).not.toThrow();
  });

  it("accepts Pi-native command, edit, and write metadata", () => {
    expect(() =>
      symphonyAgentCommandExecutionRecordSchema.parse({
        runId: "run-1",
        turnId: "turn-1",
        itemId: "cmd-1",
        command: "pnpm test",
        status: "completed",
        exitCode: 0,
        timeoutSeconds: 60,
        startedAt: "2026-04-03T20:37:38.000Z",
        completedAt: "2026-04-03T20:37:39.000Z",
        durationMs: 1000,
        outputPreview: "ok",
        outputOverflowId: null,
        resourceProfile: {
          captureScope: "session_process_tree",
          samplingIntervalMs: 1000,
          firstSampledAt: null,
          lastSampledAt: null,
          sampleCount: 0,
          peakCpuPercent: 0,
          peakMemPercent: 0,
          peakRssKb: 0,
          peakProcessCount: 0,
          topProcesses: [],
          samples: []
        },
        insertedAt: "2026-04-03T20:37:38.000Z",
        updatedAt: "2026-04-03T20:37:39.000Z"
      })
    ).not.toThrow();

    expect(() =>
      symphonyAgentToolCallRecordSchema.parse({
        runId: "run-1",
        turnId: "turn-1",
        itemId: "tool-1",
        server: "pi",
        tool: "edit",
        status: "completed",
        errorMessage: null,
        argumentsJson: {
          path: "src/index.ts"
        },
        resultPreview: "@@ -1 +1 @@",
        resultOverflowId: null,
        startedAt: "2026-04-03T20:37:38.000Z",
        completedAt: "2026-04-03T20:37:39.000Z",
        durationMs: 1000,
        piEdit: {
          path: "src/index.ts",
          editCount: 1,
          lineCount: 1,
          firstChangedLine: 1,
          diffPreview: "@@ -1 +1 @@",
          diffOverflowId: null,
          edits: [
            {
              oldText: "const x = 1;",
              newText: "const x = 2;"
            }
          ]
        },
        insertedAt: "2026-04-03T20:37:38.000Z",
        updatedAt: "2026-04-03T20:37:39.000Z"
      })
    ).not.toThrow();

    expect(() =>
      symphonyAgentToolCallRecordSchema.parse({
        runId: "run-1",
        turnId: "turn-1",
        itemId: "tool-2",
        server: "pi",
        tool: "write",
        status: "completed",
        errorMessage: null,
        argumentsJson: {
          path: "src/out.ts"
        },
        resultPreview: "Successfully wrote 24 bytes",
        resultOverflowId: null,
        startedAt: "2026-04-03T20:37:38.000Z",
        completedAt: "2026-04-03T20:37:39.000Z",
        durationMs: 1000,
        piWrite: {
          path: "src/out.ts",
          lineCount: 2,
          contentBytes: 20,
          bytesWritten: 24,
          diffPreview: null,
          diffOverflowId: null
        },
        insertedAt: "2026-04-03T20:37:38.000Z",
        updatedAt: "2026-04-03T20:37:39.000Z"
      })
    ).not.toThrow();
  });
});
