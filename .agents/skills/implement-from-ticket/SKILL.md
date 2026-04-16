---
name: implement-from-ticket
description: Research the relevant codebase slice before editing, derive and answer the key design questions, implement the smallest coherent change, verify it, and iterate on failures. Use when implementing a feature, bug fix, rework ticket, or any non-trivial requested code change in an unfamiliar area of the codebase.
---

# Implement From Ticket

Use this skill when the requested work is not already obvious from one or two file reads.

The goal is not to understand the entire repository. The goal is to build a complete mental model of the smallest slice that explains the ticket, then make one coherent implementation pass instead of a sequence of guesses.

## Standard

Do not start editing until you can answer these from code:

1. What exact behavior must change?
2. What boundary owns that behavior today?
3. Which modules, types, and stores participate in the current flow?
4. What invariants or contracts must remain true?
5. What data shapes and state transitions are involved?
6. Which tests or existing callers define current behavior?
7. What is the narrowest safe change?
8. How will you prove the change works?

If you cannot answer one of these, keep researching.

## Workflow

### 1. Normalize the ticket

- Extract the required behavior, explicit constraints, non-goals, and completion signals.
- Separate what the ticket says from what you are inferring.
- Call out ambiguity if it would change ownership, data contracts, or scope.

### 2. Map the affected slice

- Use `rg` and targeted file reads to find the entry point, owner, types, tests, and neighboring implementations.
- Read the boundary first: route, handler, command, component, hook, job, schema, or public API.
- Then trace inward through the modules that actually own the concept.
- Find the canonical source of truth. Do not treat every caller as equally authoritative.

### 3. Ask the right questions

Ask these while tracing the code:

- Where does the request enter the system?
- Which module is the authority for this concept?
- Where do validation and state transitions live?
- Which persistence, network, queue, cache, analytics, or file side effects exist?
- What existing pattern handles the same class of change?
- What would regress if this change were wrong?

If two places both look authoritative, that is usually the bug or the design problem.

### 4. Answer the questions from code

- Prefer current implementation, types, and tests over comments.
- Use similar shipped features as exemplars, but verify the analogy before copying them.
- Read enough to explain the slice end to end, then stop expanding scope.
- Full repository comprehension is not the bar. Complete slice comprehension is.

### 5. Choose the change boundary

- Pick the smallest boundary that can own the behavior cleanly.
- Preserve existing naming and patterns unless they are part of the bug.
- Strengthen contracts instead of adding fallback logic or normalization.
- Do not add new abstraction layers unless the current structure cannot express the change safely.

Before editing, be able to state in a few sentences:

- where you will edit
- why that boundary owns the change
- which tests you will add or update
- which regressions you are guarding against

### 6. Implement in one coherent pass

- Make the primary behavior change first, then supporting types, call sites, and tests.
- Keep the write set focused.
- Prefer finishing the full behavior over leaving scaffolding behind.
- If the change grows wider than expected, stop and remap the slice before continuing.

### 7. Verify aggressively

- Run the narrowest commands that prove the contract: targeted tests, lint, typecheck, build, or an end-to-end path.
- Verify both the success path and the important failure or regression path when the contract changed.
- If you touched persistence or orchestration, verify the canonical store or real flow, not only helpers.

### 8. Recover by updating the model

- If verification fails, do not stack speculative patches.
- Read the failure carefully and identify which assumption was wrong.
- Update your mental model, then repair the root cause.
- Prefer one corrective pass over multiple symptom-level edits.

## Practical Heuristics

- The right slice usually includes the boundary, the owner, the contract, and the main tests.
- If you are bouncing between files without understanding ownership, stop and ask which module is authoritative.
- If you feel tempted to edit the first file that mentions the feature, you probably have not mapped the slice yet.
- If you are adding defensive fallback behavior to make things pass, you are probably hiding missing context or a violated invariant.

## Completion Bar

Before claiming ready to code:

- the behavior change is explicit
- the owner is clear
- the invariants are clear
- the verification plan is clear

Before claiming done:

- the behavior is implemented
- relevant verification ran
- failures were either fixed or called out with evidence

## Anti-Patterns

- Editing before identifying the owning boundary
- Copying similar code before understanding why it works
- Treating tests as documentation without reading the implementation
- Adding fallback logic to hide malformed or missing state
- Leaving the task with partial behavior and no verification
- Responding to a failed test by patching symptoms instead of revisiting the model
