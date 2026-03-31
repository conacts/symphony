import { createAdaptorServer } from "@hono/node-server";
import type { Server } from "node:http";
import type { SymphonyRuntimeAppServices } from "./core/runtime-services.js";
import type { SymphonyRuntimeAppEnv } from "./core/env.js";
import { createSymphonyRuntimeApplication } from "./http/app.js";

export function createSymphonyRuntimeServer(
  services: SymphonyRuntimeAppServices,
  env: SymphonyRuntimeAppEnv
): {
  app: ReturnType<typeof createSymphonyRuntimeApplication>["app"];
  server: Server;
} {
  const runtimeApplication = createSymphonyRuntimeApplication(services);
  const server = createAdaptorServer({
    fetch: runtimeApplication.app.fetch,
    port: env.port
  }) as Server;

  runtimeApplication.nodeWebSocket.injectWebSocket(server);

  return {
    app: runtimeApplication.app,
    server
  };
}
