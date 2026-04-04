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
`.trim();
}
