import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import base from "@symphony/vitest-configs/src/base.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default mergeConfig(
  base,
  defineConfig({
    resolve: {
      alias: {
        "@symphony/errors": path.resolve(__dirname, "../errors/src/index.ts")
      }
    }
  })
);
