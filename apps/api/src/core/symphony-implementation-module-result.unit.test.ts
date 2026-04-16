import { describe, expect, it } from "vitest";
import {
  parseSymphonyImplementationModuleResultMessage
} from "./symphony-implementation-module-result.js";

describe("symphony implementation module result parser", () => {
  it("parses a completed terminal result from an exact fenced json block", () => {
    const result = parseSymphonyImplementationModuleResultMessage({
      messageText: [
        "```json",
        JSON.stringify(
          {
            schemaVersion: "1",
            moduleId: "implement.spec",
            outcome: "completed",
            summary: "Implemented the requested issue behavior.",
            evidence: {
              filesChanged: ["apps/api/src/example.ts"],
              verification: [
                {
                  command: "pnpm exec vitest run",
                  status: "passed",
                  details: null
                }
              ],
              notes: "Scoped to the requested implementation surface."
            },
            requestedState: "done",
            nextInputPrompt: null,
            blockers: []
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    });

    expect(result).toEqual({
      kind: "parsed",
      result: expect.objectContaining({
        schemaVersion: "1",
        moduleId: "implement.spec",
        outcome: "completed",
        requestedState: "done"
      })
    });
  });

  it("records terminal_result_failure when the final message is plain text", () => {
    expect(
      parseSymphonyImplementationModuleResultMessage({
        messageText: "Implemented the work and opened the PR."
      })
    ).toEqual({
      kind: "terminal_result_failure",
      reason:
        "Capability-managed run ended without a final terminal module result JSON block."
    });
  });

  it("records terminal_result_failure when the terminal payload attempts the contract but violates it", () => {
    const result = parseSymphonyImplementationModuleResultMessage({
      messageText: [
        "```json",
        JSON.stringify(
          {
            schemaVersion: "1",
            moduleId: "implement.spec",
            outcome: "completed",
            summary: "Implemented the work.",
            evidence: {
              filesChanged: ["apps/api/src/example.ts"],
              verification: [],
              notes: null
            },
            requestedState: "awaiting_input",
            nextInputPrompt: "Need approval.",
            blockers: []
          },
          null,
          2
        ),
        "```"
      ].join("\n")
    });

    expect(result).toEqual({
      kind: "terminal_result_failure",
      reason:
        "Completed terminal module results must use requestedState \"done\"."
    });
  });
});
