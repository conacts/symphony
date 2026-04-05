import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { ensureWorkspaceCwd } from "../codex/launch.js";
import {
  attachLineBuffer,
  getString,
  logNonJsonStreamLine,
  protocolMessageCandidate,
  safeJsonParse
} from "../shared/protocol.js";
import {
  type HarnessLaunchSessionInput,
  HarnessSessionError
} from "../shared/session-types.js";
import { resolveHarnessModelRuntimePolicy } from "../shared/runtime-policy.js";

type PendingResponse = {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
};

type PiRpcState = {
  child: ChildProcessWithoutNullStreams;
  pendingResponses: Map<string, PendingResponse>;
  queuedEvents: Record<string, unknown>[];
  eventWaiters: Array<(event: Record<string, unknown>) => void>;
  nextRequestId: number;
  closed: boolean;
};

export type PiLaunchSettings = {
  model: string;
  reasoningEffort: string;
  providerId: string | null;
  providerName: string | null;
};

export class PiRpcProcess {
  readonly #state: PiRpcState;
  readonly processId: string | null;

  constructor(child: ChildProcessWithoutNullStreams) {
    this.#state = {
      child,
      pendingResponses: new Map(),
      queuedEvents: [],
      eventWaiters: [],
      nextRequestId: 1,
      closed: false
    };
    this.processId = child.pid ? String(child.pid) : null;
  }

  static async start(input: HarnessLaunchSessionInput): Promise<{
    process: PiRpcProcess;
    hostLaunchPath: string;
    launchSettings: PiLaunchSettings;
  }> {
    if (input.launchTarget.kind !== "container") {
      throw new HarnessSessionError(
        "pi_launch_unsupported",
        "Pi runtime currently requires a container-backed launch target."
      );
    }

    const hostLaunchPath = await ensureWorkspaceCwd(
      input.launchTarget.hostLaunchPath,
      input.runtimePolicy.workspace.root
    );
    const launchSettings = resolvePiLaunchSettings(input);
    const child = spawn("docker", buildPiRpcSpawnArgs(input, launchSettings), {
      cwd: hostLaunchPath,
      env: filterStringEnv(input.hostCommandEnvSource ?? {}),
      stdio: "pipe"
    });
    const process = new PiRpcProcess(child);
    process.attachProcessHandlers(input.logger);

    return {
      process,
      hostLaunchPath,
      launchSettings
    };
  }

  close(): void {
    if (this.#state.closed) {
      return;
    }

    this.#state.closed = true;
    this.#state.child.kill("SIGTERM");
  }

  async sendCommand(
    command: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const id = String(this.#state.nextRequestId++);
    const payload = {
      id,
      ...command
    };

    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      this.#state.pendingResponses.set(id, {
        resolve,
        reject
      });
      this.#state.child.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
        if (error) {
          this.#state.pendingResponses.delete(id);
          reject(error);
        }
      });
    });
  }

  async awaitEvent(timeoutMs: number): Promise<Record<string, unknown>> {
    if (this.#state.queuedEvents.length > 0) {
      return this.#state.queuedEvents.shift()!;
    }

    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      const waiter = (event: Record<string, unknown>) => {
        clearTimeout(timeout);
        resolve(event);
      };
      const timeout = setTimeout(() => {
        const index = this.#state.eventWaiters.indexOf(waiter);
        if (index >= 0) {
          this.#state.eventWaiters.splice(index, 1);
        }
        reject(
          new HarnessSessionError(
            "pi_turn_timeout",
            `Timed out waiting for Pi RPC events after ${timeoutMs}ms.`
          )
        );
      }, timeoutMs);

      this.#state.eventWaiters.push(waiter);
    });
  }

  private attachProcessHandlers(
    logger: HarnessLaunchSessionInput["logger"]
  ): void {
    attachLineBuffer(this.#state.child.stdout, (line) => {
      this.handleLine(line, logger, "stdout");
    });
    attachLineBuffer(this.#state.child.stderr, (line) => {
      this.handleLine(line, logger, "stderr");
    });

    this.#state.child.once("exit", (code, signal) => {
      this.#state.closed = true;
      const reason = signal ? `signal:${signal}` : `code:${code ?? "unknown"}`;

      for (const [, pending] of this.#state.pendingResponses) {
        pending.reject(new Error(`Pi RPC process exited (${reason}).`));
      }
      this.#state.pendingResponses.clear();

      this.enqueueEvent({
        type: "process_exit",
        reason
      });
    });
  }

  private handleLine(
    line: string,
    logger: HarnessLaunchSessionInput["logger"],
    stream: "stdout" | "stderr"
  ): void {
    if (!protocolMessageCandidate(line)) {
      logNonJsonStreamLine(logger, line, stream);
      return;
    }

    const record = safeJsonParse(line);
    if (!record) {
      logNonJsonStreamLine(logger, line, stream);
      return;
    }

    if (getString(record, "type") === "response") {
      const responseId = getString(record, "id");
      if (responseId) {
        const pending = this.#state.pendingResponses.get(responseId);
        if (pending) {
          this.#state.pendingResponses.delete(responseId);
          if (record.success === false) {
            pending.reject(
              new Error(getString(record, "error") ?? "Pi RPC command failed.")
            );
          } else {
            pending.resolve(record);
          }
          return;
        }
      }
    }

    this.enqueueEvent(record);
  }

  private enqueueEvent(event: Record<string, unknown>): void {
    const waiter = this.#state.eventWaiters.shift();
    if (waiter) {
      waiter(event);
      return;
    }

    this.#state.queuedEvents.push(event);
  }
}

export function resolvePiLaunchSettings(
  input: HarnessLaunchSessionInput
): PiLaunchSettings {
  const modelPolicy = resolveHarnessModelRuntimePolicy(input.runtimePolicy, "pi");
  return {
    model: modelPolicy.defaultModel ?? "xiaomi/mimo-v2-pro",
    reasoningEffort: normalizePiThinkingLevel(
      modelPolicy.defaultReasoningEffort ?? "medium"
    ),
    providerId: modelPolicy.provider?.id ?? null,
    providerName: modelPolicy.provider?.name ?? null
  };
}

function buildPiRpcSpawnArgs(
  input: HarnessLaunchSessionInput,
  launchSettings: PiLaunchSettings
): string[] {
  return [
    "exec",
    "-i",
    ...Object.entries(input.env).flatMap(([key, value]) => ["--env", `${key}=${value}`]),
    "--workdir",
    input.launchTarget.runtimeWorkspacePath,
    input.launchTarget.containerName,
    "pi",
    "--mode",
    "rpc",
    ...(launchSettings.providerId && !launchSettings.model.includes("/")
      ? ["--provider", launchSettings.providerId]
      : []),
    "--model",
    launchSettings.model,
    "--thinking",
    launchSettings.reasoningEffort,
    "--no-session"
  ];
}

function normalizePiThinkingLevel(value: string): string {
  if (["off", "minimal", "low", "medium", "high", "xhigh"].includes(value)) {
    return value;
  }

  return "medium";
}

function filterStringEnv(
  source: Record<string, string | undefined>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}
