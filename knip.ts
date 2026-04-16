import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignore: [
    "apps/web/src/components/ai-elements/**",
    "apps/web/src/components/ui/**",
    "packages/runtime-contract/src/authoring-shim.ts"
  ],
  ignoreDependencies: [
    "@react-grab/mcp",
    "@rive-app/react-webgl2",
    "@symphony/typescript-configs",
    "@xyflow/react",
    "ansi-to-react",
    "cmdk",
    "date-fns",
    "embla-carousel-react",
    "input-otp",
    "media-chrome",
    "nanoid",
    "postcss",
    "react-day-picker",
    "react-grab",
    "react-jsx-parser",
    "react-resizable-panels",
    "shadcn",
    "sonner",
    "tailwindcss",
    "tokenlens",
    "tw-animate-css",
    "use-stick-to-bottom",
    "vaul"
  ],
  eslint: {
    config: ["apps/*/eslint.config.ts", "packages/*/eslint.config.ts"]
  },
  next: {
    entry: ["next.config.mjs", "src/app/**/*.{ts,tsx}", "src/pages/**/*.{ts,tsx}"]
  },
  vitest: {
    config: ["apps/*/vitest.config.ts", "packages/*/vitest.config.ts"],
    entry: ["src/**/*.{test,spec}.{ts,tsx}"]
  },
  workspaces: {
    ".": {
      entry: ["scripts/**/*.{mjs,ts}", ".symphony/runtime.ts"],
      project: ["scripts/**/*.{mjs,ts}"]
    },
    "apps/api": {
      entry: ["src/{index,main,server}.ts"],
      project: ["src/**/*.{ts,tsx}"]
    },
    "apps/web": {
      entry: ["src/app/**/*.{ts,tsx}"],
      project: ["src/**/*.{ts,tsx}"]
    },
    "packages/db": {
      entry: ["src/{index,internal,test-support}.ts"],
      project: ["src/**/*.{ts,tsx}"]
    },
    "packages/typescript-configs": {
      entry: [],
      project: []
    },
    "packages/*": {
      entry: ["src/{index,internal,test-support}.ts"],
      project: ["src/**/*.{ts,tsx}"]
    }
  }
};

export default config;
