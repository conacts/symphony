#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "@symphony/env";
import {
  buildSymphonyRuntimeEnvironmentSource,
  loadSymphonyRuntimeAppEnv
} from "./core/env.js";
import { loadDefaultSymphonyRuntimeAppServices } from "./core/runtime-services.js";
import { createSymphonyRuntimeServer } from "./server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");

void loadEnv({
  cwd: packageRoot,
  quiet: true
});

async function main() {
  const env = loadSymphonyRuntimeAppEnv();
  const environmentSource = buildSymphonyRuntimeEnvironmentSource(env);
  const services = await loadDefaultSymphonyRuntimeAppServices(
    env,
    environmentSource
  );
  const { server } = createSymphonyRuntimeServer(services, env);

  const shutdown = () => {
    server.close();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  process.stdout.write(
    `@symphony/runtime listening on http://127.0.0.1:${env.port}\n`
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
