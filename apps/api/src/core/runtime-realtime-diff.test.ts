import { describe, expect, it } from "vitest";
import { createSilentSymphonyLogger } from "@symphony/logger";
import {
  publishRealtimeSnapshotDiff,
  snapshotRequiresRealtimeInvalidation
} from "./runtime-realtime-diff.js";
import {
  buildSymphonyOrchestratorSnapshot,
  buildSymphonyRuntimeTrackerIssue
} from "../test-support/create-symphony-runtime-test-harness.js";

describe("runtime realtime diff", () => {
  it("publishes run invalidations when active runs change", () => {
    const issue = buildSymphonyRuntimeTrackerIssue({
      state: "In Progress"
    });
    const before = buildSymphonyOrchestratorSnapshot({
      running: [
        {
          issueId: issue.id,
          issue,
          runId: "run-123",
          sessionId: "thread-live",
          workerHost: null,
          workspacePath: `/tmp/symphony-${issue.identifier}`,
          retryAttempt: 0,
          turnCount: 1,
          lastCodexMessage: null,
          lastCodexTimestamp: "2026-03-31T00:00:01.000Z",
          lastCodexEvent: "turn_completed",
          codexInputTokens: 12,
          codexOutputTokens: 4,
          codexTotalTokens: 16,
          codexLastReportedInputTokens: 12,
          codexLastReportedOutputTokens: 4,
          codexLastReportedTotalTokens: 16,
          lastRateLimits: null,
          codexAppServerPid: "4242",
          startedAt: "2026-03-31T00:00:00.000Z",
          runtimeSeconds: 12
        }
      ]
    });
    const after = buildSymphonyOrchestratorSnapshot({
      running: []
    });
    const publishedRuns: Array<{
      runId: string;
      issueIdentifier: string | undefined;
    }> = [];
    const realtime = {
      openConnection() {
        return "connection-1";
      },
      closeConnection() {
        return;
      },
      handleClientMessage() {
        return;
      },
      publishSnapshotUpdated() {
        return;
      },
      publishIssueUpdated() {
        return;
      },
      publishRunUpdated(runId: string, issueIdentifier?: string) {
        publishedRuns.push({
          runId,
          issueIdentifier
        });
      },
      publishProblemRunsUpdated() {
        return;
      },
      connectionCount() {
        return 0;
      }
    };

    expect(snapshotRequiresRealtimeInvalidation(before, after)).toBe(true);

    publishRealtimeSnapshotDiff(
      realtime,
      before,
      after,
      createSilentSymphonyLogger("@symphony/api.runtime-realtime-diff.test")
    );

    expect(publishedRuns).toEqual([
      {
        runId: "run-123",
        issueIdentifier: "COL-123"
      }
    ]);
  });
});
