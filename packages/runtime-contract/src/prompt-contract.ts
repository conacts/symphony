import { readFileSync } from "node:fs";
import path from "node:path";

export const defaultSymphonyPromptContractRelativePath = ".symphony/prompt.md";
export const symphonyHarnessPromptAppendix = [
  "## Symphony harness guidance",
  "### Project runtime tools",
  "- `pnpm exec symphony tool finish ...`: Record delivery for implementation or rework runs, move the issue to `In Review`, and end the run.",
  "- `pnpm exec symphony tool merge-result ...`: Record the explicit outcome of an approved merge run. Use `merged` for a clean merge and `blocked` when conflicts or verification failures could not be resolved safely.",
  "- The active Linear workspace for this repository is `symphony-harness`.",
  "- Treat Linear as the source of truth for issue status, review feedback, and delivery state.",
  "- Prefer PI-native harness tools over shelling out for equivalent file work.",
  "- Use `pi.read` for file reads and structured inspection whenever possible.",
  "- Use `pi.edit` for scoped file edits whenever possible.",
  "- Before editing, gather enough local context to make one clean patch instead of many small speculative changes.",
  "- Use shell commands for project execution, verification, and operations that are not exposed through PI-native tools.",
  "- Prefer built-in Pi tools for reading, searching, and editing files. Use shell primarily for execution tasks like tests, builds, git, and package-manager commands.",
  "- Keep file operations targeted and avoid broad recursive shell reads when PI-native tool calls can provide the same information.",
  "- If Symphony exposes built-in Linear tools in this runtime, use them instead of searching for `LINEAR_API_KEY` in shell startup files or the workspace.",
  "- If the `linear` CLI is available in the host or workspace runner, prefer it over ad hoc shell scripts for direct Linear inspection.",
  "- If the issue is in `Rework`, or review feedback is already present, read the latest Linear comment context and any relevant PR review feedback before editing so the run addresses the newest feedback.",
  "- Treat the mode-specific Symphony CLI command as the explicit completion boundary for every run.",
  "- Implementation and rework runs complete through `pnpm exec symphony tool finish ...`.",
  "- Approved merge runs complete through `pnpm exec symphony tool merge-result ...`.",
  "- The finish command records delivery and moves the issue to `In Review` for you.",
  "- Never move the issue to `Done` yourself from the agent runtime.",
  "- If the work is blocked or only partially delivered, call `pnpm exec symphony tool finish ...` with the matching status and the concrete reason before ending the run."
].join("\n");

export type SymphonyRunMode =
  | "implementation"
  | "rework"
  | "approved_merge";

export function deriveSymphonyRunMode(
  issueState: string | null | undefined
): SymphonyRunMode {
  const normalizedState = issueState?.trim().toLowerCase() ?? "";

  if (normalizedState === "rework") {
    return "rework";
  }

  if (normalizedState === "approved") {
    return "approved_merge";
  }

  return "implementation";
}

export type SymphonyPromptContractIssue = {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  state: string;
  labels: string[];
  url: string | null;
  branch_name: string | null;
};

export type SymphonyPromptContractRepo = {
  default_branch: string;
  name: string;
};

export type SymphonyPromptContractRun = {
  id: string;
};

export type SymphonyPromptContractWorkspace = {
  path: string;
  branch: string | null;
};

export type SymphonyPromptContractPayload = {
  issue: SymphonyPromptContractIssue;
  repo: SymphonyPromptContractRepo;
  run: SymphonyPromptContractRun;
  workspace: SymphonyPromptContractWorkspace;
  attempt?: number;
  run_mode: SymphonyRunMode;
  run_mode_section?: string | null;
  handoff_section?: string | null;
  rework_handoff?: string | null;
};

export type SymphonyPromptContractLoadOptions = {
  repoRoot: string;
  promptPath?: string;
};

export type SymphonyPromptContractValidationOptions = {
  promptPath?: string | null;
  payload?: SymphonyPromptContractPayload;
};

export type SymphonyLoadedPromptContract = {
  repoRoot: string;
  promptPath: string;
  template: string;
  variables: string[];
};

export type SymphonyPromptContractErrorCode =
  | "missing_runtime_prompt"
  | "invalid_runtime_prompt"
  | "runtime_prompt_render_failed";

export class SymphonyPromptContractError extends Error {
  readonly code: SymphonyPromptContractErrorCode;
  readonly promptPath: string | null;
  readonly variables: string[];

  constructor(
    code: SymphonyPromptContractErrorCode,
    message: string,
    options: {
      promptPath?: string | null;
      variables?: string[];
      cause?: unknown;
    } = {}
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "SymphonyPromptContractError";
    this.code = code;
    this.promptPath = options.promptPath ?? null;
    this.variables = options.variables ?? [];
  }
}

export function defaultSymphonyPromptContractPath(
  repoRoot = process.cwd()
): string {
  return path.join(repoRoot, defaultSymphonyPromptContractRelativePath);
}

export function loadSymphonyPromptContract(
  input: string | SymphonyPromptContractLoadOptions
): SymphonyLoadedPromptContract {
  const repoRoot =
    typeof input === "string"
      ? path.resolve(input)
      : path.resolve(input.repoRoot);
  const promptPath = resolvePromptContractPath(repoRoot, input);

  let template: string;
  try {
    template = readFileSync(promptPath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      throw new SymphonyPromptContractError(
        "missing_runtime_prompt",
        `Missing Symphony prompt contract: ${promptPath}`,
        {
          promptPath
        }
      );
    }

    throw error;
  }

  const { variables } = validateSymphonyPromptContract(template, {
    promptPath
  });

  return {
    repoRoot,
    promptPath,
    template,
    variables
  };
}

export function validateSymphonyPromptContract(
  template: string,
  options: SymphonyPromptContractValidationOptions = {}
): {
  variables: string[];
} {
  const promptPath = options.promptPath ?? null;
  const variables = parsePromptContractVariables(template, promptPath);

  try {
    renderSymphonyPromptContract({
      template,
      payload: options.payload ?? buildMockSymphonyPromptContractPayload(),
      promptPath
    });
  } catch (error) {
    if (error instanceof SymphonyPromptContractError) {
      throw new SymphonyPromptContractError(
        "invalid_runtime_prompt",
        `Invalid Symphony prompt contract${
          promptPath ? ` at ${promptPath}` : ""
        }: ${error.message}`,
        {
          promptPath,
          variables,
          cause: error
        }
      );
    }

    throw error;
  }

  return {
    variables
  };
}

export function renderSymphonyPromptContract(input: {
  template: string;
  payload: SymphonyPromptContractPayload;
  promptPath?: string | null;
}): string {
  const promptPath = input.promptPath ?? null;
  const segments = parsePromptContractSegments(input.template, promptPath);
  const scope = buildPromptContractScope(input.payload);
  const rendered = segments
    .map((segment) => {
      if (segment.kind === "text") {
        return segment.value;
      }

      const resolved = resolveTemplatePath(scope, segment.value);
      if (resolved === undefined) {
        throw new SymphonyPromptContractError(
          "runtime_prompt_render_failed",
          `Unknown prompt contract variable: ${segment.value}`,
          {
            promptPath,
            variables: [segment.value]
          }
        );
      }

      if (resolved === null) {
        return "";
      }

      return String(resolved);
    })
    .join("");

  if (rendered.trim() === "") {
    throw new SymphonyPromptContractError(
      "runtime_prompt_render_failed",
      "Prompt contract rendered an empty prompt.",
      {
        promptPath
      }
    );
  }

  const withFallbackReworkHandoff = appendFallbackReworkHandoff(
    rendered,
    input.payload.handoff_section ??
      buildPromptHandoffSection(input.payload),
    segments
  );

  return appendSymphonyHarnessPromptAppendix(withFallbackReworkHandoff);
}

export function buildMockSymphonyPromptContractPayload(): SymphonyPromptContractPayload {
  return {
    issue: {
      id: "issue-id",
      identifier: "ENG-123",
      title: "Ship runtime contract boundary",
      description: "Use the repo-owned .symphony/prompt.md template contract.",
      state: "In Progress",
      labels: ["runtime", "automation"],
      url: "https://linear.app/symphony/issue/ENG-123",
      branch_name: "codex/runtime-contract-boundary"
    },
    repo: {
      default_branch: "main",
      name: "symphony"
    },
    run: {
      id: "run-123"
    },
    workspace: {
      path: "/workspace/symphony",
      branch: "codex/runtime-contract-boundary"
    },
    attempt: 1,
    run_mode: "implementation",
    run_mode_section: null,
    handoff_section: null,
    rework_handoff: null
  };
}

function buildPromptContractScope(
  payload: SymphonyPromptContractPayload
): Record<string, unknown> {
  const handoffSection =
    payload.handoff_section ?? buildPromptHandoffSection(payload);
  const runModeSection = payload.run_mode_section ?? buildPromptRunModeSection(payload);

  return {
    ...payload,
    handoff_section: handoffSection,
    issue: {
      ...payload.issue,
      branchName: payload.issue.branch_name
    },
    repo: {
      ...payload.repo,
      defaultBranch: payload.repo.default_branch
    },
    run_mode_section: runModeSection
  };
}

function appendSymphonyHarnessPromptAppendix(rendered: string): string {
  if (rendered.includes(symphonyHarnessPromptAppendix)) {
    return rendered;
  }

  return `${rendered.trimEnd()}\n\n${symphonyHarnessPromptAppendix}\n`;
}

function appendFallbackReworkHandoff(
  rendered: string,
  handoffSection: string | null,
  segments: Array<
    | {
        kind: "text";
        value: string;
      }
    | {
        kind: "expression";
        value: string;
      }
  >
): string {
  const normalizedHandoff = handoffSection?.trim() ?? "";
  if (normalizedHandoff === "") {
    return rendered;
  }

  const templateIncludesHandoff = segments.some(
    (segment) =>
      segment.kind === "expression" &&
      (segment.value === "rework_handoff" || segment.value === "handoff_section")
  );
  if (templateIncludesHandoff || rendered.includes(normalizedHandoff)) {
    return rendered;
  }

  return `${rendered.trimEnd()}\n\n${normalizedHandoff}\n`;
}

function buildPromptRunModeSection(
  payload: SymphonyPromptContractPayload
): string {
  const runMode = payload.run_mode;

  if (runMode === "rework") {
    return [
      "Current run mode: Rework",
      "- Read the latest Linear rework note and any relevant GitHub review comment context first.",
      "- Address the requested feedback before taking on any new work.",
      "- Keep the patch scoped to the requested revisions."
    ].join("\n");
  }

  if (runMode === "approved_merge") {
    return [
      "Current run mode: Approved Merge",
      "- This run is for merge completion, not normal feature development.",
      "- Update the branch from the latest `main` and resolve conflicts conservatively.",
      "- Run the required verification and merge only if the branch is clean.",
      "- If the merge succeeds, report it with `pnpm exec symphony tool merge-result --status merged ...`.",
      "- If conflicts or verification failures cannot be resolved safely, report the blocked result with `pnpm exec symphony tool merge-result --status blocked ...`."
    ].join("\n");
  }

  return [
    "Current run mode: Implementation",
    "- Complete the requested ticket work in the current workspace.",
    "- Keep the patch targeted and move directly toward a review-ready result."
  ].join("\n");
}

function buildPromptHandoffSection(
  payload: SymphonyPromptContractPayload
): string {
  return payload.rework_handoff ?? "";
}

function resolvePromptContractPath(
  repoRoot: string,
  input: string | SymphonyPromptContractLoadOptions
): string {
  if (typeof input === "string" || !input.promptPath) {
    return defaultSymphonyPromptContractPath(repoRoot);
  }

  return path.isAbsolute(input.promptPath)
    ? input.promptPath
    : path.join(repoRoot, input.promptPath);
}

function parsePromptContractVariables(
  template: string,
  promptPath: string | null
): string[] {
  return parsePromptContractSegments(template, promptPath).flatMap((segment) =>
    segment.kind === "expression" ? [segment.value] : []
  );
}

function parsePromptContractSegments(
  template: string,
  promptPath: string | null
): Array<
  | {
      kind: "text";
      value: string;
    }
  | {
      kind: "expression";
      value: string;
    }
> {
  const segments: Array<
    | {
        kind: "text";
        value: string;
      }
    | {
        kind: "expression";
        value: string;
      }
  > = [];
  let cursor = 0;

  while (cursor < template.length) {
    const closeIndex = template.indexOf("}}", cursor);
    const openIndex = template.indexOf("{{", cursor);

    if (closeIndex !== -1 && (openIndex === -1 || closeIndex < openIndex)) {
      throw new SymphonyPromptContractError(
        "invalid_runtime_prompt",
        buildPromptSyntaxMessage(
          "Found closing template delimiter without an opening delimiter.",
          promptPath
        ),
        {
          promptPath
        }
      );
    }

    if (openIndex === -1) {
      segments.push({
        kind: "text",
        value: template.slice(cursor)
      });
      break;
    }

    const nextCloseIndex = template.indexOf("}}", openIndex + 2);
    if (nextCloseIndex === -1) {
      throw new SymphonyPromptContractError(
        "invalid_runtime_prompt",
        buildPromptSyntaxMessage(
          "Found an opening template delimiter without a closing delimiter.",
          promptPath
        ),
        {
          promptPath
        }
      );
    }

    if (openIndex > cursor) {
      segments.push({
        kind: "text",
        value: template.slice(cursor, openIndex)
      });
    }

    const expression = template.slice(openIndex + 2, nextCloseIndex).trim();
    if (expression === "") {
      throw new SymphonyPromptContractError(
        "invalid_runtime_prompt",
        buildPromptSyntaxMessage("Template expressions must not be empty.", promptPath),
        {
          promptPath
        }
      );
    }

    segments.push({
      kind: "expression",
      value: expression
    });
    cursor = nextCloseIndex + 2;
  }

  return segments;
}

function buildPromptSyntaxMessage(
  message: string,
  promptPath: string | null
): string {
  return `${message}${promptPath ? ` (${promptPath})` : ""}`;
}

function resolveTemplatePath(
  root: Record<string, unknown>,
  expression: string
): unknown {
  const pathSegments = expression
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment !== "");

  let current: unknown = root;

  for (const pathSegment of pathSegments) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[pathSegment];
  }

  return current;
}

function isMissingFileError(
  error: unknown
): error is Error & {
  code?: string;
} {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
