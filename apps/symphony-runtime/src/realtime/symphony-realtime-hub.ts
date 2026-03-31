import {
  symphonyRealtimeClientMessageSchema,
  symphonyRealtimeServerMessageSchema,
  type SymphonyRealtimeChannel,
  type SymphonyRealtimeServerMessage
} from "@symphony/contracts";

type SymphonyRealtimeSocket = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
};

type SymphonyRealtimeConnection = {
  id: string;
  socket: SymphonyRealtimeSocket;
  subscribedChannels: Set<SymphonyRealtimeChannel>;
};

export interface SymphonyRealtimeHub {
  openConnection(socket: SymphonyRealtimeSocket): string;
  closeConnection(connectionId: string): void;
  handleClientMessage(connectionId: string, rawMessage: string): void;
  publishSnapshotUpdated(): void;
  publishIssueUpdated(issueIdentifier: string): void;
  publishRunUpdated(runId: string, issueIdentifier?: string): void;
  publishProblemRunsUpdated(): void;
  connectionCount(): number;
}

export function createSymphonyRealtimeHub(
  clock: { now(): Date } = {
    now: () => new Date()
  }
): SymphonyRealtimeHub {
  const connections = new Map<string, SymphonyRealtimeConnection>();

  function sendMessage(
    connection: SymphonyRealtimeConnection,
    message: SymphonyRealtimeServerMessage
  ): void {
    const parsed = symphonyRealtimeServerMessageSchema.parse(message);
    connection.socket.send(JSON.stringify(parsed));
  }

  function sendAck(connection: SymphonyRealtimeConnection): void {
    sendMessage(connection, {
      type: "connection.ack",
      connectionId: connection.id,
      subscribedChannels: [...connection.subscribedChannels].sort(),
      generatedAt: clock.now().toISOString()
    });
  }

  function publishToChannel(
    channel: SymphonyRealtimeChannel,
    buildMessage: () => SymphonyRealtimeServerMessage
  ): void {
    for (const connection of connections.values()) {
      if (!connection.subscribedChannels.has(channel)) {
        continue;
      }

      sendMessage(connection, buildMessage());
    }
  }

  return {
    openConnection(socket) {
      const connectionId = crypto.randomUUID();
      const connection: SymphonyRealtimeConnection = {
        id: connectionId,
        socket,
        subscribedChannels: new Set()
      };

      connections.set(connectionId, connection);
      sendAck(connection);
      return connectionId;
    },

    closeConnection(connectionId) {
      connections.delete(connectionId);
    },

    handleClientMessage(connectionId, rawMessage) {
      const connection = connections.get(connectionId);

      if (!connection) {
        return;
      }

      let parsedJson: unknown;

      try {
        parsedJson = JSON.parse(rawMessage);
      } catch {
        connection.socket.close(1008, "invalid message");
        connections.delete(connectionId);
        return;
      }

      const parsed = symphonyRealtimeClientMessageSchema.safeParse(parsedJson);

      if (!parsed.success) {
        connection.socket.close(1008, "invalid message");
        connections.delete(connectionId);
        return;
      }

      switch (parsed.data.type) {
        case "subscribe":
          for (const channel of parsed.data.channels) {
            connection.subscribedChannels.add(channel);
          }
          sendAck(connection);
          return;

        case "unsubscribe":
          for (const channel of parsed.data.channels) {
            connection.subscribedChannels.delete(channel);
          }
          sendAck(connection);
          return;

        case "ping":
          sendMessage(connection, {
            type: "pong",
            id: parsed.data.id,
            generatedAt: clock.now().toISOString()
          });
          return;
      }
    },

    publishSnapshotUpdated() {
      publishToChannel("runtime", () => ({
        type: "runtime.snapshot.updated",
        channel: "runtime",
        generatedAt: clock.now().toISOString(),
        invalidate: ["/api/v1/state"]
      }));
    },

    publishIssueUpdated(issueIdentifier) {
      publishToChannel("issues", () => ({
        type: "issue.updated",
        channel: "issues",
        issueIdentifier,
        generatedAt: clock.now().toISOString(),
        invalidate: [
          `/api/v1/issues/${issueIdentifier}`,
          `/api/v1/${issueIdentifier}`,
          "/api/v1/issues"
        ]
      }));
    },

    publishRunUpdated(runId, issueIdentifier) {
      publishToChannel("runs", () => ({
        type: "run.updated",
        channel: "runs",
        runId,
        issueIdentifier,
        generatedAt: clock.now().toISOString(),
        invalidate: issueIdentifier
          ? [`/api/v1/runs/${runId}`, `/api/v1/issues/${issueIdentifier}`]
          : [`/api/v1/runs/${runId}`]
      }));
    },

    publishProblemRunsUpdated() {
      publishToChannel("problem-runs", () => ({
        type: "problem-runs.updated",
        channel: "problem-runs",
        generatedAt: clock.now().toISOString(),
        invalidate: ["/api/v1/problem-runs"]
      }));
    },

    connectionCount() {
      return connections.size;
    }
  };
}
