import base from "@symphony/eslint-configs/src/base.ts";
import pluginNext from "@next/eslint-plugin-next";
import globals from "globals";
import {
  runtimePackageEnvGuardrailEntries,
  runtimeSourceGlobs,
  runtimeTestGlobs,
  symphonyBoundaryImportRestrictions
} from "@symphony/eslint-configs/src/restrictions.ts";

const symphonyDashboardRestrictions =
  symphonyBoundaryImportRestrictions("@symphony/web");

export default [
  ...base,
  {
    ignores: [
      "**/.next/**",
      "src/components/ai-elements/**",
      "src/components/ui/**"
    ]
  },
  {
    files: [...runtimeSourceGlobs],
    ignores: [...runtimeTestGlobs, "src/core/env.ts"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.serviceworker
      }
    },
    plugins: {
      "@next/next": pluginNext
    },
    rules: {
      "no-undef": "off",
      "no-restricted-imports": [
        "error",
        {
          paths: symphonyDashboardRestrictions.paths,
          patterns: symphonyDashboardRestrictions.patterns
        }
      ],
      ...pluginNext.configs.recommended.rules,
      ...pluginNext.configs["core-web-vitals"].rules,
      "no-restricted-syntax": [
        "error",
        ...runtimePackageEnvGuardrailEntries("@symphony/web")
      ]
    }
  }
];
