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
        "@": path.resolve(__dirname, "./src"),
        "@symphony/contracts": path.resolve(
          __dirname,
          "../../packages/symphony-contracts/src/index.ts"
        )
      }
    },
    test: {
      include: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/**/*.spec.ts",
        "src/**/*.spec.tsx"
      ]
    }
  })
);
