import { createAdaptorServer } from "@hono/node-server";
import type { Server } from "node:http";
import type { SymphonyRuntimeAppServices } from "./core/runtime-app-types.js";
import type { SymphonyRuntimeAppEnv } from "./core/env.js";
import { createSymphonyRuntimeApplication } from "./http/app.js";

export async function createSymphonyRuntimeServer(
  services: SymphonyRuntimeAppServices,
  env: SymphonyRuntimeAppEnv
): Promise<{
  app: ReturnType<typeof createSymphonyRuntimeApplication>["app"];
  server: Server;
}> {
  const runtimeApplication = createSymphonyRuntimeApplication(services, {
    allowedOrigins: env.allowedOrigins
  });
  const server = createAdaptorServer({
    fetch: runtimeApplication.app.fetch
  }) as Server;

  runtimeApplication.nodeWebSocket.injectWebSocket(server);
  await new Promise<void>((resolve, reject) => {
    const handleError = (error: Error) => {
      server.off("listening", handleListening);
      reject(error);
    };
    const handleListening = () => {
      server.off("error", handleError);
      resolve();
    };

    server.once("error", handleError);
    server.once("listening", handleListening);
    server.listen(env.port);
  });

  return {
    app: runtimeApplication.app,
    server
  };
}
