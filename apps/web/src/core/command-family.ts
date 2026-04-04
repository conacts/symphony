export type ClassifiedCommand = {
  tool: string;
  family: string;
  displayLabel: string;
};

const SHELL_FLAGS = new Set(["-c", "-lc"]);

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

  const tokens = tokenizeCommand(trimmed);
  const startIndex = skipEnvironmentPrefix(tokens);
  const executable = stripWrappingQuotes(tokens[startIndex] ?? "").toLowerCase();

  if (!executable) {
    return {
      tool: "unknown",
      family: "other",
      displayLabel: trimmed
    };
  }

  if (isShellExecutable(executable)) {
    const shellFlagIndex = tokens.findIndex(
      (token, index) => index > startIndex && SHELL_FLAGS.has(stripWrappingQuotes(token))
    );

    if (shellFlagIndex >= 0) {
      const nestedCommand = stripWrappingQuotes(tokens[shellFlagIndex + 1] ?? "");

      if (nestedCommand) {
        return classifyCommand(nestedCommand);
      }
    }
  }

  if (executable === "docker" && stripWrappingQuotes(tokens[startIndex + 1] ?? "") === "compose") {
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

export function formatCommandFamilyLabel(value: string): string {
  if (value === "docker_compose") {
    return "docker compose";
  }

  return value.replaceAll("_", " ");
}

function tokenizeCommand(command: string): string[] {
  return command.match(/'[^']*'|"[^"]*"|\S+/g) ?? [];
}

function skipEnvironmentPrefix(tokens: string[]) {
  let index = 0;

  if (stripWrappingQuotes(tokens[index] ?? "") === "env") {
    index += 1;
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
