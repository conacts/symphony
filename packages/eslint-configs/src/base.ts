import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import turbo from "eslint-plugin-turbo";
import globals from "globals";
import {
  errorMessageJsonParseRestriction,
  testSurfaceGlobs,
  unknownAsTestCastRestriction
} from "./restrictions.js";

const base: unknown[] = [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/.nitro/**",
      "**/.output/**",
      "**/coverage/**",
      "**/*.d.ts"
    ]
  },
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      },
      globals: {
        ...globals.node
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      turbo
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "error",
      "turbo/no-undeclared-env-vars": "error",
      "no-restricted-syntax": ["error", errorMessageJsonParseRestriction()]
    }
  },
  {
    files: [...testSurfaceGlobs],
    rules: {
      "no-restricted-syntax": [
        "error",
        errorMessageJsonParseRestriction(),
        unknownAsTestCastRestriction()
      ]
    }
  }
];

export default base;
