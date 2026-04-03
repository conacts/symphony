import { readFileSync } from "node:fs";
import path from "node:path";

export const defaultSymphonyPromptContractRelativePath = ".symphony/prompt.md";

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

  return rendered;
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
    attempt: 1
  };
}

function buildPromptContractScope(
  payload: SymphonyPromptContractPayload
): Record<string, unknown> {
  return {
    ...payload,
    issue: {
      ...payload.issue,
      branchName: payload.issue.branch_name
    },
    repo: {
      ...payload.repo,
      defaultBranch: payload.repo.default_branch
    }
  };
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
