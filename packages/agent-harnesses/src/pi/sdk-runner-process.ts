import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { Cause, Duration, Effect, Exit, Queue } from "effect";
import { ensureWorkspaceCwd } from "../shared/workspace-cwd.js";
import {
  attachLineBuffer,
  logNonJsonStreamLine,
  protocolMessageCandidate,
  safeJsonParse
} from "../shared/protocol.js";
import {
  HarnessSessionError,
  type HarnessLaunchSessionInput,
  type HarnessSessionLogger
} from "../shared/session-types.js";
import { buildPiSdkRunnerSpawnSpec } from "./launch.js";
import {
  parsePiSdkRunnerCommand,
  parsePiSdkRunnerEvent,
  type PiSdkRunnerCommand,
  type PiSdkRunnerEvent,
} from "./sdk-runner-contract.js";

type PiSdkRunnerChildProcess = {
  stdout: ChildProcessWithoutNullStreams["stdout"];
  stderr: ChildProcessWithoutNullStreams["stderr"];
  stdin: ChildProcessWithoutNullStreams["stdin"];
  kill: ChildProcessWithoutNullStreams["kill"];
  once(
    event: "exit",
    listener: (code: number | null, signal: string | null) => void
  ): PiSdkRunnerChildProcess;
  once(
    event: "error",
    listener: (error: Error) => void
  ): PiSdkRunnerChildProcess;
  pid?: ChildProcessWithoutNullStreams["pid"];
};

type SpawnSpec = {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  hostLaunchPath: string;
  runtimeWorkspacePath: string;
  runtimeWorkspaceRoot?: string;
};

type PiSdkRunnerState = {
  child: PiSdkRunnerChildProcess;
  eventQueue: ReturnType<typeof createRunnerEventQueue>;
  closed: boolean;
  recentStdoutLines: string[];
  recentStderrLines: string[];
};

export class PiSdkRunnerProcess {
  readonly #state: PiSdkRunnerState;
  readonly processId: string | null;

  constructor(
    child: PiSdkRunnerChildProcess,
    logger: HarnessSessionLogger
  ) {
    this.#state = {
      child,
      eventQueue: createRunnerEventQueue(),
      closed: false,
      recentStdoutLines: [],
      recentStderrLines: []
    };
    this.processId = child.pid ? String(child.pid) : null;
    this.attachProcessHandlers(logger);
  }

  static async start(
    input: HarnessLaunchSessionInput,
    options?: {
      spawnSpecOverride?: SpawnSpec;
    }
  ): Promise<{
    process: PiSdkRunnerProcess;
    hostLaunchPath: string;
    runtimeWorkspacePath: string;
    runtimeWorkspaceRoot: string;
  }> {
    if (input.launchTarget.kind !== "container") {
      throw new HarnessSessionError(
        "pi_sdk_runner_launch_unsupported",
        "Pi SDK runner currently requires a container-backed launch target."
      );
    }

    const defaultSpec = buildPiSdkRunnerSpawnSpec({
      launchTarget: input.launchTarget,
      env: input.env,
      hostCommandEnvSource: input.hostCommandEnvSource ?? {}
    });

    const spawnSpec = options?.spawnSpecOverride ?? defaultSpec;
    const hostLaunchPath = await ensureWorkspaceCwd(
      spawnSpec.hostLaunchPath,
      input.runtimePolicy.workspace.root
    );
    input.logger.debug("Starting Pi SDK runner process", {
      command: spawnSpec.command,
      args: spawnSpec.args,
      cwd: hostLaunchPath
    });

    const child = spawn(spawnSpec.command, spawnSpec.args, {
      cwd: hostLaunchPath,
      env: spawnSpec.env,
      stdio: "pipe"
    });
    const process = new PiSdkRunnerProcess(child, input.logger);

    return {
      process,
      hostLaunchPath,
      runtimeWorkspacePath: spawnSpec.runtimeWorkspacePath,
      runtimeWorkspaceRoot:
        spawnSpec.runtimeWorkspaceRoot ?? spawnSpec.runtimeWorkspacePath
    };
  }

  close(): void {
    if (this.#state.closed) {
      return;
    }

    this.#state.closed = true;
    this.#state.child.kill("SIGTERM");
  }

  sendCommand(command: PiSdkRunnerCommand): void {
    this.#state.child.stdin.write(`${JSON.stringify(command)}\n`);
  }

  async awaitEvent(timeoutMs: number): Promise<PiSdkRunnerEvent> {
    const exit = await Effect.runPromiseExit(
      Effect.timeoutFail(Queue.take(this.#state.eventQueue), {
        duration: Duration.millis(timeoutMs),
        onTimeout: () =>
          new HarnessSessionError(
            "pi_sdk_runner_timeout",
            `Timed out waiting for Pi SDK runner event after ${timeoutMs}ms.`,
            this.diagnosticsSnapshot()
          )
      })
    );

    if (Exit.isSuccess(exit)) {
      return exit.value;
    }

    throw Cause.squash(exit.cause);
  }

  diagnosticsSnapshot(): Record<string, unknown> {
    return {
      processId: this.processId,
      recentStdoutLines: [...this.#state.recentStdoutLines],
      recentStderrLines: [...this.#state.recentStderrLines]
    };
  }

  private attachProcessHandlers(logger: HarnessSessionLogger): void {
    attachLineBuffer(this.#state.child.stdout, (line) => {
      this.handleLine(line, logger, "stdout");
    });
    attachLineBuffer(this.#state.child.stderr, (line) => {
      this.handleLine(line, logger, "stderr");
    });

    this.#state.child.once("exit", (code, signal) => {
      this.#state.closed = true;
      const reason = signal ? `signal:${signal}` : `code:${code ?? "unknown"}`;
      const event: PiSdkRunnerEvent = {
        schemaVersion: "1",
        eventType: "runner_error",
        sequence: Number.MAX_SAFE_INTEGER,
        recordedAt: new Date().toISOString(),
        runId: "runner-process-exit",
        failureClass: "runtime_crash",
        reason: `Pi SDK runner process exited (${reason}).`
      };
      this.enqueueEvent(event);
    });

    this.#state.child.once("error", (error) => {
      this.#state.closed = true;
      const event: PiSdkRunnerEvent = {
        schemaVersion: "1",
        eventType: "runner_error",
        sequence: Number.MAX_SAFE_INTEGER - 1,
        recordedAt: new Date().toISOString(),
        runId: "runner-process-error",
        failureClass: "runner_startup_failure",
        reason: error instanceof Error ? error.message : String(error)
      };
      this.enqueueEvent(event);
    });
  }

  private handleLine(
    line: string,
    logger: HarnessSessionLogger,
    stream: "stdout" | "stderr"
  ): void {
    this.recordRecentLine(stream, line);

    if (!protocolMessageCandidate(line)) {
      logNonJsonStreamLine(logger, line, stream);
      return;
    }

    const parsed = safeJsonParse(line);
    if (!parsed) {
      logNonJsonStreamLine(logger, line, stream);
      return;
    }

    if (stream === "stderr") {
      try {
        parsePiSdkRunnerCommand(parsed);
        return;
      } catch {
        // Fall through. The runner writes only events to stdout, but stderr may
        // still contain structured diagnostics that are not part of the bridge.
      }
    }

    try {
      const event = parsePiSdkRunnerEvent(parsed);
      this.enqueueEvent(event);
    } catch (error) {
      logger.warn("Ignoring malformed Pi SDK runner event.", {
        line,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private enqueueEvent(event: PiSdkRunnerEvent): void {
    Effect.runSync(Queue.offer(this.#state.eventQueue, event));
  }

  private recordRecentLine(stream: "stdout" | "stderr", line: string): void {
    const target =
      stream === "stdout"
        ? this.#state.recentStdoutLines
        : this.#state.recentStderrLines;
    target.push(line);
    if (target.length > 20) {
      target.shift();
    }
  }
}

function createRunnerEventQueue() {
  return Effect.runSync(Queue.unbounded<PiSdkRunnerEvent>());
}
