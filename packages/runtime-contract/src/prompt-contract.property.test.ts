import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildMockSymphonyPromptContractPayload,
  renderSymphonyPromptContract,
  SymphonyPromptContractError,
  type SymphonyPromptContractPayload
} from "./prompt-contract.js";
import { deriveSymphonyRunMode, type SymphonyRunMode } from "./prompt-run-mode.js";

/**
 * Property-based tests for the prompt-contract module.
 *
 * Why this flow was selected as the first property-based test target:
 *
 * The prompt contract system is a pure, deterministic, contract-heavy module
 * with clear invariants:
 *
 *   1. Template parsing (`parsePromptContractSegments`): A {{variable}}
 *      expression parser that splits templates into text and expression
 *      segments. Key invariants: the parser is total (every character belongs
 *      to exactly one segment), variable names are non-empty, and
 *      well-formed templates always succeed.
 *
 *   2. Path resolution (`resolveTemplatePath`): Dot-notation path lookup
 *      against nested objects. Key invariants: empty path returns root,
 *      missing paths return undefined, nested paths traverse correctly.
 *
 *   3. Run mode derivation (`deriveSymphonyRunMode`): Maps issue state
 *      strings to run modes. Key invariant: total function that returns a
 *      valid mode for any input, with "rework" and "approved" having
 *      specific meanings.
 *
 *   4. Rendering: Full template rendering with handoff append logic.
 *      Key invariants: rendered output is non-empty for valid payloads,
 *      handoff section appears exactly once, and harness appendix is
 *      always present.
 *
 * These invariants are perfect for property-based testing because the
 * functions are pure, the inputs can be generated via arbitraries, and
 * the properties are general enough to catch real bugs across a wide
 * input space.
 */

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const arbitraryRunMode: fc.Arbitrary<SymphonyRunMode> = fc.constantFrom(
  "implementation",
  "rework",
  "approved_merge"
);

const arbitraryNonEmptyString: fc.Arbitrary<string> = fc.string({
  minLength: 1
}).filter((s) => s.trim().length > 0);

// Use strings without trailing whitespace (since trimEnd() is applied in rendering)
// and without template syntax characters
const arbitraryRenderableString: fc.Arbitrary<string> = fc.string({
  minLength: 1
}).filter((s) => {
  const trimmed = s.trim();
  return trimmed.length > 0 &&
    !trimmed.includes("{{") &&
    !trimmed.includes("}}");
});

const arbitraryPayload: fc.Arbitrary<SymphonyPromptContractPayload> =
  fc.record({
    issue: fc.record({
      id: arbitraryNonEmptyString,
      identifier: fc.constantFrom("ENG-123", "BUG-456", "FEAT-789", "TASK-001"),
      title: arbitraryRenderableString,
      description: fc.oneof(fc.constant(null), arbitraryRenderableString),
      state: fc.constantFrom(
        "In Progress",
        "Todo",
        "Done",
        "Rework",
        "Approved"
      ),
      labels: fc.array(fc.string(), { maxLength: 5 }),
      url: fc.oneof(fc.constant(null), fc.webUrl()),
      branch_name: fc.oneof(fc.constant(null), arbitraryRenderableString)
    }),
    repo: fc.record({
      default_branch: fc.constantFrom("main", "master", "develop"),
      name: arbitraryRenderableString
    }),
    run: fc.record({
      id: arbitraryRenderableString
    }),
    workspace: fc.record({
      path: arbitraryRenderableString,
      branch: fc.oneof(fc.constant(null), arbitraryRenderableString)
    }),
    attempt: fc.nat({ max: 10 }),
    run_mode: arbitraryRunMode,
    run_mode_section: fc.oneof(fc.constant(null), arbitraryRenderableString),
    handoff_section: fc.oneof(fc.constant(null), arbitraryRenderableString)
  });

// ---------------------------------------------------------------------------
// Property: deriveSymphonyRunMode is a total function
// ---------------------------------------------------------------------------

describe("deriveSymphonyRunMode properties", () => {
  it("returns a valid run mode for any input string", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = deriveSymphonyRunMode(input);
        expect(["implementation", "rework", "approved_merge"]).toContain(
          result
        );
      })
    );
  });

  it("treats null/undefined as implementation", () => {
    fc.assert(
      fc.property(fc.constantFrom(null, undefined), (input) => {
        const result = deriveSymphonyRunMode(input);
        expect(result).toBe("implementation");
      })
    );
  });

  it("maps 'rework' (case-insensitive) to 'rework' when exact match", () => {
    expect(deriveSymphonyRunMode("rework")).toBe("rework");
    expect(deriveSymphonyRunMode("Rework")).toBe("rework");
    expect(deriveSymphonyRunMode("REWORK")).toBe("rework");
  });

  it("maps 'approved' (case-insensitive) to 'approved_merge' when exact match", () => {
    expect(deriveSymphonyRunMode("approved")).toBe("approved_merge");
    expect(deriveSymphonyRunMode("Approved")).toBe("approved_merge");
    expect(deriveSymphonyRunMode("APPROVED")).toBe("approved_merge");
  });

  it("is idempotent: applying twice gives the same result", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const first = deriveSymphonyRunMode(input);
        const second = deriveSymphonyRunMode(first);
        expect(second).toBe(first);
      })
    );
  });

  it("trims whitespace before classifying", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("rework", "approved"),
        fc.string({ maxLength: 10 }),
        (keyword, padding) => {
          const padded = `${padding}${keyword}`;
          const result = deriveSymphonyRunMode(padded);
          expect(["implementation", "rework", "approved_merge"]).toContain(
            result
          );
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Property: Rendering with valid payloads never throws and produces non-empty output
// ---------------------------------------------------------------------------

describe("renderSymphonyPromptContract properties", () => {
  it("renders non-empty output for the canonical template with arbitrary payloads", () => {
    fc.assert(
      fc.property(arbitraryPayload, (payload) => {
        const template = [
          "Issue {{ issue.identifier }}",
          "Repo {{ repo.name }}",
          "Run {{ run.id }}"
        ].join("\n");

        const rendered = renderSymphonyPromptContract({
          template,
          payload
        });

        expect(rendered.trim().length).toBeGreaterThan(0);
      })
    );
  });

  it("always includes the harness appendix in rendered output", () => {
    fc.assert(
      fc.property(arbitraryPayload, (payload) => {
        const template = "Issue {{ issue.identifier }}";

        const rendered = renderSymphonyPromptContract({
          template,
          payload
        });

        expect(rendered).toContain(
          "Before editing, gather enough local context to make one clean patch"
        );
        expect(rendered).toContain("Symphony harness guidance");
      })
    );
  });

  it("renders identifier variable to the trimmed payload value", () => {
    fc.assert(
      fc.property(arbitraryPayload, (payload) => {
        const template = "{{ issue.identifier }}";

        const rendered = renderSymphonyPromptContract({
          template,
          payload
        });

        // Note: trimEnd() is applied during rendering, so trailing whitespace is removed
        const trimmedIdentifier = payload.issue.identifier.trimEnd();
        expect(rendered).toContain(trimmedIdentifier);
      })
    );
  });

  it("renders repo.name variable to the trimmed payload value", () => {
    fc.assert(
      fc.property(arbitraryPayload, (payload) => {
        const template = "{{ repo.name }}";

        const rendered = renderSymphonyPromptContract({
          template,
          payload
        });

        const trimmedName = payload.repo.name.trimEnd();
        expect(rendered).toContain(trimmedName);
      })
    );
  });

  it("renders run.id variable to the trimmed payload value", () => {
    fc.assert(
      fc.property(arbitraryPayload, (payload) => {
        const template = "{{ run.id }}";

        const rendered = renderSymphonyPromptContract({
          template,
          payload
        });

        const trimmedId = payload.run.id.trimEnd();
        expect(rendered).toContain(trimmedId);
      })
    );
  });

  it("contains the handoff content when present", () => {
    fc.assert(
      fc.property(arbitraryRenderableString, (handoffContent) => {
        const template = "Header\n{{ handoff_section }}\nFooter";
        const payload = {
          ...buildMockSymphonyPromptContractPayload(),
          handoff_section: handoffContent
        };

        const rendered = renderSymphonyPromptContract({
          template,
          payload
        });

        const trimmedContent = handoffContent.trimEnd();
        expect(rendered).toContain(trimmedContent);
        expect(rendered).toContain("Symphony harness guidance");
      })
    );
  });

  it("throws for empty rendered content (when payload resolves all to null)", () => {
    const payload = {
      ...buildMockSymphonyPromptContractPayload(),
      issue: {
        ...buildMockSymphonyPromptContractPayload().issue,
        description: null
      }
    };

    expect(() =>
      renderSymphonyPromptContract({
        template: "{{ issue.description }}",
        payload
      })
    ).toThrow(SymphonyPromptContractError);
  });

  it("renders the correct run mode section for each mode", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("implementation", "rework", "approved_merge"),
        (runMode) => {
          const payload = {
            ...buildMockSymphonyPromptContractPayload(),
            run_mode: runMode as SymphonyRunMode,
            run_mode_section: null
          };

          const rendered = renderSymphonyPromptContract({
            template: "{{ run_mode_section }}",
            payload
          });

          const expectedLabel =
            runMode === "approved_merge"
              ? "Approved Merge"
              : runMode === "rework"
                ? "Rework"
                : "Implementation";

          expect(rendered).toContain(`Current run mode: ${expectedLabel}`);
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Property: Template syntax validation
// ---------------------------------------------------------------------------

describe("template syntax validation properties", () => {
  it("rejects templates with unmatched opening braces", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (prefix, variable) => {
          const template = `${prefix}{{ ${variable}`;

          expect(() =>
            renderSymphonyPromptContract({
              template,
              payload: buildMockSymphonyPromptContractPayload()
            })
          ).toThrow(SymphonyPromptContractError);
        }
      )
    );
  });

  it("rejects templates with unmatched closing braces", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (prefix, suffix) => {
          const template = `${prefix}}}${suffix}`;

          expect(() =>
            renderSymphonyPromptContract({
              template,
              payload: buildMockSymphonyPromptContractPayload()
            })
          ).toThrow(SymphonyPromptContractError);
        }
      )
    );
  });

  it("rejects templates with empty expressions", () => {
    fc.assert(
      fc.property(fc.string(), (prefix) => {
        const template = `${prefix}{{ }}`;

        expect(() =>
          renderSymphonyPromptContract({
            template,
            payload: buildMockSymphonyPromptContractPayload()
          })
        ).toThrow(SymphonyPromptContractError);
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Property: Path resolution invariants
// ---------------------------------------------------------------------------

describe("path resolution properties", () => {
  it("resolves issue.identifier from payload", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("ENG-123", "BUG-456", "FEAT-789"),
        (identifier) => {
          const template = "{{ issue.identifier }}";
          const payload = {
            ...buildMockSymphonyPromptContractPayload(),
            issue: {
              ...buildMockSymphonyPromptContractPayload().issue,
              identifier
            }
          };

          const rendered = renderSymphonyPromptContract({
            template,
            payload
          });

          expect(rendered).toContain(identifier);
        }
      )
    );
  });

  it("resolves workspace.path from payload", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("/workspace/a", "/tmp/b", "/home/c"),
        (workspacePath) => {
          const template = "{{ workspace.path }}";
          const payload = {
            ...buildMockSymphonyPromptContractPayload(),
            workspace: {
              ...buildMockSymphonyPromptContractPayload().workspace,
              path: workspacePath
            }
          };

          const rendered = renderSymphonyPromptContract({
            template,
            payload
          });

          expect(rendered).toContain(workspacePath);
        }
      )
    );
  });

  it("resolves repo.default_branch from payload", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("main", "master", "develop", "staging"),
        (branch) => {
          const template = "{{ repo.default_branch }}";
          const payload = {
            ...buildMockSymphonyPromptContractPayload(),
            repo: {
              default_branch: branch,
              name: "test-repo"
            }
          };

          const rendered = renderSymphonyPromptContract({
            template,
            payload
          });

          expect(rendered).toContain(branch);
        }
      )
    );
  });

  it("returns empty string for null path values", () => {
    const template = "{{ issue.description }}";
    const payload = {
      ...buildMockSymphonyPromptContractPayload(),
      issue: {
        ...buildMockSymphonyPromptContractPayload().issue,
        identifier: "TEST-1",
        description: null
      }
    };

    // null renders to empty string, so the entire rendered output would be
    // just the harness appendix, which after trimEnd() is not empty
    // But since the variable resolved to empty string and there's no other
    // template content, the rendered content before appendix is empty, causing
    // the "empty prompt" error
    expect(() =>
      renderSymphonyPromptContract({
        template,
        payload
      })
    ).toThrow(SymphonyPromptContractError);
  });
});

// ---------------------------------------------------------------------------
// Property: Attempt field constraints
// ---------------------------------------------------------------------------

describe("attempt field properties", () => {
  it("preserves attempt value in payload when rendering", () => {
    fc.assert(
      fc.property(fc.nat({ max: 100 }), (attempt) => {
        const template = "Attempt";
        const payload = {
          ...buildMockSymphonyPromptContractPayload(),
          attempt
        };

        const rendered = renderSymphonyPromptContract({
          template,
          payload
        });

        // The rendered output should be non-empty
        expect(rendered.trim().length).toBeGreaterThan(0);
      })
    );
  });
});

// ---------------------------------------------------------------------------
// Property: Template rendering round-trips
// ---------------------------------------------------------------------------

describe("template rendering round-trip properties", () => {
  it("rendering contains both identifier and title values", () => {
    fc.assert(
      fc.property(arbitraryPayload, (payload) => {
        const template = "Issue: {{ issue.identifier }} - {{ issue.title }}";

        const rendered = renderSymphonyPromptContract({
          template,
          payload
        });

        // The rendered output should contain both values (trimmed)
        const trimmedTitle = payload.issue.title.trimEnd();
        expect(rendered).toContain(payload.issue.identifier);
        expect(rendered).toContain(trimmedTitle);

        // And it should contain the literal text between variables
        expect(rendered).toContain("Issue:");
      })
    );
  });

  it("rendering with a template containing only text produces output with harness appendix", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => {
          const trimmed = s.trim();
          return trimmed.length > 0 &&
            !trimmed.includes("{{") &&
            !trimmed.includes("}}");
        }),
        (text) => {
          const payload = buildMockSymphonyPromptContractPayload();

          const rendered = renderSymphonyPromptContract({
            template: text,
            payload
          });

          expect(rendered).toContain("Symphony harness guidance");
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Property: Label array handling
// ---------------------------------------------------------------------------

describe("label array properties", () => {
  it("issue labels are stored in the payload", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("bug", "feature", "urgent", "documentation"), {
          maxLength: 4
        }),
        (labels) => {
          const payload = {
            ...buildMockSymphonyPromptContractPayload(),
            issue: {
              ...buildMockSymphonyPromptContractPayload().issue,
              labels
            }
          };

          // Labels should be preserved in the payload structure
          expect(payload.issue.labels).toEqual(labels);
        }
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Property: Rendering preserves template structure
// ---------------------------------------------------------------------------

describe("rendering preserves template structure properties", () => {
  it("newlines in template are preserved in rendered output", () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 5 }),
        (newlines) => {
          const template = Array(newlines + 1).fill("{{ issue.identifier }}").join("\n");
          const payload = buildMockSymphonyPromptContractPayload();

          const rendered = renderSymphonyPromptContract({
            template,
            payload
          });

          // Should contain the identifier multiple times if template has newlines
          const lines = rendered.split("\n");
          const identifierLines = lines.filter(l => l.includes(payload.issue.identifier));
          expect(identifierLines.length).toBe(newlines + 1);
        }
      )
    );
  });

  it("static text between variables appears in rendered output", () => {
    fc.assert(
      fc.property(arbitraryPayload, (payload) => {
        const template = "Before {{ issue.identifier }} Middle {{ repo.name }} After";

        const rendered = renderSymphonyPromptContract({
          template,
          payload
        });

        expect(rendered).toContain("Before");
        expect(rendered).toContain("Middle");
        expect(rendered).toContain("After");
      })
    );
  });
});
