import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { PiSdkRunnerProcess } from "./sdk-runner-process.js";

function createLogger() {
  return {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}

function createFakeChildProcess() {
  const emitter = new EventEmitter();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new PassThrough();
  const kill = vi.fn();
  const child: ConstructorParameters<typeof PiSdkRunnerProcess>[0] = {
    stdout,
    stderr,
    stdin,
    pid: 4321,
    kill,
    once(event, listener) {
      emitter.once(event, listener);
      return child;
    }
  };

  return {
    child,
    stdout,
    stderr,
    stdin,
    kill,
    emitExit(code: number | null, signal: string | null = null) {
      emitter.emit("exit", code, signal);
    },
    emitError(error: Error) {
      emitter.emit("error", error);
    }
  };
}

describe("pi sdk runner process", () => {
  it("buffers parsed events emitted before awaitEvent is called", async () => {
    const logger = createLogger();
    const fakeChild = createFakeChildProcess();
    const process = new PiSdkRunnerProcess(fakeChild.child, logger);

    fakeChild.stdout.write(
      `${JSON.stringify({
        schemaVersion: "1",
        eventType: "session_started",
        sequence: 1,
        recordedAt: "2026-04-14T22:00:00.000Z",
        runId: "sdk-bootstrap-run",
        sessionId: "session-1",
        threadId: "thread-1",
        modelId: "xiaomi/mimo-v2-pro",
        cwd: "/workspace"
      })}\n`
    );

    const event = await process.awaitEvent(50);

    expect(event).toMatchObject({
      eventType: "session_started",
      sessionId: "session-1",
      threadId: "thread-1"
    });
  });

  it("converts child exits into queued runner_error events", async () => {
    const logger = createLogger();
    const fakeChild = createFakeChildProcess();
    const process = new PiSdkRunnerProcess(fakeChild.child, logger);

    fakeChild.emitExit(9);

    const event = await process.awaitEvent(50);

    expect(event).toMatchObject({
      eventType: "runner_error",
      failureClass: "runtime_crash",
      reason: "Pi SDK runner process exited (code:9)."
    });
  });

  it("times out with recent diagnostics when no event arrives", async () => {
    const logger = createLogger();
    const fakeChild = createFakeChildProcess();
    const process = new PiSdkRunnerProcess(fakeChild.child, logger);

    fakeChild.stderr.write("fatal: bridge stayed silent\n");

    await expect(process.awaitEvent(10)).rejects.toMatchObject({
      name: "HarnessSessionError",
      code: "pi_sdk_runner_timeout",
      detail: expect.objectContaining({
        processId: "4321",
        recentStderrLines: ["fatal: bridge stayed silent"]
      })
    });
  });
});
