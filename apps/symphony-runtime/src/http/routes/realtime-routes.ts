import { Hono } from "hono";
import type { NodeWebSocket } from "@hono/node-ws";
import type { SymphonyRuntimeAppServices } from "../../core/runtime-services.js";

export function createRealtimeRoutes(
  services: SymphonyRuntimeAppServices,
  upgradeWebSocket: NodeWebSocket["upgradeWebSocket"]
) {
  const realtimeRoutes = new Hono();

  realtimeRoutes.get(
    "/ws",
    upgradeWebSocket(() => {
      let connectionId: string | null = null;

      return {
        onOpen(_event, ws) {
          connectionId = services.realtime.openConnection(ws);
        },
        onMessage(event, ws) {
          if (!connectionId) {
            connectionId = services.realtime.openConnection(ws);
          }

          const rawMessage =
            typeof event.data === "string"
              ? event.data
              : Buffer.from(event.data as ArrayBuffer).toString("utf8");

          services.realtime.handleClientMessage(connectionId, rawMessage);
        },
        onClose() {
          if (connectionId) {
            services.realtime.closeConnection(connectionId);
          }
        },
        onError() {
          if (connectionId) {
            services.realtime.closeConnection(connectionId);
          }
        }
      };
    })
  );

  return realtimeRoutes;
}
