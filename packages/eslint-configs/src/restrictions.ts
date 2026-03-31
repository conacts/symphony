export const runtimeSourceGlobs = ["src/**/*.ts", "src/**/*.tsx"] as const;
export const runtimeTestGlobs = [
  "src/**/*.test.ts",
  "src/**/*.test.tsx",
  "src/**/*.spec.ts",
  "src/**/*.spec.tsx",
  "src/test/**/*.ts",
  "src/test/**/*.tsx",
  "src/test-support/**/*.ts",
  "src/test-support/**/*.tsx"
] as const;

export const testSurfaceGlobs = [
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.spec.ts",
  "**/*.spec.tsx",
  "**/test/**/*.ts",
  "**/test/**/*.tsx",
  "**/test-support/**/*.ts",
  "**/test-support/**/*.tsx"
] as const;

type RestrictedSyntaxEntry = {
  selector: string;
  message: string;
};

type RestrictedImportPath = {
  name: string;
  importNames?: string[];
  message: string;
};

type RestrictedImportPattern = {
  group: string[];
  message: string;
};

export function errorMessageJsonParseRestriction(): RestrictedSyntaxEntry {
  return {
    selector:
      "CallExpression[callee.object.name='JSON'][callee.property.name='parse'][arguments.0.object.name='error'][arguments.0.property.name='message']",
    message:
      "Do not parse app errors from error.message. Use typed app-error helpers and error codes."
  };
}

export function unknownAsTestCastRestriction(): RestrictedSyntaxEntry {
  return {
    selector:
      "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']",
    message:
      "Do not use `as unknown as` in tests. Use typed builders, typed mocks, or a narrower single assertion with a clear reason."
  };
}

export function runtimePackageEnvGuardrailEntries(
  runtimePackageName: string
): RestrictedSyntaxEntry[] {
  return [
    errorMessageJsonParseRestriction(),
    {
      selector: "MemberExpression[object.name='process'][property.name='env']",
      message:
        `${runtimePackageName} runtime must not read ambient env directly. ` +
        "Move env reads to an explicit app/script boundary and inject typed runtime config."
    },
    {
      selector: "Program > ExpressionStatement > CallExpression[callee.name='loadEnv']",
      message:
        `${runtimePackageName} runtime must not load env at module top level. ` +
        "Call loadEnv(...) only in an explicit env/script boundary module."
    },
    {
      selector:
        "Program > ExpressionStatement > AssignmentExpression > CallExpression[callee.name='loadEnv']",
      message:
        `${runtimePackageName} runtime must not load env at module top level. ` +
        "Call loadEnv(...) only in an explicit env/script boundary module."
    },
    {
      selector:
        "Program > VariableDeclaration > VariableDeclarator > CallExpression[callee.name='loadEnv']",
      message:
        `${runtimePackageName} runtime must not load env at module top level. ` +
        "Call loadEnv(...) only in an explicit env/script boundary module."
    },
    {
      selector:
        "Program > ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > CallExpression[callee.name='loadEnv']",
      message:
        `${runtimePackageName} runtime must not load env at module top level. ` +
        "Call loadEnv(...) only in an explicit env/script boundary module."
    }
  ];
}

const legacyBusinessPackageNames = [
  "@coldets/api",
  "@coldets/cli",
  "@coldets/auth",
  "@coldets/compliance",
  "@coldets/control-plane",
  "@coldets/control-plane-domain",
  "@coldets/contracts",
  "@coldets/db",
  "@coldets/email",
  "@coldets/receivables",
  "@coldets/upstash"
] as const;

function symphonyBoundaryImportMessage(importerName: string): string {
  return (
    `${importerName} must stay extraction-ready. ` +
    "Do not couple Symphony boundaries directly to legacy host-repo business packages."
  );
}

export function symphonyBoundaryImportRestrictions(importerName: string): {
  paths: RestrictedImportPath[];
  patterns: RestrictedImportPattern[];
} {
  return {
    paths: legacyBusinessPackageNames.map((name) => ({
      name,
      message: symphonyBoundaryImportMessage(importerName)
    })),
    patterns: legacyBusinessPackageNames.map((name) => ({
      group: [`${name}/**`],
      message: symphonyBoundaryImportMessage(importerName)
    }))
  };
}
