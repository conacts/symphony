import { describe, expect, it } from "vitest";
import { createSymphonyRealtimeHub } from "./symphony-realtime-hub.js";

function createSocket() {
  const sent: string[] = [];
  const closed: Array<{ code?: number; reason?: string }> = [];

  return {
    socket: {
      send(data: string) {
        sent.push(data);
      },
      close(code?: number, reason?: string) {
        closed.push({ code, reason });
      }
    },
    sent,
    closed
  };
}

describe("symphony realtime hub", () => {
  it("acks new connections and updates subscriptions", () => {
    const hub = createSymphonyRealtimeHub({
      now: () => new Date("2026-03-31T00:00:00.000Z")
    });
    const { socket, sent } = createSocket();

    const connectionId = hub.openConnection(socket);
    hub.handleClientMessage(
      connectionId,
      JSON.stringify({
        type: "subscribe",
        channels: ["runtime", "issues"]
      })
    );

    expect(sent).toHaveLength(2);
    expect(JSON.parse(sent[0] ?? "{}")).toMatchObject({
      type: "connection.ack",
      subscribedChannels: []
    });
    expect(JSON.parse(sent[1] ?? "{}")).toMatchObject({
      type: "connection.ack",
      subscribedChannels: ["issues", "runtime"]
    });
  });

  it("publishes only to subscribed channels and responds to pings", () => {
    const hub = createSymphonyRealtimeHub({
      now: () => new Date("2026-03-31T00:00:00.000Z")
    });
    const runtimeSocket = createSocket();
    const issuesSocket = createSocket();

    const runtimeConnection = hub.openConnection(runtimeSocket.socket);
    const issuesConnection = hub.openConnection(issuesSocket.socket);

    hub.handleClientMessage(
      runtimeConnection,
      JSON.stringify({ type: "subscribe", channels: ["runtime"] })
    );
    hub.handleClientMessage(
      issuesConnection,
      JSON.stringify({ type: "subscribe", channels: ["issues"] })
    );

    hub.publishSnapshotUpdated();
    hub.publishIssueUpdated("COL-123");
    hub.handleClientMessage(
      runtimeConnection,
      JSON.stringify({ type: "ping", id: "ping-1" })
    );

    expect(runtimeSocket.sent.map((message) => JSON.parse(message).type)).toContain(
      "runtime.snapshot.updated"
    );
    expect(runtimeSocket.sent.map((message) => JSON.parse(message).type)).toContain(
      "pong"
    );
    expect(issuesSocket.sent.map((message) => JSON.parse(message).type)).toContain(
      "issue.updated"
    );
    expect(issuesSocket.sent.map((message) => JSON.parse(message).type)).not.toContain(
      "runtime.snapshot.updated"
    );
  });

  it("closes invalid realtime messages", () => {
    const hub = createSymphonyRealtimeHub();
    const { socket, closed } = createSocket();
    const connectionId = hub.openConnection(socket);

    hub.handleClientMessage(connectionId, "not-json");

    expect(closed[0]).toEqual({
      code: 1008,
      reason: "invalid message"
    });
    expect(hub.connectionCount()).toBe(0);
  });
});
