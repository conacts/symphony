# Project Sweeps Todo

This document tracks the recurring research sweeps we want to run package by package across the repository.

The goal is not to run a repo-wide refactor blindly.
The goal is to inspect one package at a time, identify the strictest sensible contract for that package, and then land focused follow-up slices.

## Sweep Protocol

For each package sweep:

1. Identify the package boundary and its exported API.
2. Identify the canonical data model and persistence authority for that package.
3. Identify nullable and optional fields that are accidental instead of domain-real.
4. Identify weak runtime assertions that should become schema validation or fail-fast parsing.
5. Identify places where the package cannot be evolved in isolation because upstream and downstream layers are too tightly coupled.
6. Produce a short research write-up with findings, recommended slices, and explicit non-goals.
7. Land the smallest coherent hardening slice before moving on.

Expected outputs for each sweep:

- a short package-specific research document
- a ranked list of follow-up slices
- at least one strictness or cleanup slice landed

## Suggested Package Order

- `packages/router`
- `packages/db`
- `apps/api`
- `packages/orchestrator`
- `packages/tracker`
- `packages/runtime-contract`
- `packages/test-support`
- remaining support packages after the control-plane packages are stable

## Research Sweeps

### 1. Optionality And Nullability Enforcement

Goal:
Enforce more required fields starting at the database layer and persist that strictness all the way to the API surface.

Research questions:

- Which `optional` fields represent real product state versus weak contracts?
- Which `null` fields are legitimate lifecycle absence versus normalization debt?
- Which APIs are using one permissive shape to represent multiple modes?
- Which database columns should become `NOT NULL`, `CHECK`, or foreign-key constrained?
- Which projections are carrying fallback logic that should be rejected at write time instead?

Expected outputs:

- a package-level nullability audit
- a ranked list of fields to make required
- a migration and caller-repair plan for database-backed packages

### 2. Test Naming And Test Surface Separation

Goal:
Rename tests to explicit suffixes such as `.unit.test.ts`, `.int.test.ts`, and `.e2e.test.ts`, and make sure the test surface matches the real verification intent.

Research questions:

- Which tests are actually unit, integration, or end-to-end today?
- Which helpers or fixtures are mixing too many concerns?
- Which packages need integration seams before `.int.test.ts` is useful?
- Which current test files should be split instead of only renamed?

Expected outputs:

- a package-level test classification
- a rename plan
- a list of files that should be split before renaming

### 3. Effect.ts Error And Workflow Cleanup

Goal:
Use `effect` where it meaningfully improves error states, typed failure handling, and orchestration clarity.

Research questions:

- Which boundaries are already effect-shaped and which still leak raw exceptions?
- Which functions would benefit from typed error channels instead of implicit throw paths?
- Where are we writing repeated try/catch or normalization code that should collapse into a smaller effect-based API?
- Where would `effect` overcomplicate a simple boundary and therefore should not be introduced?

Expected outputs:

- a list of candidate boundaries for `Effect.Effect`
- a list of boundaries that should remain plain async/throw
- a first slice converting one coherent package boundary to typed failures

### 4. Zod Contract Enforcement

Goal:
Use `zod` as a schema-backed assertion layer so data is parsed into strict shapes instead of being conditionally tolerated.

Research questions:

- Which ingress points currently trust raw input too much?
- Which helper functions are acting like hand-rolled parsers and should become zod schemas?
- Which package surfaces should export parsed canonical models instead of raw loose objects?
- Which schemas belong at boundary layers only, and which are worth carrying deeper into the package?

Expected outputs:

- a list of ingress and persistence boundaries that need schemas
- a list of existing ad hoc parsing helpers to replace
- a first-pass schema map per package

### 5. Advanced TypeScript And `src/types` Package Structure

Goal:
Use stronger TypeScript patterns where they improve clarity, and evaluate moving larger shared type surfaces into `package/src/types` when that produces cleaner boundaries.

Research questions:

- Which large files are mixing runtime behavior and type-only structures?
- Which unions should become discriminated unions?
- Which helper types should be extracted instead of duplicated?
- Which generic and mapped-type utilities would actually reduce ambiguity instead of adding type cleverness?
- Which packages would benefit from `src/types` as a structural boundary, and which would become noisier?

Expected outputs:

- a package-level type organization recommendation
- a list of good candidates for `src/types`
- a shortlist of advanced-type utilities worth introducing

### 6. Package API Ergonomics

Goal:
Simplify the exported APIs from packages so they are explicit, coherent, and pleasant to use.

Research questions:

- Which package exports are too low-level or too fragmented?
- Which packages are exposing too many helpers instead of one authoritative surface?
- Where would a class, factory, or facade clarify usage?
- Where would a class only hide simple functional code and make the package worse?

Expected outputs:

- a package export inventory
- a recommendation for each package’s primary public surface
- a list of exports to collapse, rename, or move internal

### 7. Package Isolation And Dependency Boundaries

Goal:
Strengthen package separation so developers can evolve packages in isolation without having to push broad upstream and downstream changes for every refactor.

Research questions:

- Which packages currently depend on internals they should not know about?
- Which exported shapes are too tightly coupled to `apps/api` or other control-plane layers?
- Which packages need adapter seams so they can be tested and evolved independently?
- Which package boundaries are currently leaking persistence or orchestration details?

Expected outputs:

- a dependency-boundary review per package
- a list of adapters or anti-corruption layers to introduce
- a list of package contracts that should stop depending on app-level concerns

## Router First Focus

Until the router package is clean and stable, it remains the first target for hardening work.

Router-specific priorities:

- remove accidental optionality from router envelopes
- require strict signal, command, decision, and trace shapes
- make command and signal payload parsing explicit
- keep routing history authoritative
- preserve a package API that is strict internally but still practical to integrate

## Research Deliverable Template

When we run a package sweep, the write-up should answer:

1. What is the canonical authority in this package?
2. Which contracts are too weak?
3. Which contracts are too broad because they represent multiple modes?
4. Which contracts should become schemas?
5. Which exports should remain public?
6. Which follow-up slice should land first?
