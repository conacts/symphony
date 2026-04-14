import { describe, expect, it } from "vitest";
import { buildSymphonyContinuationPrompt } from "./symphony-prompt.js";

describe("symphony continuation prompt", () => {
  it("repeats the Linear and delivery exactness rules on continuation turns", () => {
    const prompt = buildSymphonyContinuationPrompt({
      turnNumber: 2,
      maxTurns: 20,
      runMode: "implementation"
    });

    expect(prompt).toContain("This is the same PI thread.");
    expect(prompt).toContain(
      "Before editing, gather enough local context to make one clean patch"
    );
    expect(prompt).toContain(
      "Prefer built-in Pi tools for reading, searching, and editing files."
    );
    expect(prompt).toContain("use them instead of searching for `LINEAR_API_KEY`");
    expect(prompt).toContain("read the latest Linear comment context");
    expect(prompt).toContain("Never move the issue to `Done`");
    expect(prompt).toContain("advance the workflow");
    expect(prompt).toContain("pnpm exec symphony tool finish");
  });

  it("switches completion guidance for approved merge continuation turns", () => {
    const prompt = buildSymphonyContinuationPrompt({
      turnNumber: 2,
      maxTurns: 20,
      runMode: "approved_merge"
    });

    expect(prompt).toContain("approved merge run");
    expect(prompt).toContain("pnpm exec symphony tool merge-result --status merged");
    expect(prompt).toContain("pnpm exec symphony tool merge-result --status blocked");
    expect(prompt).not.toContain("advance the workflow");
  });

  it("uses terminal module-result guidance for capability-managed continuation turns", () => {
    const prompt = buildSymphonyContinuationPrompt({
      turnNumber: 2,
      maxTurns: 20,
      runMode: "implementation",
      completionContract: "module_result"
    });

    expect(prompt).toContain("terminal module result");
    expect(prompt).toContain("End the run by emitting exactly one final fenced `json` block");
    expect(prompt).toContain("outcome: \"awaiting_input\"");
    expect(prompt).not.toContain("advance the workflow");
    expect(prompt).toContain("Do not call `pnpm exec symphony tool finish ...`");
  });
});
