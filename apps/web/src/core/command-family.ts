export type ClassifiedCommand = {
  tool: string;
  family: string;
  displayLabel: string;
};

const SHELL_FLAGS = new Set(["-c", "-lc", "--command"]);
const ENV_FLAGS_WITH_VALUE = new Set(["-S", "--split-string", "-u", "--unset"]);
const SHELL_PREAMBLE_COMMANDS = new Set([
  "source",
  ".",
  "cd",
  "export",
  "set",
  "unset",
  "alias",
  "trap",
  "umask"
]);
const COMMAND_PREFIX_WRAPPERS = new Set(["exec", "command", "builtin", "nohup", "time"]);

const COMMAND_FAMILY_BY_TOOL: Record<string, string> = {
  python: "python",
  python3: "python",
  py: "python",
  node: "node",
  npx: "node",
  pnpm: "pnpm",
  npm: "npm",
  bun: "bun",
  git: "git",
  gh: "gh",
  rg: "rg",
  grep: "grep",
  sed: "sed",
  awk: "awk",
  find: "find",
  ls: "ls",
  cat: "cat",
  cp: "cp",
  mv: "mv",
  rm: "rm",
  mkdir: "mkdir",
  chmod: "chmod",
  curl: "curl",
  wget: "wget",
  jq: "jq",
  docker: "docker",
  "docker-compose": "docker_compose",
  vercel: "vercel",
  tsc: "tsc",
  eslint: "eslint",
  prettier: "prettier",
  vitest: "vitest",
  jest: "jest",
  pytest: "pytest",
  go: "go",
  cargo: "cargo",
  ruby: "ruby",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell"
};

export function classifyCommand(command: string): ClassifiedCommand {
  const trimmed = command.trim();

  if (trimmed.length === 0) {
    return {
      tool: "unknown",
      family: "other",
      displayLabel: "unknown"
    };
  }

  return classifyCommandTokens(tokenizeCommand(trimmed), trimmed);
}

export function formatCommandFamilyLabel(value: string): string {
  if (value === "docker_compose") {
    return "docker compose";
  }

  return value.replaceAll("_", " ");
}

function classifyCommandTokens(tokens: string[], fallbackLabel: string): ClassifiedCommand {
  const startIndex = skipEnvironmentPrefix(tokens);
  const executable = normalizeExecutable(tokens[startIndex] ?? "");

  if (!executable) {
    return {
      tool: "unknown",
      family: "other",
      displayLabel: fallbackLabel
    };
  }

  if (isShellExecutable(executable)) {
    const nestedCommand = extractNestedShellCommand(tokens, startIndex);

    if (nestedCommand) {
      const unwrappedNestedCommand = unwrapShellCommand(nestedCommand);

      if (unwrappedNestedCommand) {
        return classifyCommand(unwrappedNestedCommand);
      }
    }
  }

  if (COMMAND_PREFIX_WRAPPERS.has(executable)) {
    const nestedCommand = unwrapShellSegment(tokens.slice(startIndex + 1).join(" "));

    if (nestedCommand) {
      return classifyCommand(nestedCommand);
    }
  }

  if (
    executable === "docker" &&
    stripWrappingQuotes(tokens[startIndex + 1] ?? "") === "compose"
  ) {
    return {
      tool: "docker compose",
      family: "docker_compose",
      displayLabel: "docker compose"
    };
  }

  return {
    tool: executable,
    family: COMMAND_FAMILY_BY_TOOL[executable] ?? "other",
    displayLabel: executable
  };
}

function tokenizeCommand(command: string): string[] {
  return command.match(/'[^']*'|"[^"]*"|\S+/g) ?? [];
}

function skipEnvironmentPrefix(tokens: string[]) {
  let index = 0;

  if (normalizeExecutable(tokens[index] ?? "") === "env") {
    index += 1;

    while (index < tokens.length) {
      const token = stripWrappingQuotes(tokens[index] ?? "");

      if (token === "--") {
        index += 1;
        break;
      }

      if (ENV_FLAGS_WITH_VALUE.has(token)) {
        index += 2;
        continue;
      }

      if (token.startsWith("-")) {
        index += 1;
        continue;
      }

      break;
    }
  }

  while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(stripWrappingQuotes(tokens[index] ?? ""))) {
    index += 1;
  }

  return index;
}

function stripWrappingQuotes(token: string) {
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    return token.slice(1, -1);
  }

  return token;
}

function isShellExecutable(value: string) {
  return value === "sh" || value === "bash" || value === "zsh" || value === "fish";
}

function normalizeExecutable(token: string) {
  const unwrapped = stripWrappingQuotes(token).trim().toLowerCase();

  if (unwrapped.length === 0) {
    return "";
  }

  const normalized = unwrapped.endsWith("/") ? unwrapped.slice(0, -1) : unwrapped;
  const pathSegments = normalized.split("/");

  return pathSegments[pathSegments.length - 1] ?? normalized;
}

function extractNestedShellCommand(tokens: string[], startIndex: number) {
  for (let index = startIndex + 1; index < tokens.length; index += 1) {
    const token = stripWrappingQuotes(tokens[index] ?? "");

    if (SHELL_FLAGS.has(token)) {
      return stripWrappingQuotes(tokens[index + 1] ?? "");
    }
  }

  return null;
}

function unwrapShellCommand(command: string) {
  const segments = splitShellSegments(command);

  for (const segment of segments) {
    const candidate = unwrapShellSegment(segment);

    if (candidate) {
      return candidate;
    }
  }

  return command.trim();
}

function unwrapShellSegment(segment: string): string | null {
  let current = segment.trim();

  while (current.length > 0) {
    const tokens = tokenizeCommand(current);
    const startIndex = skipEnvironmentPrefix(tokens);
    const executable = normalizeExecutable(tokens[startIndex] ?? "");

    if (!executable) {
      return null;
    }

    if (SHELL_PREAMBLE_COMMANDS.has(executable)) {
      return null;
    }

    if (COMMAND_PREFIX_WRAPPERS.has(executable)) {
      current = tokens.slice(startIndex + 1).join(" ").trim();
      continue;
    }

    return current;
  }

  return null;
}

function splitShellSegments(command: string): string[] {
  const segments: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escapeNext = false;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index] ?? "";
    const nextCharacter = command[index + 1] ?? "";

    if (escapeNext) {
      current += character;
      escapeNext = false;
      continue;
    }

    if (character === "\\" && quote !== "'") {
      current += character;
      escapeNext = true;
      continue;
    }

    if (quote) {
      current += character;

      if (character === quote) {
        quote = null;
      }

      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      current += character;
      continue;
    }

    if (
      character === ";" ||
      character === "\n" ||
      (character === "&" && nextCharacter === "&") ||
      (character === "|" && nextCharacter === "|")
    ) {
      const trimmed = current.trim();

      if (trimmed.length > 0) {
        segments.push(trimmed);
      }

      current = "";

      if (
        (character === "&" && nextCharacter === "&") ||
        (character === "|" && nextCharacter === "|")
      ) {
        index += 1;
      }

      continue;
    }

    current += character;
  }

  const trimmed = current.trim();

  if (trimmed.length > 0) {
    segments.push(trimmed);
  }

  return segments;
}
