import base from "@symphony/eslint-configs/src/base.ts";
import {
  runtimePackageEnvGuardrailEntries,
  runtimeSourceGlobs,
  runtimeTestGlobs,
  symphonyBoundaryImportRestrictions
} from "@symphony/eslint-configs/src/restrictions.ts";

const symphonyContractRestrictions =
  symphonyBoundaryImportRestrictions("@symphony/contracts");

export default [
  ...base,
  {
    files: [...runtimeSourceGlobs],
    ignores: [...runtimeTestGlobs],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: symphonyContractRestrictions.paths,
          patterns: symphonyContractRestrictions.patterns
        }
      ],
      "no-restricted-syntax": [
        "error",
        ...runtimePackageEnvGuardrailEntries("@symphony/contracts")
      ]
    }
  }
];
