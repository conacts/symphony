# Intelligent-Flow Cutover Review

## Decision

`intelligent-flow` is now the default preset for new runtime workflow selection.

`current-flow` remains registered, but it is no longer the default path for new work. It is retained temporarily for three concrete reasons:

1. historical workflows may still be persisted with `routerPresetId = "current-flow"`
2. workflow comparison and replay still need an explicit legacy candidate
3. `auto-merge` still inherits the current-flow router contract and runtime adapter

This is a cutover, not a deletion.

## What Current-Flow Still Owns

The remaining ownership is narrow and explicit:

1. Legacy preset implementation in `packages/router/src/presets/current-flow/*`
2. Runtime adapter wrapper in `apps/api/src/core/runtime-current-flow-routing.ts`
3. Auto-merge inheritance path in:
   `packages/router/src/presets/auto-merge/symphony-auto-merge-flow-router.ts`
   `apps/api/src/core/runtime-auto-merge-routing.ts`
4. Historical workflow replay/comparison where a stored workflow is already bound to `current-flow`
5. Shared signal and command vocabulary names that still reuse current-flow contract helpers from the intelligent-flow runtime adapter

That last point is important: the runtime has already moved logically, but some signal factories and command readers still live under current-flow names. That is a naming debt, not lifecycle authority.

## What Intelligent-Flow Owns Now

After this slice, intelligent-flow owns the product default:

1. default runtime manifest selection for this repository
2. default registry selection when no preset override is provided
3. default mock/runtime-config fixtures used by the UI and runtime config surfaces
4. the module-centric observability path already added in slices 10 and 11

In practical terms, new work should enter the intelligent router unless a caller explicitly asks for another preset.

## Deletion List

These are the deletions or refactors still justified after the cutover:

1. Extract shared runtime signal/command helpers from current-flow naming so intelligent-flow and auto-merge stop depending on `createSymphonyCurrentFlow*` helpers.
2. Rebuild auto-merge on top of an extracted shared lifecycle shell or its own explicit contract instead of inheriting current-flow directly.
3. Delete current-flow replay fixtures after no production or comparison path needs them.
4. Remove current-flow-specific default assumptions from older tests as those tests are rewritten around intelligent-flow golden paths.
5. Remove the current-flow preset entirely once:
   historical workflows no longer need replay through it,
   auto-merge no longer inherits it,
   and no user-facing comparison surface depends on it.

## Explicit Non-Goals

This slice does not attempt to:

1. delete current-flow outright
2. rewrite auto-merge
3. rename the shared runtime signal vocabulary
4. migrate existing persisted workflows in-place

Those are follow-up cleanup tasks, not cutover prerequisites.

## Regression Bar

The regression bar for this slice is:

1. registry default resolves to `intelligent-flow`
2. explicit `current-flow` resolution still works
3. explicit `auto-merge` resolution still works
4. runtime config and mock fixtures advertise the new default correctly

## Why This Is The Correct Stopping Point

Retiring current-flow today would be premature because auto-merge still depends on it structurally.

Keeping current-flow as the default would also be wrong because it leaves the product on the legacy path even though the intelligent module router now exists, is observable, and has golden-path coverage.

So the correct cut is:

1. move the default to intelligent-flow
2. keep current-flow explicit-only
3. document the remaining ownership precisely
4. delete the leftover legacy path only after auto-merge and historical replay are decoupled
