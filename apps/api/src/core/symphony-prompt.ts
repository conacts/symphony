export function buildSymphonyContinuationPrompt(input: {
  turnNumber: number;
  maxTurns: number;
}): string {
  return `
Continuation guidance:

- The previous Codex turn completed normally, but the Linear issue is still in an active state.
- This is continuation turn #${input.turnNumber} of ${input.maxTurns} for the current agent run.
- Resume from the current workspace and workpad state instead of restarting from scratch.
- The original task instructions and prior turn context are already present in this thread, so do not restate them before acting.
- Focus on the remaining ticket work immediately.
- Do not end the turn with a completion-style summary while the issue stays active unless the requested work is actually finished and validated.
- Do not stop for partial progress, a likely fix, or a request for human follow-up.
- Only stop early for a true external blocker: missing required permissions, missing required secrets/auth, or a hard platform/runtime failure that prevents further progress.
- Treat a completed subtask, a passing build, or a passing test run as intermediate progress unless the full issue is done.
- Before ending the turn, inspect \`git status\`.
- If the working tree still contains relevant uncommitted changes after implementation or validation, continue in the same turn: review the diff, finish any remaining work, and create the issue-scoped commit before reporting completion.
- Do not end the turn with a summary while the branch is still dirty and the issue remains active.
`.trim();
}
