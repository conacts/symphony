import { describe, expect, it, vi } from "vitest";
import { createDockerWorkspaceSessionManager } from "./session-manager.js";

describe("docker workspace session manager", () => {
  it("runs shell commands inside the configured container session", async () => {
    const commandRunner = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: "ok\n",
      stderr: ""
    });
    const manager = createDockerWorkspaceSessionManager({
      commandRunner
    });

    const result = await manager
      .openContainerSession({
        containerName: "workspace-123",
        workspacePath: "/workspace",
        shell: "bash",
        user: "1000:1000",
        baseEnv: {
          HOME: "/home/agent"
        }
      })
      .runShellCommand({
        command: "pnpm test",
        cwd: "/workspace/apps/api",
        timeoutMs: 15_000,
        env: {
          OPENAI_API_KEY: "test-key",
          EMPTY_VALUE: ""
        },
        metadata: {
          operation: "unit_test"
        }
      });

    expect(result).toEqual({
      exitCode: 0,
      stdout: "ok\n",
      stderr: ""
    });
    expect(commandRunner).toHaveBeenCalledWith({
      args: [
        "exec",
        "--user",
        "1000:1000",
        "--env",
        "HOME=/home/agent",
        "--env",
        "OPENAI_API_KEY=test-key",
        "--workdir",
        "/workspace/apps/api",
        "workspace-123",
        "bash",
        "-lc",
        "pnpm test"
      ],
      timeoutMs: 15_000
    });
  });

  it("emits started and failure events through the configured sink", async () => {
    const events: Array<{ type: string; exitCode?: number }> = [];
    const commandRunner = vi.fn().mockResolvedValue({
      exitCode: 17,
      stdout: "failed output",
      stderr: "failed stderr"
    });
    const manager = createDockerWorkspaceSessionManager({
      commandRunner,
      sink(event) {
        events.push({
          type: event.type,
          ...("exitCode" in event ? { exitCode: event.exitCode } : {})
        });
      }
    });

    const session = manager.openContainerSession({
      containerName: "workspace-456",
      workspacePath: "/workspace",
      shell: "sh",
      user: "1000:1000"
    });

    await session.runShellCommand({
      command: "false",
      timeoutMs: 5_000
    });

    expect(events).toEqual([
      {
        type: "command_started"
      },
      {
        type: "command_failed",
        exitCode: 17
      }
    ]);
    expect(session.containerName).toBe("workspace-456");
    expect(session.workspacePath).toBe("/workspace");
  });
});
