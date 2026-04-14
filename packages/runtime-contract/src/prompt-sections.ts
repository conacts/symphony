import type { SymphonyRunMode } from "./prompt-run-mode.js";
import type { SymphonyPromptCompletionContract } from "./module-result.js";

export const symphonyHarnessPromptAppendix = buildSymphonyHarnessPromptAppendix();

export function buildSymphonyRunModeSection(
  runMode: SymphonyRunMode,
  completionContract: SymphonyPromptCompletionContract = "finish_tool"
): string {
  switch (runMode) {
    case "rework":
      return [
        "Current run mode: Rework",
        "- Read the latest Linear rework note and any relevant GitHub review comment context first.",
        "- Address the requested feedback before taking on any new work.",
        "- Keep the patch scoped to the requested revisions."
      ].join("\n");
    case "approved_merge":
      return [
        "Current run mode: Approved Merge",
        "- This run is for merge completion, not normal feature development.",
        "- Update the branch from the latest `main` and resolve conflicts conservatively.",
        "- Run the required verification and merge only if the branch is clean.",
        "- If the merge succeeds, report it with `pnpm exec symphony tool merge-result --status merged ...`.",
        "- If conflicts or verification failures cannot be resolved safely, report the blocked result with `pnpm exec symphony tool merge-result --status blocked ...`."
      ].join("\n");
    default:
      return [
        "Current run mode: Implementation",
        "- Complete the requested ticket work in the current workspace.",
        "- Keep the patch targeted and move directly toward a review-ready result.",
        ...(completionContract === "module_result"
          ? [
              "- This is a capability-managed run. End the run with a structured terminal module result instead of `pnpm exec symphony tool finish ...`."
            ]
          : [])
      ].join("\n");
  }
}

export function buildSymphonyContinuationCompletionGuidance(
  runMode: SymphonyRunMode,
  completionContract: SymphonyPromptCompletionContract = "finish_tool"
): string[] {
  if (runMode === "approved_merge") {
    return [
      "- This is an approved merge run. Continue merge completion work instead of reopening normal feature development.",
      "- Once the branch is merged cleanly, run `pnpm exec symphony tool merge-result --status merged ...` immediately in the same turn.",
      "- If conflicts or verification failures cannot be resolved safely, run `pnpm exec symphony tool merge-result --status blocked ...` with the concrete blocking reason before ending the run."
    ];
  }

  if (completionContract === "module_result") {
    return [
      "- This is a capability-managed run. Do not call `pnpm exec symphony tool finish ...`.",
      "- End the run by emitting exactly one final fenced `json` block and nothing after it.",
      "- The terminal result object must include `schemaVersion`, `moduleId`, `outcome`, `summary`, `evidence`, `requestedState`, `nextInputPrompt`, and `blockers`.",
      "- Use `moduleId: \"implement.spec\"` for this phase of intelligent-flow.",
      "- Use `outcome: \"completed\"` with `requestedState: \"done\"` when the implementation work is finished.",
      "- Use `outcome: \"awaiting_input\"` with `requestedState: \"awaiting_input\"` and a non-empty `nextInputPrompt` when explicit user input is required.",
      "- Use `outcome: \"blocked\"` with `requestedState: \"blocked\"` and non-empty `blockers` when an external blocker stops progress."
    ];
  }

  return [
    "- Once the requested work is delivered and the PR is opened, run `pnpm exec symphony tool finish ...` immediately in the same turn. Symphony will record delivery, move the issue to `In Review`, and that should usually end the run.",
    "- Do not keep taking extra turns after the PR is open and delivery is reported unless there is a concrete unresolved failure in the same run."
  ];
}

export function buildSymphonyHarnessPromptAppendix(input?: {
  completionContract?: SymphonyPromptCompletionContract;
}): string {
  const completionContract = input?.completionContract ?? "finish_tool";
  const projectRuntimeTools =
    completionContract === "module_result"
      ? [
          "`pnpm exec symphony tool merge-result ...`: Record the explicit outcome of an approved merge run. Use `merged` for a clean merge and `blocked` when conflicts or verification failures could not be resolved safely."
        ]
      : [
          "`pnpm exec symphony tool finish ...`: Record delivery for implementation or rework runs, move the issue to `In Review`, and end the run.",
          "`pnpm exec symphony tool merge-result ...`: Record the explicit outcome of an approved merge run. Use `merged` for a clean merge and `blocked` when conflicts or verification failures could not be resolved safely."
        ];
  const runtimeExpectations =
    completionContract === "module_result"
      ? [
          "The active Linear workspace for this repository is `symphony-harness`.",
          "Treat Linear as the source of truth for issue status, review feedback, and delivery state.",
          "Capability-managed implementation and rework runs complete through a structured terminal module result, not `pnpm exec symphony tool finish ...`.",
          "The final assistant message for a capability-managed implementation or rework run must be exactly one fenced `json` block.",
          "That terminal result must carry the authoritative `outcome`, `summary`, `evidence`, `requestedState`, `nextInputPrompt`, and `blockers` fields.",
          "Use `outcome: \"completed\"` only when the requested implementation work is actually done.",
          "Use `outcome: \"awaiting_input\"` only when the run cannot continue without explicit user input.",
          "Use `outcome: \"blocked\"` only for a true external blocker outside the run's authority.",
          "Approved merge runs still complete through `pnpm exec symphony tool merge-result ...`.",
          "Never move the issue to `Done` yourself from the agent runtime.",
          "Do not add extra prose after the final terminal result JSON block."
        ]
      : [
          "The active Linear workspace for this repository is `symphony-harness`.",
          "Treat Linear as the source of truth for issue status, review feedback, and delivery state.",
          "Treat the mode-specific Symphony CLI command as the explicit completion boundary for every run.",
          "Implementation and rework runs complete through `pnpm exec symphony tool finish ...`.",
          "Approved merge runs complete through `pnpm exec symphony tool merge-result ...`.",
          "The finish command records delivery and moves the issue to `In Review` for you.",
          "Never move the issue to `Done` yourself from the agent runtime.",
          "If the work is blocked or only partially delivered, call `pnpm exec symphony tool finish ...` with the matching status and the concrete reason before ending the run."
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
