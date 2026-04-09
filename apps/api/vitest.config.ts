import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import base from "@symphony/vitest-configs/src/base.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default mergeConfig(
  base,
  defineConfig({
    test: {
      // API harness tests are materially slower in agent workspaces than in
      // local dev, so give the package more room before pre-commit fails.
      testTimeout: 30_000,
      hookTimeout: 30_000,
      exclude:
        process.env.SYMPHONY_LIVE_DOCKER_VERIFY === "1"
          ? []
          : ["src/core/agent-harness-runtime.live-docker.test.ts"]
    },
    resolve: {
      alias: {
        "@symphony/contracts": path.resolve(
          __dirname,
          "../../packages/contracts/src/index.ts"
        )
      }
    }
  })
);
