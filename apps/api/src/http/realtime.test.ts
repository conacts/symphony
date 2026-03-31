import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { createSymphonyRuntimeApplication } from "./app.js";
import type { SymphonyRuntimeTestHarness } from "../test-support/create-symphony-runtime-test-harness.js";
import { createSymphonyRuntimeTestHarness } from "../test-support/create-symphony-runtime-test-harness.js";

const harnesses: SymphonyRuntimeTestHarness[] = [];

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.cleanup()));
});

describe("@symphony/api realtime websocket", () => {
  it("acks subscriptions and pushes typed invalidation updates", async () => {
    const harness = await createSymphonyRuntimeTestHarness({
      issue: {
        state: "In Review"
      },
      realtimeNow: () => new Date("2026-03-31T00:00:00.000Z"),
      rootPrefix: "symphony-runtime-ws-"
    });
    harnesses.push(harness);

    const runtimeApplication = createSymphonyRuntimeApplication(harness.services);
    const httpServer = await awaitableServer(runtimeApplication);
    const address = httpServer.address() as AddressInfo;
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/v1/ws`);
    const messages: unknown[] = [];

    socket.on("message", (data: WebSocket.RawData) => {
      messages.push(JSON.parse(data.toString()));
    });

    await new Promise<void>((resolve, reject) => {
      socket.once("open", () => resolve());
      socket.once("error", reject);
    });
    await waitForMessageCount(messages, 1);

    socket.send(
      JSON.stringify({
        type: "subscribe",
        channels: ["runtime", "issues", "problem-runs"]
      })
    );
    await waitForMessageCount(messages, 2);

    harness.services.realtime.publishSnapshotUpdated();
    harness.services.realtime.publishIssueUpdated("COL-123");
    harness.services.realtime.publishProblemRunsUpdated();
    socket.send(JSON.stringify({ type: "ping", id: "ping-1" }));
    await waitForMessageCount(messages, 6);

    expect(messages).toEqual([
      expect.objectContaining({
        type: "connection.ack",
        subscribedChannels: []
      }),
      expect.objectContaining({
        type: "connection.ack",
        subscribedChannels: ["issues", "problem-runs", "runtime"]
      }),
      expect.objectContaining({
        type: "runtime.snapshot.updated",
        invalidate: ["/api/v1/state"]
      }),
      expect.objectContaining({
        type: "issue.updated",
        issueIdentifier: "COL-123"
      }),
      expect.objectContaining({
        type: "problem-runs.updated",
        invalidate: ["/api/v1/problem-runs"]
      }),
      expect.objectContaining({
        type: "pong",
        id: "ping-1"
      })
    ]);

    await new Promise<void>((resolve) => {
      socket.once("close", () => resolve());
      socket.close();
    });

    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => (error ? reject(error) : resolve()));
    });
  });
});

async function awaitableServer(
  runtimeApplication: ReturnType<typeof createSymphonyRuntimeApplication>
) {
  const { createAdaptorServer } = await import("@hono/node-server");
  const server = createAdaptorServer({
    fetch: runtimeApplication.app.fetch
  });

  runtimeApplication.nodeWebSocket.injectWebSocket(server);

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  return server;
}

async function waitForMessageCount(
  messages: unknown[],
  count: number
): Promise<void> {
  const startedAt = Date.now();

  while (messages.length < count) {
    if (Date.now() - startedAt > 5_000) {
      throw new Error(`Timed out waiting for ${count} websocket messages.`);
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
