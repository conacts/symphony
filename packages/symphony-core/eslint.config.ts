import base from "@symphony/eslint-configs/src/base.ts";
import {
  runtimePackageEnvGuardrailEntries,
  runtimeSourceGlobs,
  runtimeTestGlobs,
  symphonyBoundaryImportRestrictions
} from "@symphony/eslint-configs/src/restrictions.ts";

const symphonyCoreImportRestrictions =
  symphonyBoundaryImportRestrictions("@symphony/core");

export default [
  ...base,
  {
    files: [...runtimeSourceGlobs],
    ignores: [...runtimeTestGlobs],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: symphonyCoreImportRestrictions.paths,
          patterns: symphonyCoreImportRestrictions.patterns
        }
      ],
      "no-restricted-syntax": [
        "error",
        ...runtimePackageEnvGuardrailEntries("@symphony/core")
      ]
    }
  }
];
