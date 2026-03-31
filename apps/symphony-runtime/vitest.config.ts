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
        "@symphony/contracts": path.resolve(
          __dirname,
          "../../packages/symphony-contracts/src/index.ts"
        ),
        "@symphony/core": path.resolve(
          __dirname,
          "../../packages/symphony-core/src/index.ts"
        )
      }
    }
  })
);
