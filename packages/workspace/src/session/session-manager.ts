import {
  dockerEnvFlags,
  dockerUserFlags
} from "../docker-client.js";
import type {
  DockerWorkspaceCommandResult,
  DockerWorkspaceCommandRunner
} from "../docker-shared.js";
import { BaseWorkspaceSession } from "./base-workspace-session.js";
import type { WorkspaceSessionCommandMetadata } from "./session-events.js";
import type { WorkspaceSessionEventSink } from "./session-sinks.js";

export type WorkspaceShellCommandInput = {
  command: string;
  timeoutMs: number;
  cwd?: string;
  env?: Record<string, string | undefined>;
  metadata?: WorkspaceSessionCommandMetadata;
};

export type DockerContainerWorkspaceSessionInput = {
  containerName: string;
  workspacePath: string;
  shell: string;
  user: string;
  baseEnv?: Record<string, string>;
};

export type DockerWorkspaceSessionManager = {
  openContainerSession(
    input: DockerContainerWorkspaceSessionInput
  ): DockerContainerWorkspaceSession;
};

export function createDockerWorkspaceSessionManager(input: {
  commandRunner: DockerWorkspaceCommandRunner;
  sink?: WorkspaceSessionEventSink;
}): DockerWorkspaceSessionManager {
  return {
    openContainerSession(sessionInput) {
      return new DockerContainerWorkspaceSession({
        commandRunner: input.commandRunner,
        sink: input.sink,
        ...sessionInput
      });
    }
  };
}

export class DockerContainerWorkspaceSession extends BaseWorkspaceSession {
  readonly #commandRunner: DockerWorkspaceCommandRunner;
  readonly #containerName: string;
  readonly #workspacePath: string;
  readonly #shell: string;
  readonly #user: string;
  readonly #baseEnv: Record<string, string>;

  constructor(input: {
    commandRunner: DockerWorkspaceCommandRunner;
    sink?: WorkspaceSessionEventSink;
    containerName: string;
    workspacePath: string;
    shell: string;
    user: string;
    baseEnv?: Record<string, string>;
  }) {
    super({
      kind: "docker_container",
      sink: input.sink
    });
    this.#commandRunner = input.commandRunner;
    this.#containerName = input.containerName;
    this.#workspacePath = input.workspacePath;
    this.#shell = input.shell;
    this.#user = input.user;
    this.#baseEnv = input.baseEnv ?? {};
  }

  get containerName(): string {
    return this.#containerName;
  }

  get workspacePath(): string {
    return this.#workspacePath;
  }

  async runShellCommand(
    input: WorkspaceShellCommandInput
  ): Promise<DockerWorkspaceCommandResult> {
    const cwd = input.cwd ?? this.#workspacePath;
    const env = normalizeStringEnv({
      ...this.#baseEnv,
      ...(input.env ?? {})
    });
    const recordedAt = new Date().toISOString();
    const startedAtMs = Date.now();

    await this.emitSessionEvent({
      type: "command_started",
      sessionKind: this.sessionKind,
      containerName: this.#containerName,
      workspacePath: this.#workspacePath,
      cwd,
      shell: this.#shell,
      user: this.#user,
      command: input.command,
      timeoutMs: input.timeoutMs,
      envKeys: Object.keys(env).sort(),
      metadata: input.metadata ?? null,
      recordedAt
    });

    const result = await this.#commandRunner({
      args: [
        "exec",
        ...dockerUserFlags(this.#user),
        ...dockerEnvFlags(env),
        "--workdir",
        cwd,
        this.#containerName,
        this.#shell,
        "-lc",
        input.command
      ],
      timeoutMs: input.timeoutMs
    });

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startedAtMs;

    await this.emitSessionEvent({
      type: result.exitCode === 0 ? "command_completed" : "command_failed",
      sessionKind: this.sessionKind,
      containerName: this.#containerName,
      workspacePath: this.#workspacePath,
      cwd,
      shell: this.#shell,
      user: this.#user,
      command: input.command,
      timeoutMs: input.timeoutMs,
      envKeys: Object.keys(env).sort(),
      metadata: input.metadata ?? null,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs,
      recordedAt: completedAt
    });

    return result;
  }
}

function normalizeStringEnv(
  env: Record<string, string | undefined>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && entry[1] !== ""
    )
  );
}
