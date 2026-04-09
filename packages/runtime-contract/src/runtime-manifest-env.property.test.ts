/**
 * Property-based tests for Symphony runtime manifest env resolution.
 *
 * ## Why this flow was selected
 *
 * The env resolution layer is the first property-based test target because it is:
 *
 * 1. **Deterministic**: Pure functions that produce the same output for the same input with no
 *    side effects or nondeterministic behavior.
 *
 * 2. **Contract-heavy**: The resolver enforces strict invariants around required vs. optional host
 *    env, binding kinds (static, runtime, service), summary key sorting, and error-path targeting.
 *    These invariants are tedious to cover exhaustively with example-based tests.
 *
 * 3. **High-value invariants**: The env resolution is the boundary between the repo-owned manifest
 *    and the live runtime. A bug here silently misconfigures the agent harness, so the extra
 *    confidence from property-based coverage is worthwhile.
 *
 * Property-based tests complement the existing example-based tests by exercising a wide input
 * space and verifying invariants that must hold for *every* valid input, not just the examples we
 * thought to write.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildSymphonyRuntimePostgresConnectionString,
  resolveSymphonyRuntimeEnvBundle,
  resolveSymphonyRuntimeHostEnv
} from "./runtime-manifest-env.js";
import { normalizeSymphonyRuntimeManifest } from "./runtime-manifest-validation.js";
import type {
  SymphonyNormalizedRuntimeManifest,
  SymphonyRuntimeEnvironmentContext,
  SymphonyRuntimeEnvironmentSource
} from "./runtime-manifest-contract.js";

// ---------------------------------------------------------------------------
// Arbitrary helpers
// ---------------------------------------------------------------------------

/**
 * Valid environment variable names matching ^[A-Z][A-Z0-9_]*$.
 *
 * This is the contract enforced by the Symphony runtime manifest validator
 * for host env vars and injected binding names.
 */
const envVarNameArb = fc
  .tuple(
    fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
    fc.array(
      fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_"),
      { maxLength: 8 }
    )
  )
  .map(([first, rest]) => first + rest.join(""));

/** Non-empty ASCII strings for general values (paths, identifiers, etc). */
const safeStringArb = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => /^[\w.\-/]+$/.test(s));

/** Integers in the valid PostgreSQL port range. */
const pgPortArb = fc.integer({ min: 1, max: 65_535 });

/** Arbitrary postgres connection inputs. */
const pgConnectionInputArb = fc.record({
  host: safeStringArb,
  port: pgPortArb,
  database: safeStringArb,
  username: safeStringArb,
  password: safeStringArb
});

/** A minimal valid runtime manifest skeleton for testing env resolution. */
function buildTestManifest(envOverrides: {
  required: string[];
  optional: string[];
  inject: Record<string, unknown>;
}): SymphonyNormalizedRuntimeManifest {
  return normalizeSymphonyRuntimeManifest({
    schemaVersion: 1,
    repositoryKey: "test/repo",
    linear: { teamKey: "TST" },
    workspace: { packageManager: "pnpm" },
    env: {
      host: {
        required: envOverrides.required,
        optional: envOverrides.optional
      },
      inject: envOverrides.inject
    },
    lifecycle: {
      bootstrap: [],
      migrate: [],
      verify: [{ name: "verify", run: "true" }],
      seed: [],
      cleanup: []
    }
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runtime manifest env resolution (property-based)", () => {
  // -------------------------------------------------------------------------
  // Connection string builder
  // -------------------------------------------------------------------------

  describe("buildSymphonyRuntimePostgresConnectionString", () => {
    it("always produces a connection string starting with postgresql://", () => {
      fc.assert(
        fc.property(pgConnectionInputArb, (input) => {
          const result = buildSymphonyRuntimePostgresConnectionString(input);
          expect(result.startsWith("postgresql://")).toBe(true);
        })
      );
    });

    it("always encodes the host at the expected position", () => {
      fc.assert(
        fc.property(pgConnectionInputArb, (input) => {
          const result = buildSymphonyRuntimePostgresConnectionString(input);
          // The host appears after the credentials and @ sign, followed by :port
          expect(result).toContain(`@${input.host}:${input.port}/`);
        })
      );
    });

    it("round-trips through URI component encoding for special characters", () => {
      fc.assert(
        fc.property(
          fc.record({
            host: fc.constant("db"),
            port: fc.constant(5432),
            database: fc.string({ minLength: 1, maxLength: 20 }),
            username: fc.string({ minLength: 1, maxLength: 20 }),
            password: fc.string({ minLength: 1, maxLength: 20 })
          }),
          (input) => {
            const result = buildSymphonyRuntimePostgresConnectionString(input);
            // The connection string is well-formed if we can extract and decode the parts
            const match = result.match(
              /^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/
            );
            expect(match).not.toBeNull();
            if (match) {
              const [, encUser, encPass, host, port, encDb] = match;
              expect(decodeURIComponent(encUser)).toBe(input.username);
              expect(decodeURIComponent(encPass)).toBe(input.password);
              expect(host).toBe(input.host);
              expect(Number(port)).toBe(input.port);
              expect(decodeURIComponent(encDb)).toBe(input.database);
            }
          }
        )
      );
    });
  });

  // -------------------------------------------------------------------------
  // Host env resolution
  // -------------------------------------------------------------------------

  describe("resolveSymphonyRuntimeHostEnv", () => {
    it("succeeds when all required host env vars are present in the source", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(envVarNameArb, { minLength: 1, maxLength: 5 }),
          fc.uniqueArray(envVarNameArb, { maxLength: 3 }),
          (requiredNames, optionalNames) => {
            // Ensure optional names don't collide with required names
            const filteredOptional = optionalNames.filter(
              (n) => !requiredNames.includes(n)
            );

            const manifest = buildTestManifest({
              required: requiredNames,
              optional: filteredOptional,
              inject: {}
            });

            // Build an environment source that contains ALL required vars
            const environmentSource: SymphonyRuntimeEnvironmentSource = {};
            for (const name of requiredNames) {
              environmentSource[name] = `value-${name}`;
            }
            for (const name of filteredOptional) {
              environmentSource[name] = `value-${name}`;
            }

            const resolved = resolveSymphonyRuntimeHostEnv({
              manifest,
              environmentSource
            });

            // All required vars must be present in the output
            for (const name of requiredNames) {
              expect(resolved.required[name]).toBe(`value-${name}`);
            }

            // Optional vars present in source must be in output
            for (const name of filteredOptional) {
              expect(resolved.optional[name]).toBe(`value-${name}`);
            }
          }
        )
      );
    });

    it("throws with a path-targeted error when any required host env var is missing", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(envVarNameArb, { minLength: 2, maxLength: 5 }),
          fc.uniqueArray(envVarNameArb, { maxLength: 3 }),
          (requiredNames, optionalNames) => {
            const filteredOptional = optionalNames.filter(
              (n) => !requiredNames.includes(n)
            );

            const manifest = buildTestManifest({
              required: requiredNames,
              optional: filteredOptional,
              inject: {}
            });

            // Pick one required var to leave out
            const missingIndex = fc.sample(
              fc.nat(requiredNames.length - 1),
              1
            )[0];
            const missingName = requiredNames[missingIndex];

            const environmentSource: SymphonyRuntimeEnvironmentSource = {};
            for (let i = 0; i < requiredNames.length; i++) {
              if (i !== missingIndex) {
                environmentSource[requiredNames[i]] =
                  `value-${requiredNames[i]}`;
              }
            }

            expect(() =>
              resolveSymphonyRuntimeHostEnv({
                manifest,
                environmentSource
              })
            ).toThrowError(
              new RegExp(
                `env\\.host\\.required\\[${missingIndex}\\].*${missingName}`,
                "i"
              )
            );
          }
        )
      );
    });

    it("omits optional vars that are not in the source without error", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(envVarNameArb, { minLength: 1, maxLength: 3 }),
          fc.uniqueArray(envVarNameArb, { minLength: 1, maxLength: 3 }),
          (requiredNames, optionalNames) => {
            // Ensure no overlap
            const filteredOptional = optionalNames.filter(
              (n) => !requiredNames.includes(n)
            );
            if (filteredOptional.length === 0) return; // skip degenerate case

            const manifest = buildTestManifest({
              required: requiredNames,
              optional: filteredOptional,
              inject: {}
            });

            // Provide ONLY required vars, no optional
            const environmentSource: SymphonyRuntimeEnvironmentSource = {};
            for (const name of requiredNames) {
              environmentSource[name] = `value-${name}`;
            }

            const resolved = resolveSymphonyRuntimeHostEnv({
              manifest,
              environmentSource
            });

            // All required vars present
            expect(Object.keys(resolved.required).sort()).toEqual(
              [...requiredNames].sort()
            );

            // Optional vars missing from source → empty optional
            expect(resolved.optional).toEqual({});
          }
        )
      );
    });
  });

  // -------------------------------------------------------------------------
  // Env bundle resolution
  // -------------------------------------------------------------------------

  describe("resolveSymphonyRuntimeEnvBundle", () => {
    it("static bindings always resolve to their declared literal value", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(envVarNameArb, { minLength: 1, maxLength: 4 }),
          fc.uniqueArray(safeStringArb, { minLength: 1, maxLength: 4 }),
          (bindingNames, literalValues) => {
            // Build inject map with only static bindings
            const inject: Record<string, unknown> = {};
            for (let i = 0; i < bindingNames.length; i++) {
              inject[bindingNames[i]] = {
                kind: "static",
                value: literalValues[i % literalValues.length]
              };
            }

            const manifest = buildTestManifest({
              required: [],
              optional: [],
              inject
            });

            const runtime: SymphonyRuntimeEnvironmentContext = {
              trackerIssueId: null,
              issueIdentifier: "TEST-1",
              runId: null,
              workspaceKey: "test-key",
              workspacePath: "/workspace",
              backendKind: "docker"
            };

            const resolved = resolveSymphonyRuntimeEnvBundle({
              manifest,
              environmentSource: {},
              runtime
            });

            // Every static binding must resolve to its literal value
            for (let i = 0; i < bindingNames.length; i++) {
              const expected = literalValues[i % literalValues.length];
              expect(resolved.values[bindingNames[i]]).toBe(expected);
            }

            // Summary must list all static binding keys
            for (const name of bindingNames) {
              expect(resolved.summary.staticBindingKeys).toContain(name);
            }
          }
        )
      );
    });

    it("summary keys are always sorted", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(envVarNameArb, { minLength: 2, maxLength: 6 }),
          fc.uniqueArray(envVarNameArb, { minLength: 0, maxLength: 3 }),
          (requiredNames, optionalNames) => {
            const filteredOptional = optionalNames.filter(
              (n) => !requiredNames.includes(n)
            );

            const inject: Record<string, unknown> = {};
            for (const name of requiredNames) {
              inject[name] = { kind: "static", value: "static-value" };
            }

            const manifest = buildTestManifest({
              required: [],
              optional: [],
              inject
            });

            const environmentSource: SymphonyRuntimeEnvironmentSource = {};
            for (const name of filteredOptional) {
              environmentSource[name] = `opt-${name}`;
            }

            const resolved = resolveSymphonyRuntimeEnvBundle({
              manifest,
              environmentSource,
              runtime: {
                trackerIssueId: "issue-123",
                issueIdentifier: "TEST-1",
                runId: "run-123",
                workspaceKey: "test-key",
                workspacePath: "/workspace",
                backendKind: "docker"
              }
            });

            // All summary arrays must be sorted
            const isSorted = (arr: string[]) =>
              arr.every((v, i) => i === 0 || arr[i - 1] <= v);

            expect(isSorted(resolved.summary.injectedKeys)).toBe(true);
            expect(isSorted(resolved.summary.requiredHostKeys)).toBe(true);
            expect(isSorted(resolved.summary.optionalHostKeys)).toBe(true);
            expect(isSorted(resolved.summary.staticBindingKeys)).toBe(true);
            expect(isSorted(resolved.summary.runtimeBindingKeys)).toBe(true);
            expect(isSorted(resolved.summary.serviceBindingKeys)).toBe(true);
          }
        )
      );
    });

    it("runtime bindings resolve to the correct context values", () => {
      const runtimeBindingFields = [
        "trackerIssueId",
        "issueIdentifier",
        "runId",
        "workspaceKey",
        "workspacePath",
        "backendKind"
      ] as const;

      fc.assert(
        fc.property(
          fc.constantFrom(...runtimeBindingFields),
          envVarNameArb,
          (bindingField, bindingName) => {
            const inject: Record<string, unknown> = {
              [bindingName]: {
                kind: "runtime",
                value: bindingField
              }
            };

            const manifest = buildTestManifest({
              required: [],
              optional: [],
              inject
            });

            const runtime: SymphonyRuntimeEnvironmentContext = {
              trackerIssueId: "issue-999",
              issueIdentifier: "COL-456",
              runId: "run-789",
              workspaceKey: "ws-key",
              workspacePath: "/workspace/test",
              backendKind: "docker"
            };

            const resolved = resolveSymphonyRuntimeEnvBundle({
              manifest,
              environmentSource: {},
              runtime
            });

            // The binding should resolve to the corresponding runtime field
            expect(resolved.values[bindingName]).toBe(runtime[bindingField]);
            expect(resolved.summary.runtimeBindingKeys).toContain(bindingName);
          }
        )
      );
    });

    it("throws when a required host env var is missing during bundle resolution", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(envVarNameArb, { minLength: 1, maxLength: 3 }),
          (requiredNames) => {
            const manifest = buildTestManifest({
              required: requiredNames,
              optional: [],
              inject: {}
            });

            // Empty environment source — all required vars are missing
            expect(() =>
              resolveSymphonyRuntimeEnvBundle({
                manifest,
                environmentSource: {},
                runtime: {
                  trackerIssueId: null,
                  issueIdentifier: "TEST-1",
                  runId: null,
                  workspaceKey: "key",
                  workspacePath: "/ws",
                  backendKind: "docker"
                }
              })
            ).toThrowError(/Required host environment variable/i);
          }
        )
      );
    });

    it("host env vars are included in the resolved values alongside static bindings", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(envVarNameArb, { minLength: 1, maxLength: 3 }),
          fc.uniqueArray(envVarNameArb, { minLength: 1, maxLength: 3 }),
          (hostVarNames, staticNames) => {
            // Ensure no collisions
            const filteredStatic = staticNames.filter(
              (n) => !hostVarNames.includes(n)
            );
            if (filteredStatic.length === 0) return;

            const inject: Record<string, unknown> = {};
            for (const name of filteredStatic) {
              inject[name] = { kind: "static", value: `static-${name}` };
            }

            const manifest = buildTestManifest({
              required: hostVarNames,
              optional: [],
              inject
            });

            const environmentSource: SymphonyRuntimeEnvironmentSource = {};
            for (const name of hostVarNames) {
              environmentSource[name] = `host-${name}`;
            }

            const resolved = resolveSymphonyRuntimeEnvBundle({
              manifest,
              environmentSource,
              runtime: {
                trackerIssueId: null,
                issueIdentifier: "TEST-1",
                runId: null,
                workspaceKey: "key",
                workspacePath: "/ws",
                backendKind: "docker"
              }
            });

            // Host vars present
            for (const name of hostVarNames) {
              expect(resolved.values[name]).toBe(`host-${name}`);
            }

            // Static bindings present
            for (const name of filteredStatic) {
              expect(resolved.values[name]).toBe(`static-${name}`);
            }

            // Total values count matches
            expect(Object.keys(resolved.values).length).toBe(
              hostVarNames.length + filteredStatic.length
            );
          }
        )
      );
    });
  });
});
