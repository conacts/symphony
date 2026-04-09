/**
 * Property-based tests for the Symphony prompt contract template engine.
 *
 * Rationale for choosing this flow as the first property-based test target:
 *
 * The prompt contract parser (`parsePromptContractSegments`) is a deterministic,
 * pure string-processing function with strong invariants:
 *
 *  1. Delimiter pairing: every `{{` must have a matching `}}` in the correct order.
 *  2. Expression extraction: each `{{ expr }}` segment is identified consistently.
 *  3. Text preservation: text outside delimiters is preserved verbatim.
 *  4. Round-trip: a template with known variables renders to a predictable form
 *     when all variables resolve.
 *
 * These invariants are ideal for property-based testing because:
 *  - They hold for an infinite space of valid inputs (not just a few examples).
 *  - Boundary conditions (edge positions of delimiters, empty segments) are hard
 *    to cover exhaustively with hand-picked examples.
 *  - FastCheck's shrinking helps find minimal failing cases when a regression
 *    is introduced.
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildMockSymphonyPromptContractPayload,
  renderSymphonyPromptContract,
  symphonyHarnessPromptAppendix,
  type SymphonyPromptContractPayload
} from "./prompt-contract.js";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * A safe text segment that never contains `{{`, `}}`, and never starts or ends
 * with `{` or `}` (to avoid delimiter ambiguity when concatenated with
 * variable segments).
 */
const safeTextArb = fc
  .string({ minLength: 0, maxLength: 20 })
  .filter(
    (s) =>
      !s.includes("{{") &&
      !s.includes("}}") &&
      !s.startsWith("{") &&
      !s.endsWith("}") &&
      !s.endsWith("{") &&
      !s.startsWith("}")
  );

/**
 * An arbitrary that produces a valid template string alongside the list of
 * variable expressions embedded in it.
 */
function templateWithVariablesArb(opts: {
  excludeHandoff?: boolean;
} = {}): fc.Arbitrary<{
  template: string;
  variables: string[];
}> {
  // Valid variable paths that resolve in the mock payload scope.
  const allVariablePaths = [
    "issue.identifier",
    "issue.title",
    "issue.state",
    "repo.name",
    "repo.default_branch",
    "run.id",
    "workspace.path",
    "run_mode_section",
    "handoff_section"
  ];

  const variablePathArb = opts.excludeHandoff
    ? fc.constantFrom(
        ...allVariablePaths.filter((p) => p !== "handoff_section")
      )
    : fc.constantFrom(...allVariablePaths);

  return fc
    .array(
      fc.oneof(
        // plain text segment — ensure at least one non-empty text to avoid empty template
        safeTextArb
          .filter((s) => s.length > 0)
          .map((text) => ({ kind: "text" as const, value: text })),
        // variable segment
        variablePathArb.map((path) => ({
          kind: "variable" as const,
          value: path
        }))
      ),
      { minLength: 1, maxLength: 20 }
    )
    .map((segments) => {
      const variables: string[] = [];
      let template = "";

      for (const seg of segments) {
        if (seg.kind === "text") {
          template += seg.value;
        } else {
          variables.push(seg.value);
          template += `{{ ${seg.value} }}`;
        }
      }

      return { template, variables };
    })
    .filter(({ template }) => template.trim().length > 0);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("prompt contract template (property-based)", () => {
  /**
   * Property 1 — Text preservation:
   * Text segments outside `{{ }}` delimiters appear verbatim in the rendered output.
   */
  it("preserves plain text segments verbatim after rendering", () => {
    fc.assert(
      fc.property(
        safeTextArb.filter((t) => t.trim().length > 0),
        (text) => {
          const template = `prefix ${text} suffix`;
          const rendered = renderSymphonyPromptContract({
            template,
            payload: buildMockSymphonyPromptContractPayload()
          });
          // The plain text should appear in the rendered output (before the appendix).
          const beforeAppendix = rendered.split(symphonyHarnessPromptAppendix)[0];
          expect(beforeAppendix).toContain(text);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2 — Delimiter balance:
   * A template built from well-formed `{{ expr }}` segments always renders successfully
   * when all variables resolve.
   */
  it("renders any well-formed template without throwing", () => {
    fc.assert(
      fc.property(templateWithVariablesArb({ excludeHandoff: true }), ({ template }) => {
        const payload = buildMockSymphonyPromptContractPayload();

        // Should not throw
        const rendered = renderSymphonyPromptContract({ template, payload });
        expect(rendered.length).toBeGreaterThan(0);
      }),
      { numRuns: 200 }
    );
  });

  /**
   * Property 3 — Rendered output contains resolved values:
   * For every variable expression that resolves to a non-empty string, the
   * corresponding value appears in the rendered output.
   */
  it("resolves known variables to their payload values in the rendered output", () => {
    const knownResolutions: Record<string, string | null> = {
      "issue.identifier": "ENG-123",
      "issue.title": "Ship runtime contract boundary",
      "issue.state": "In Progress",
      "repo.name": "symphony",
      "repo.default_branch": "main",
      "run.id": "run-123",
      "workspace.path": "/workspace/symphony",
      "run_mode_section": null, // rendered separately, multi-line
      "handoff_section": "" // empty by default
    };

    fc.assert(
      fc.property(
        templateWithVariablesArb({ excludeHandoff: true }),
        ({ template, variables }) => {
          const payload = buildMockSymphonyPromptContractPayload();
          const rendered = renderSymphonyPromptContract({ template, payload });

          for (const variable of variables) {
            const expected = knownResolutions[variable];
            if (expected === null || expected === undefined) {
              // These variables produce multi-line or empty output; skip exact match.
              continue;
            }
            if (expected === "") {
              continue;
            }
            expect(rendered).toContain(expected);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * Property 4 — Non-empty rendering:
   * A template containing at least one resolved variable always produces a
   * non-empty, non-whitespace-only rendered string.
   */
  it("never renders to an empty string when the template has resolvable variables", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("issue.identifier", "repo.name", "run.id"),
        (variable) => {
          const template = `{{ ${variable} }}`;
          const rendered = renderSymphonyPromptContract({
            template,
            payload: buildMockSymphonyPromptContractPayload()
          });
          expect(rendered.trim().length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 5 — Malformed delimiter detection:
   * Templates with unmatched `{{` or `}}` always throw a SymphonyPromptContractError.
   */
  it("throws on templates with unbalanced delimiters", () => {
    const malformedArb = fc.oneof(
      // Lone opening delimiter at various positions
      fc
        .string({ minLength: 0, maxLength: 10 })
        .filter((s) => !s.includes("{{") && !s.includes("}}"))
        .map((prefix) => `${prefix}{{`),
      // Lone closing delimiter
      fc
        .string({ minLength: 0, maxLength: 10 })
        .filter((s) => !s.includes("{{") && !s.includes("}}"))
        .map((prefix) => `${prefix}}}`),
      // Closing before opening
      fc.constant("}} text {{")
    );

    fc.assert(
      fc.property(malformedArb, (template) => {
        expect(() =>
          renderSymphonyPromptContract({
            template,
            payload: buildMockSymphonyPromptContractPayload()
          })
        ).toThrow(/delimiter/i);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6 — Empty expression rejection:
   * Templates with empty `{{ }}` expressions (only whitespace inside) always throw.
   */
  it("throws on templates with empty expressions", () => {
    // Ensure templates with empty `{{ }}` expressions always throw.
    // We avoid prefixes that end with `{` (e.g., `{{{ }}`) because the parser
    // would see the inner expression as `{` rather than empty.
    const emptyExpressionArb = fc.oneof(
      fc.constant("{{ }}"),
      fc.constant("{{  }}"),
      fc.constant("{{\t}}"),
      fc
        .string({ minLength: 0, maxLength: 10 })
        .filter(
          (s) =>
            !s.includes("{{") &&
            !s.includes("}}") &&
            !s.endsWith("{") &&
            !s.startsWith("}")
        )
        .map((prefix) => `${prefix}{{ }}`)
    );

    fc.assert(
      fc.property(emptyExpressionArb, (template) => {
        expect(() =>
          renderSymphonyPromptContract({
            template,
            payload: buildMockSymphonyPromptContractPayload()
          })
        ).toThrow(/empty/i);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property 7 — Unknown variable detection:
   * Templates referencing variables not in the payload scope always throw.
   *
   * Note: we exclude Object.prototype property names (valueOf, toString, etc.)
   * because those resolve through the prototype chain rather than being
   * "unknown" to the template engine.
   */
  it("throws on templates with unknown variable paths", () => {
    const prototypeProps = new Set([
      "valueOf",
      "toString",
      "constructor",
      "hasOwnProperty",
      "isPrototypeOf",
      "propertyIsEnumerable",
      "toLocaleString"
    ]);

    const unknownVarArb = fc
      .string({ minLength: 1, maxLength: 15 })
      .filter(
        (s) =>
          !s.includes("{{") &&
          !s.includes("}}") &&
          !s.includes(".") &&
          s.trim().length > 0 &&
          !prototypeProps.has(s)
      )
      .map((name) => `{{ issue.${name} }}`);

    fc.assert(
      fc.property(unknownVarArb, (template) => {
        expect(() =>
          renderSymphonyPromptContract({
            template,
            payload: buildMockSymphonyPromptContractPayload()
          })
        ).toThrow(/Unknown prompt contract variable/i);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8 — Handoff section deduplication:
   * When the template already contains a `{{ handoff_section }}` slot and the
   * payload provides handoff content, the rendered output does not duplicate
   * that content.
   */
  it("does not duplicate the handoff section content", () => {
    const handoffContent = "Rework handoff:\n- Review context: https://example.com/pr/1";

    fc.assert(
      fc.property(safeTextArb, (prefix) => {
        const template = `${prefix}{{ handoff_section }}`;
        const payload: SymphonyPromptContractPayload = {
          ...buildMockSymphonyPromptContractPayload(),
          handoff_section: handoffContent
        };

        const rendered = renderSymphonyPromptContract({ template, payload });

        // The handoff content should appear exactly once (before the harness appendix).
        const beforeAppendix = rendered.split(symphonyHarnessPromptAppendix)[0];
        const occurrences = beforeAppendix.split(handoffContent).length - 1;
        expect(occurrences).toBe(1);
      }),
      { numRuns: 100 }
    );
  });
});
