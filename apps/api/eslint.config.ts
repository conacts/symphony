import base from "@symphony/eslint-configs/src/base.ts";
import {
  runtimePackageEnvGuardrailEntries,
  runtimeSourceGlobs,
  runtimeTestGlobs,
  symphonyBoundaryImportRestrictions
} from "@symphony/eslint-configs/src/restrictions.ts";

const symphonyRuntimeRestrictions =
  symphonyBoundaryImportRestrictions("@symphony/api");

export default [
  ...base,
  {
    ignores: [".symphony/workspaces/**"]
  },
  {
    files: [...runtimeSourceGlobs],
    ignores: [...runtimeTestGlobs, "src/core/env.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: symphonyRuntimeRestrictions.paths,
          patterns: symphonyRuntimeRestrictions.patterns
        }
      ],
      "no-restricted-syntax": [
        "error",
        ...runtimePackageEnvGuardrailEntries("@symphony/api")
      ]
    }
  }
];
