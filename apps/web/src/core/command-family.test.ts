import { describe, expect, it } from "vitest";
import { classifyCommand } from "./command-family";

describe("classifyCommand", () => {
  it("classifies direct commands by executable", () => {
    expect(classifyCommand("pnpm test")).toMatchObject({
      tool: "pnpm",
      family: "pnpm",
      displayLabel: "pnpm"
    });
  });

  it("unwraps absolute shell paths with -lc", () => {
    expect(classifyCommand("/bin/bash -lc 'pnpm test'")).toMatchObject({
      tool: "pnpm",
      family: "pnpm",
      displayLabel: "pnpm"
    });
  });

  it("unwraps env-prefixed shell commands", () => {
    expect(
      classifyCommand("/usr/bin/env OPENROUTER_API_KEY=test /bin/bash -lc 'pnpm test'")
    ).toMatchObject({
      tool: "pnpm",
      family: "pnpm",
      displayLabel: "pnpm"
    });
  });

  it("skips shell preamble commands before the real tool", () => {
    expect(
      classifyCommand("/bin/bash -lc 'source ~/.bashrc && pnpm --filter @symphony/web test'")
    ).toMatchObject({
      tool: "pnpm",
      family: "pnpm",
      displayLabel: "pnpm"
    });
  });

  it("unwraps shell-wrapped directory changes and exports", () => {
    expect(
      classifyCommand(
        "/bin/sh -lc 'cd /repo && export CI=1; python3 scripts/report.py'"
      )
    ).toMatchObject({
      tool: "python3",
      family: "python",
      displayLabel: "python3"
    });
  });

  it("unwraps shell command wrappers like exec and command", () => {
    expect(
      classifyCommand("bash --noprofile --norc -lc 'command gh pr status'")
    ).toMatchObject({
      tool: "gh",
      family: "gh",
      displayLabel: "gh"
    });

    expect(classifyCommand("sh -lc 'exec npm run build'")).toMatchObject({
      tool: "npm",
      family: "npm",
      displayLabel: "npm"
    });
  });

  it("preserves docker compose as its own family through wrappers", () => {
    expect(classifyCommand("bash -lc 'time docker compose ps'")).toMatchObject({
      tool: "docker compose",
      family: "docker_compose",
      displayLabel: "docker compose"
    });
  });
});
