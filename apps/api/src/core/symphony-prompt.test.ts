import { describe, expect, it } from "vitest";
import { buildSymphonyContinuationPrompt } from "./symphony-prompt.js";

describe("symphony continuation prompt", () => {
  it("repeats the Linear and delivery exactness rules on continuation turns", () => {
    const prompt = buildSymphonyContinuationPrompt({
      turnNumber: 2,
      maxTurns: 20
    });

    expect(prompt).toContain("This is the same PI thread.");
    expect(prompt).toContain(
      "Before editing, gather enough local context to make one clean patch"
    );
    expect(prompt).toContain(
      "Prefer built-in Pi tools for reading, searching, and editing files."
    );
    expect(prompt).toContain("use them instead of searching for `LINEAR_API_KEY`");
    expect(prompt).toContain("Never move the issue to `Done`");
    expect(prompt).toContain("move the issue to `In Review`");
  });
});
