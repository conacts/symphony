#!/usr/bin/env node
import {
  buildSymphonyHostCommandEnvironmentSource,
  buildSymphonyRuntimeEnvironmentSource,
  loadSymphonyRuntimeAppEnv
} from "./core/env.js";
import { loadEnv } from "@symphony/env";
import { loadDefaultSymphonyRuntimeAppServices } from "./core/runtime-services.js";
import { createSymphonyRuntimeServer } from "./server.js";

async function main() {
  loadEnv({ cwd: process.cwd() });
  const env = loadSymphonyRuntimeAppEnv();
  const environmentSource = buildSymphonyRuntimeEnvironmentSource(env);
  const hostCommandEnvSource = buildSymphonyHostCommandEnvironmentSource();
  const services = await loadDefaultSymphonyRuntimeAppServices(
    env,
    environmentSource,
    hostCommandEnvSource
  );
  services.logger.info("Starting Symphony runtime server", {
    port: env.port,
    sourceRepo: env.sourceRepo,
    dbFile: env.dbFile,
    logLevel: env.logLevel
  });
  const { server } = await createSymphonyRuntimeServer(services, env);

  const shutdown = (signal: "SIGINT" | "SIGTERM") => {
    services.logger.info("Received shutdown signal", {
      signal
    });
    void services.shutdown();
    server.close(() => {
      services.logger.info("Symphony runtime server stopped");
    });
  };

  process.once("SIGINT", () => {
    shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    shutdown("SIGTERM");
  });

  services.logger.info("Symphony runtime server listening", {
    url: `http://127.0.0.1:${env.port}`
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
