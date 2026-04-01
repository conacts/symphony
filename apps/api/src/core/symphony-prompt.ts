import type { SymphonyTrackerIssue } from "@symphony/core/tracker";

export function renderSymphonyPrompt(input: {
  template: string;
  issue: SymphonyTrackerIssue;
  attempt: number;
}): string {
  const context = {
    issue: {
      ...input.issue
    },
    attempt: input.attempt
  } as const;

  return input.template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, expression) => {
    const value = resolveTemplatePath(context, expression.trim());

    if (value === undefined) {
      throw new Error(`Unknown workflow template variable: ${expression.trim()}`);
    }

    if (value === null) {
      return "";
    }

    return String(value);
  });
}

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
- Focus on the remaining ticket work and do not end the turn while the issue stays active unless you are truly blocked.
`.trim();
}

function resolveTemplatePath(
  root: Record<string, unknown>,
  expression: string
): unknown {
  const segments = expression
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "");

  let current: unknown = root;

  for (const segment of segments) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}
