import { describe, expect, it, vi } from "vitest";
import type { HarnessLaunchSessionInput, HarnessSession } from "../shared/session-types.js";

const { startSessionMock } = vi.hoisted(() => ({
  startSessionMock: vi.fn()
}));

vi.mock("./runner-client.js", () => ({
  PiRunnerClient: {
    startSession: startSessionMock
  }
}));

describe("pi runner", () => {
  it("exposes the stable Pi runner definition", async () => {
    const { createPiRunner } = await import("./runner.js");

    expect(createPiRunner()).toMatchObject({
      kind: "pi",
      definition: expect.objectContaining({
        kind: "pi",
        displayName: "Pi",
        implemented: true
      }),
      startSession: expect.any(Function)
    });
  });

  it("routes session startup through the Pi runner client", async () => {
    const session = {
      client: {} as never,
      threadId: "thread-1",
      workspacePath: "/tmp/workspace",
      hostLaunchPath: "/tmp/launch",
      hostWorkspacePath: "/tmp/workspace",
      launchTarget: {} as HarnessSession["launchTarget"],
      issue: {} as HarnessSession["issue"],
      processId: "process-1",
      autoApproveRequests: true,
      approvalPolicy: "never",
      model: "xiaomi/mimo-v2-pro",
      reasoningEffort: "high",
      profile: null,
      providerId: "openrouter",
      providerName: "OpenRouter"
    } satisfies HarnessSession;
    startSessionMock.mockResolvedValue(session);

    const input = {
      launchTarget: session.launchTarget,
      env: {},
      runtimePolicy: {} as HarnessLaunchSessionInput["runtimePolicy"],
      issue: session.issue,
      logger: {
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      }
    } satisfies HarnessLaunchSessionInput;

    const { createPiRunner } = await import("./runner.js");
    const runner = createPiRunner();

    await expect(runner.startSession(input)).resolves.toBe(session);
    expect(startSessionMock).toHaveBeenCalledWith(input);
  });
});
