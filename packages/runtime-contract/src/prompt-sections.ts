import type { SymphonyRunMode } from "./prompt-run-mode.js";
import type { SymphonyPromptCompletionContract } from "./module-result.js";

export const symphonyHarnessPromptAppendix = buildSymphonyHarnessPromptAppendix();

export function buildSymphonyRunModeSection(
  runMode: SymphonyRunMode,
  completionContract: SymphonyPromptCompletionContract = "module_result"
): string {
  switch (runMode) {
    case "rework":
      return [
        "Current run mode: Rework",
        "- Read the latest Linear rework note and any relevant GitHub review comment context first.",
        "- Address the requested feedback before taking on any new work.",
        "- Keep the patch scoped to the requested revisions."
      ].join("\n");
    default:
      return [
        "Current run mode: Implementation",
        "- Complete the requested ticket work in the current workspace.",
        "- Keep the patch targeted and move directly toward a review-ready result.",
        ...(completionContract === "module_result"
          ? [
              "- End the run with a structured terminal module result."
            ]
          : [])
      ].join("\n");
  }
}

export function buildSymphonyContinuationCompletionGuidance(
  runMode: SymphonyRunMode,
  completionContract: SymphonyPromptCompletionContract = "module_result"
): string[] {
  if (completionContract === "module_result") {
    return [
      "- End the run by emitting exactly one final fenced `json` block and nothing after it.",
      "- The terminal result object must include `schemaVersion`, `moduleId`, `outcome`, `summary`, `evidence`, `requestedState`, `nextInputPrompt`, and `blockers`.",
      "- Use `moduleId: \"implement.spec\"` for this phase of intelligent-flow.",
      "- Use `outcome: \"completed\"` with `requestedState: \"done\"` when the implementation work is finished.",
      "- Use `outcome: \"awaiting_input\"` with `requestedState: \"awaiting_input\"` and a non-empty `nextInputPrompt` when explicit user input is required.",
      "- Use `outcome: \"blocked\"` with `requestedState: \"blocked\"` and non-empty `blockers` when an external blocker stops progress."
    ];
  }

  return [];
}

export function buildSymphonyHarnessPromptAppendix(input?: {
  completionContract?: SymphonyPromptCompletionContract;
}): string {
  const completionContract = input?.completionContract ?? "module_result";
  const projectRuntimeTools =
    completionContract === "module_result"
      ? [
          "No legacy Symphony CLI completion command is available in this runtime.",
          "Runs complete only through a structured terminal module result."
        ]
      : [];
  const runtimeExpectations = [
    "The active Linear workspace for this repository is `symphony-harness`.",
    "Treat Linear as the source of truth for issue status, review feedback, and delivery state.",
    "Implementation and rework runs complete through a structured terminal module result.",
    "The final assistant message for an implementation or rework run must be exactly one fenced `json` block.",
    "That terminal result must carry the authoritative `outcome`, `summary`, `evidence`, `requestedState`, `nextInputPrompt`, and `blockers` fields.",
    "Use `outcome: \"completed\"` only when the requested implementation work is actually done.",
    "Use `outcome: \"awaiting_input\"` only when the run cannot continue without explicit user input.",
    "Use `outcome: \"blocked\"` only for a true external blocker outside the run's authority.",
    "Never move the issue to `Done` yourself from the agent runtime.",
    "Do not add extra prose after the final terminal result JSON block."
  ];

  return [
    "## Symphony harness guidance",
    "### Project runtime tools",
    ...renderBullets(projectRuntimeTools),
    "### Runtime expectations",
    ...renderBullets(runtimeExpectations),
    "### Tooling guidance",
    ...renderBullets([
      "Prefer PI-native harness tools over shelling out for equivalent file work.",
      "Use `pi.read` for file reads and structured inspection whenever possible.",
      "Use `pi.edit` for scoped file edits whenever possible.",
      "Before editing, gather enough local context to make one clean patch instead of many small speculative changes.",
      "Use shell commands for project execution, verification, and operations that are not exposed through PI-native tools.",
      "Prefer built-in Pi tools for reading, searching, and editing files. Use shell primarily for execution tasks like tests, builds, git, and package-manager commands.",
      "Keep file operations targeted and avoid broad recursive shell reads when PI-native tool calls can provide the same information.",
      "If Symphony exposes built-in Linear tools in this runtime, use them instead of searching for `LINEAR_API_KEY` in shell startup files or the workspace.",
      "If the `linear` CLI is available in the host or workspace runner, prefer it over ad hoc shell scripts for direct Linear inspection.",
      "If the issue is in `Rework`, or review feedback is already present, read the latest Linear comment context and any relevant PR review feedback before editing so the run addresses the newest feedback."
    ])
  ].join("\n");
}

function renderBullets(lines: string[]): string[] {
  return lines.map((line) => `- ${line}`);
}
