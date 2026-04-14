import {
  buildSymphonyContinuationCompletionGuidance,
  type SymphonyPromptCompletionContract,
  type SymphonyRunMode
} from "@symphony/runtime-contract";

export function buildSymphonyContinuationPrompt(input: {
  turnNumber: number;
  maxTurns: number;
  runMode: SymphonyRunMode;
  completionContract?: SymphonyPromptCompletionContract;
}): string {
  const completionContract = input.completionContract ?? "finish_tool";
  const stopRule =
    completionContract === "module_result"
      ? "- Only stop when you can emit a valid terminal module result with `outcome: \"completed\"`, `outcome: \"awaiting_input\"`, or `outcome: \"blocked\"`, or when the runtime itself fails hard."
      : "- Do not stop for partial progress, a likely fix, or a request for human follow-up.";

  return `
Continuation guidance:

- The previous PI turn completed normally, but the Linear issue is still in an active state.
- The active Linear workspace for this repository is \`symphony-harness\`.
- This is continuation turn #${input.turnNumber} of ${input.maxTurns} for the current agent run.
- This is the same PI thread. Resume from the current workspace and thread context instead of restarting from scratch.
- The original task instructions and prior turn context are already present in this thread, so do not restate them before acting.
- Focus on the remaining ticket work immediately.
- Before editing, gather enough local context to make one clean patch instead of many small speculative changes.
- Prefer built-in Pi tools for reading, searching, and editing files. Use shell primarily for execution tasks like tests, builds, git, and package-manager commands.
- If Symphony exposes built-in Linear tools in this runtime, use them instead of searching for \`LINEAR_API_KEY\` in shell startup files, the workspace, or git history.
- If the \`linear\` CLI is available, prefer it over one-off shell scripts for direct Linear inspection.
- If the issue is in \`Rework\`, or review feedback already exists, read the latest Linear comment context and any relevant PR review feedback before editing so you address the current feedback instead of stale assumptions.
- Never move the issue to \`Done\` from the agent runtime.
${buildSymphonyContinuationCompletionGuidance(input.runMode, completionContract).join("\n")}
- Do not end the turn with a completion-style summary while the issue stays active unless the requested work is actually finished and validated.
- Treat a completed subtask, a passing build, or a passing test run as intermediate progress unless the full issue is done.
- ${stopRule.slice(2)}
- Only stop early for a true external blocker: missing required permissions, missing required secrets/auth, or a hard platform/runtime failure that prevents further progress.
- Before ending the turn, inspect \`git status\`.
- If the working tree still contains relevant uncommitted changes after implementation or validation, continue in the same turn: review the diff, finish any remaining work, and create the issue-scoped commit before reporting completion.
- Do not end the turn with a summary while the branch is still dirty and the issue remains active.
`.trim();
}
