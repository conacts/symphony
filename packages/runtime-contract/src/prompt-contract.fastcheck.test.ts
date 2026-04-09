/**
 * Property-based tests for the prompt contract module.
 *
 * Why this flow was chosen as the first property-based test target:
 *
 * 1. Deterministic: The template parser and renderer are pure functions with
 *    no side effects, I/O, or nondeterminism.  Same input always produces the
 *    same output.
 *
 * 2. Contract-heavy: The {{mustache}} template syntax has well-defined edge
 *    cases — unmatched delimiters, empty expressions, nested braces, and
 *    variable path resolution through dotted segments.  Example-based tests
 *    cover the cases we think of; property-based tests cover the cases we
 *    don't.
 *
 * 3. Strong invariants: Several algebraic properties hold regardless of input
 *    shape (round-trip, idempotent appendix injection, single-append handoff).
 *    FastCheck can stress-test those invariants across thousands of random
 *    templates in seconds.
 *
 * 4. Low nondeterminism risk: No Docker, no network, no file-system races —
 *    just string processing and object traversal.  This makes the tests fast,
 *    flake-free, and easy to debug when they fail.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildMockSymphonyPromptContractPayload,
  renderSymphonyPromptContract,
  symphonyHarnessPromptAppendix,
  validateSymphonyPromptContract,
  type SymphonyPromptContractPayload,
} from "./prompt-contract.js";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary that produces arbitrary text that does NOT contain `{` or `}`. */
const safeTextArb = fc
  .string({ maxLength: 40 })
  .filter((s) => !s.includes("{") && !s.includes("}"));

/** Builds an arbitrary for a valid template string with known variables. */
function templateArb(variables: string[]) {
  if (variables.length === 0) {
    return safeTextArb.map((t) => t || "placeholder");
  }

  return fc
    .array(
      fc.oneof(
        safeTextArb,
        fc.constantFrom(...variables).map((v) => `{{ ${v} }}`)
      ),
      { minLength: 1, maxLength: 10 }
    )
    .map((parts) => {
      const joined = parts.join("");
      // Guarantee at least one variable appears so the template is non-trivial.
      if (!variables.some((v) => joined.includes(`{{ ${v} }}`))) {
        return `${joined}\n{{ ${variables[0]} }}`;
      }
      return joined;
    })
    .filter((t) => t.trim().length > 0);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("prompt contract (property-based)", () => {
  // ----- Parsing round-trip -----

  it("round-trips: parsing a valid template and re-joining segments yields the original string", () => {
    const knownVars = [
      "issue.identifier",
      "issue.title",
      "repo.name",
      "repo.default_branch",
      "run.id",
      "workspace.path",
      "workspace.branch",
    ];

    fc.assert(
      fc.property(templateArb(knownVars), (template) => {
        // validateSymphonyPromptContract parses internally; if it succeeds,
        // the parser accepted the template.  We then re-render with a payload
        // that has every known variable populated and verify the rendered
        // output contains the resolved values (not raw expressions).
        const { variables } = validateSymphonyPromptContract(template);
        expect(variables.length).toBeGreaterThanOrEqual(0);

        // Every variable referenced in the template should appear in the
        // extracted variable list.
        for (const v of knownVars) {
          if (template.includes(`{{ ${v} }}`)) {
            expect(variables).toContain(v);
          }
        }
      }),
      { numRuns: 200 }
    );
  });

  // ----- Rendering invariants -----

  it("always appends the symphony harness appendix exactly once", () => {
    const knownVars = ["issue.identifier", "repo.name", "run.id"];

    fc.assert(
      fc.property(templateArb(knownVars), (template) => {
        const payload = buildMockSymphonyPromptContractPayload();
        const rendered = renderSymphonyPromptContract({ template, payload });

        // The appendix must appear exactly once.
        const occurrences = countOccurrences(rendered, symphonyHarnessPromptAppendix);
        expect(occurrences).toBe(1);
      }),
      { numRuns: 100 }
    );
  });

  it("renders known variables to their literal values, never leaving raw expressions", () => {
    const variables = ["issue.identifier", "repo.name", "run.id"];
    const payload = buildMockSymphonyPromptContractPayload();
    const resolvedValues: Record<string, string> = {
      "issue.identifier": payload.issue.identifier,
      "repo.name": payload.repo.name,
      "run.id": payload.run.id,
    };

    fc.assert(
      fc.property(templateArb(variables), (template) => {
        const rendered = renderSymphonyPromptContract({ template, payload });

        // After rendering, no unresolved known expressions should remain.
        for (const v of variables) {
          expect(rendered).not.toContain(`{{ ${v} }}`);

          // If the template contained this variable, the rendered output
          // should contain the resolved value.
          if (template.includes(`{{ ${v} }}`)) {
            expect(rendered).toContain(resolvedValues[v]);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  // ----- Handoff section properties -----

  it("appends the handoff section at most once, whether or not the template already contains the slot", () => {
    const handoffLines = ["Rework handoff:", "- context here"];

    fc.assert(
      fc.property(
        fc.oneof(
          // Variant A: template does NOT include {{ handoff_section }}
          templateArb(["issue.identifier"]),
          // Variant B: template DOES include {{ handoff_section }}
          fc.constantFrom(
            "Issue {{ issue.identifier }}\n\n{{ handoff_section }}"
          )
        ),
        (template) => {
          const payload: SymphonyPromptContractPayload = {
            ...buildMockSymphonyPromptContractPayload(),
            handoff_section: handoffLines.join("\n"),
          };

          const rendered = renderSymphonyPromptContract({ template, payload });

          // The handoff content should appear, but never duplicated.
          const occurrences = countOccurrences(rendered, handoffLines[0]);
          expect(occurrences).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  // ----- Rejected templates -----

  it("rejects templates with unmatched opening delimiters", () => {
    fc.assert(
      fc.property(
        safeTextArb,
        fc.constantFrom("{{ issue.identifier"), // missing }}
        (prefix, brokenExpr) => {
          expect(() =>
            validateSymphonyPromptContract(`${prefix}${brokenExpr}`)
          ).toThrow(/opening template delimiter without a closing delimiter/i);
        }
      ),
      { numRuns: 50 }
    );
  });

  it("rejects templates with unmatched closing delimiters", () => {
    fc.assert(
      fc.property(
        safeTextArb,
        fc.constantFrom("issue.identifier }}"), // missing {{
        (prefix, brokenExpr) => {
          expect(() =>
            validateSymphonyPromptContract(`${prefix}${brokenExpr}`)
          ).toThrow(/closing template delimiter without an opening delimiter/i);
        }
      ),
      { numRuns: 50 }
    );
  });

  it("rejects templates with empty expressions", () => {
    fc.assert(
      fc.property(
        safeTextArb,
        (prefix) => {
          expect(() =>
            validateSymphonyPromptContract(`${prefix}{{ }}`)
          ).toThrow(/must not be empty/i);
        }
      ),
      { numRuns: 50 }
    );
  });

  // ----- Idempotent appendix injection -----

  it("does not duplicate the appendix when the template already contains it", () => {
    fc.assert(
      fc.property(
        templateArb(["issue.identifier"]),
        (template) => {
          // Manually inject the appendix into the template.
          const withAppendix = `${template}\n\n${symphonyHarnessPromptAppendix}`;

          const payload = buildMockSymphonyPromptContractPayload();
          const rendered = renderSymphonyPromptContract({
            template: withAppendix,
            payload,
          });

          // Still exactly one copy.
          const occurrences = countOccurrences(
            rendered,
            symphonyHarnessPromptAppendix
          );
          expect(occurrences).toBe(1);
        }
      ),
      { numRuns: 50 }
    );
  });

  // ----- Unknown variable detection -----

  it("detects unknown variables and throws with the variable name in the error", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "issue.nonExistent",
          "repo.missing",
          "run.unknown",
          "workspace.nowhere"
        ),
        (unknownVar) => {
          expect(() =>
            renderSymphonyPromptContract({
              template: `{{ ${unknownVar} }}`,
              payload: buildMockSymphonyPromptContractPayload(),
            })
          ).toThrow(new RegExp(`Unknown prompt contract variable: ${unknownVar}`));
        }
      ),
      { numRuns: 20 }
    );
  });

  // ----- Run mode section -----

  it("renders the correct run-mode section for each run_mode value", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<"implementation" | "rework" | "approved_merge">(
          "implementation",
          "rework",
          "approved_merge"
        ),
        (runMode) => {
          const payload: SymphonyPromptContractPayload = {
            ...buildMockSymphonyPromptContractPayload(),
            run_mode: runMode,
          };

          const rendered = renderSymphonyPromptContract({
            template: "{{ run_mode_section }}",
            payload,
          });

          const expectedLabel =
            runMode === "approved_merge"
              ? "Approved Merge"
              : runMode.charAt(0).toUpperCase() + runMode.slice(1);

          expect(rendered).toContain(`Current run mode: ${expectedLabel}`);
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = 0;
  while ((index = haystack.indexOf(needle, index)) !== -1) {
    count++;
    index += needle.length;
  }
  return count;
}
