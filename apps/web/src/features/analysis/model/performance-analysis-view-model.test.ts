import { describe, expect, it } from "vitest";
import { buildPerformanceAnalysisViewModel } from "@/features/analysis/model/performance-analysis-view-model";
import {
  buildSymphonyCodexRunArtifactsResult,
  buildSymphonyForensicsIssueListResult
} from "@/test-support/build-symphony-dashboard-view-fixtures";

describe("performance analysis view model", () => {
  it("aggregates command families and tool hotspots from sampled runs", () => {
    const viewModel = buildPerformanceAnalysisViewModel({
      issueIndex: buildSymphonyForensicsIssueListResult(),
      sampledRuns: [
        {
          issueIdentifier: "COL-165",
          run: {
            ...buildSymphonyForensicsIssueListResult().issues[0]!,
            runId: "run_a"
          } as never,
          artifacts: buildSymphonyCodexRunArtifactsResult({
            commandExecutions: [
              {
                ...buildSymphonyCodexRunArtifactsResult().commandExecutions[0]!,
                command: "sh -lc 'pnpm lint'",
                durationMs: 18_000,
                status: "completed"
              },
              {
                ...buildSymphonyCodexRunArtifactsResult().commandExecutions[0]!,
                itemId: "cmd_456",
                command: "python3 scripts/check.py",
                durationMs: 9_000,
                status: "failed",
                completedAt: "2026-03-31T18:00:45.000Z",
                updatedAt: "2026-03-31T18:00:45.000Z"
              }
            ],
            toolCalls: [
              {
                ...buildSymphonyCodexRunArtifactsResult().toolCalls[0]!,
                tool: "get_issue",
                durationMs: 8_000,
                status: "completed"
              },
              {
                ...buildSymphonyCodexRunArtifactsResult().toolCalls[0]!,
                itemId: "tool_456",
                tool: "search_documentation",
                durationMs: 12_000,
                status: "failed",
                completedAt: "2026-03-31T18:00:50.000Z",
                updatedAt: "2026-03-31T18:00:50.000Z"
              }
            ]
          })
        }
      ]
    });

    expect(viewModel.summaryCards[0]?.value).toBe("1");
    expect(viewModel.summaryCards[1]?.value).toBe("2");
    expect(viewModel.latencyCards[0]?.value).toBe("1");
    expect(viewModel.commandFamilyRows[0]?.family).toBe("python");
    expect(viewModel.toolRows[0]?.toolLabel).toBe("linear.search_documentation");
    expect(viewModel.slowTurnRows[0]?.turnLabel).toBe("Turn 1");
    expect(viewModel.hotspotRows[0]?.label).toContain("search_documentation");
    expect(viewModel.spotlight.flakiestCommandFamily).toBe("python");
  });
});
