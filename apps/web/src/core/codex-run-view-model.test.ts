import { describe, expect, it } from "vitest";
import {
  buildCodexRunViewModel,
  formatOverflowContent
} from "./codex-run-view-model.js";
import {
  buildSymphonyCodexOverflowResult,
  buildSymphonyCodexRunArtifactsResult,
  buildSymphonyForensicsRunDetailResult
} from "@/test-support/build-symphony-dashboard-view-fixtures";

describe("codex run view model", () => {
  it("builds a structured transcript from Codex artifacts", () => {
    const viewModel = buildCodexRunViewModel({
      runDetail: buildSymphonyForensicsRunDetailResult(),
      runArtifacts: buildSymphonyCodexRunArtifactsResult()
    });

    expect(viewModel.issueIdentifier).toBe("COL-165");
    expect(viewModel.metrics[0]?.value).toBe("finished");
    expect(viewModel.metrics[1]?.value).toBe("completed");
    expect(viewModel.metadata[0]?.value).toBe("OpenRouter");
    expect(viewModel.metadata[1]?.value).toBe("api_key_env");
    expect(viewModel.transcriptTurns).toHaveLength(1);
    expect(viewModel.transcriptTurns[0]?.entries.map((entry) => entry.kind)).toEqual([
      "reasoning",
      "command",
      "tool-call",
      "agent-message"
    ]);
  });

  it("formats overflow payloads as readable text", () => {
    expect(formatOverflowContent(buildSymphonyCodexOverflowResult())).toContain(
      "Task complete."
    );
  });
});
