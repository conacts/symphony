# TODO

This document is the dumping ground for ideas we want to preserve without prematurely turning them into committed roadmap work.

The standard for adding something here is simple:

- the idea is directionally interesting
- the idea could matter to the product or runtime architecture later
- the idea is not yet mature enough to schedule or implement immediately

This is intentionally different from [PROJECT_SWEEPS_TODO.md](/Users/connorsheehan/.codex/worktrees/24b2/symphony/PROJECT_SWEEPS_TODO.md).

- `PROJECT_SWEEPS_TODO.md` is for structured cleanup and research sweeps we already intend to execute.
- `TODO.md` is for future-facing product, runtime, and platform ideas that need incubation first.

## Runtime And Sandbox Futures

These ideas came out of the Pi SDK runner migration and the comparison against Sandcastle.

They are worth preserving because they affect the long-term runtime shape of Symphony, but they are not the next implementation slices.

The current near-term priority remains:

1. harden timeout classification
2. harden terminal completion precedence
3. strengthen runtime-level tests around the real failure modes

Everything below is explicitly deferred until the runtime path is stable enough to support broader platform flexibility.

### 1. Support user-selected Docker images

Idea:
Allow a repository, runtime environment, or ticket configuration to select which Docker image Symphony uses for the workspace container.

Why this matters:
Right now Symphony owns a single workspace-runner image and starts every workspace from that image. That is simple and stable, but it also means the user does not get much control over the container substrate. Sandcastle exposes image selection directly in the provider factory, which is one reason it feels flexible: the caller can say "run this agent in image X" without changing Sandcastle internals.

What this would mean in Symphony:

- Symphony would still own the container lifecycle.
- Symphony would still start fresh containers itself.
- Symphony would not adopt an arbitrary running container.
- The difference would be that the user could choose the image Symphony starts.

Why this is attractive:

- Some repositories may need language runtimes or system packages that do not belong in the default runner image.
- This would decouple "how the container is provisioned" from "how Symphony orchestrates the run."
- It gives us a cleaner answer to the inevitable request for non-default environments without requiring a second runtime system.

Important constraint:
This should only be supported behind an explicit runner-image contract. We should not allow "any image at all" without validating whether the image actually contains the tools and filesystem assumptions Symphony needs.

Questions to answer later:

- Where does image selection live: env, DB, repository config, or ticket metadata?
- Is image selection repository-scoped, environment-scoped, or run-scoped?
- Which fields become part of the canonical runtime configuration model?
- Do we allow only allowlisted images or any image that passes preflight?

Recommended future shape:
This should eventually become first-class runtime configuration, likely stored in the control plane rather than only in environment variables.

### 2. Validate a Symphony runner image contract

Idea:
If Symphony is going to support user-selected images, it needs a concrete, testable image contract.

Why this matters:
Image selection without a contract is just runtime roulette. The product would become harder to reason about because we would no longer know whether missing behavior came from a bad prompt, a bad model result, or a bad container environment.

What the image contract likely needs:

- a shell we explicitly support
- `git`
- `node`
- `pi`
- any other hard runtime dependencies we truly require
- a writable agent home
- a predictable workspace mount path
- the Symphony Pi SDK runner executable at a known path

Why this is valuable even if we keep one image:
The contract is useful even before custom images. It makes our own image less ad hoc, improves preflight clarity, and gives us a stable surface to test.

Recommended future shape:
We should expose this as a preflight validator with dense error messages, not as a vague runtime failure after dispatch has already started.

### 3. Distinguish "custom image" from "attach to any existing container"

Idea:
Keep these as separate concepts rather than blending them together.

Why this matters:
The phrase "let the user select the container" can mean two different things:

1. the user selects which image Symphony should start
2. the user points Symphony at an already-running container and asks Symphony to adopt it

Those are not the same feature.

Why custom image selection is reasonable:

- Symphony still owns lifecycle and invariants.
- We still know how the container started.
- We can run preflight before dispatch.
- Failure modes stay understandable.

Why arbitrary existing-container adoption is much harder:

- The container may not have the right toolchain.
- The filesystem may not be writable.
- Node may not exist.
- The current user may not be able to execute our runner.
- The container may already be serving another purpose and should not be mutated.
- The container may not even be safe to treat as a disposable agent environment.

Product conclusion:
If we ever support existing-container adoption, it should be a separate backend mode with its own explicit contract and tests. It should not be a casual extension of the current Docker image path.

Current recommendation:
Do not pursue existing-container adoption until long after the current runtime path is stable.

### 4. Replace the image-internal Node launch string with a stable executable

Idea:
Stop relying on a long `node --import ...` command string in the runtime launch path. Instead, install a stable image-owned executable such as `/usr/local/bin/symphony-pi-runner`.

Why this matters:
We found a real bug during the image migration:

- the container contained the right runtime files
- but `node --import tsx ...` failed because bare `tsx` resolution depended on the current working directory
- the fix was to use the absolute path to the loader inside the image

That fix is correct, but it also shows that the launch surface is still too implementation-shaped.

What a better shape looks like:

- image contains the runner executable
- launcher invokes `symphony-pi-runner`
- the executable itself knows where its bundled loader and entrypoint live

Why this is better:

- shorter launch command
- less path fragility
- easier debugging
- easier image validation
- easier future compatibility when the runner internals change

Recommended future shape:
This likely becomes the next packaging cleanup after timeout hardening is finished.

### 5. Bundle the Pi SDK runner instead of relying on `tsx` at runtime

Idea:
Move the in-image runner from "TypeScript source plus local `tsx` loader" to a bundled JavaScript artifact.

Why this matters:
The current image-owned runner is already a big improvement over source lookup through the admitted repo, but it still relies on a runtime TypeScript loader. That is not ideal as a final deployment surface.

What a bundled runner would improve:

- remove `tsx` from runtime execution
- reduce moving parts inside the image
- simplify the launch command and wrapper script
- reduce the chance of module-resolution drift
- make the runner artifact feel like a true platform executable instead of a development convenience

Tradeoff:
This introduces a small packaging/build concern into the image pipeline. That is acceptable if the output artifact is stable and easy to reproduce.

Recommended future shape:

- compile or bundle one SDK runner entry artifact
- copy it into the image
- invoke it through a stable wrapper binary

### 6. Consider repository-scoped or DB-managed runner-image configuration

Idea:
If custom images become supported, define where that configuration truly lives.

Why this matters:
We do not want image selection to become another half-configured layer split between:

- shell environment
- repo files
- DB records
- UI-only state

The product should have one authority for runtime environment selection.

Likely good future direction:

- store image choice in the control plane
- make it editable through the UI
- scope it explicitly to repository, runtime environment, or queue configuration

Why not now:
The runtime substrate itself is still stabilizing. Solving configuration ownership before the runtime contract is settled would just create churn.

### 7. Allow additional user mounts for caches or toolchain acceleration

Idea:
Support optional host mounts into the workspace container for things like package-manager caches.

Why this matters:
Sandcastle exposes this in a straightforward way, and it is one of the few flexibility features that has a clear practical benefit without changing orchestration semantics.

Potential uses:

- npm cache
- pnpm store
- language-specific caches
- repository-specific dependency caches

Why this is attractive:

- faster bootstrapping
- better local iteration speed
- lower repeated dependency-install cost

Why it is not immediate:
It expands the workspace contract and requires careful validation and sanitization. We should not widen that surface while the core runtime semantics are still in flight.

### 8. Keep the Docker-only story unless a second backend solves a real problem

Idea:
Continue pushing toward one explicit, hardened Docker runtime path instead of reopening the runtime matrix too early.

Why this matters:
The main lesson from the recent runtime work is that simplicity is leverage. The more backend modes we support before the core runtime is trustworthy, the harder it becomes to reason about failures.

Current product stance:

- Pi is the only runtime
- Docker is the only sandbox backend we actively want
- the router and module system are the real product leverage, not backend variety

Deferred question:
If we ever revisit backend diversity, it should be because it solves a specific product constraint rather than because it is architecturally tempting.

## Research Notes Triggered By The Image Migration

These are not standalone features yet, but they should influence future work.

### 9. Explicit runner packaging reduced one class of runtime coupling

Observation:
Before the image migration, the container launch path depended on the platform repo source tree being visible inside the workspace container so it could execute the SDK runner entrypoint from source.

Why that was a problem:

- it blurred the boundary between "the admitted repo workspace" and "the Symphony platform runtime"
- it made the container launch story less general
- it increased path coupling between host and container

Current improvement:
The image now contains the SDK runner itself. That is a much better ownership model and should be preserved.

### 10. The `tsx` import bug is evidence that runtime launch needs one authoritative entrypoint

Observation:
The direct image smoke test failed because `node --import tsx` attempted to resolve `tsx` from the wrong location. The fix was to use an absolute loader path inside the image.

What this teaches us:

- even when the runtime files are correct, launch indirection can still be brittle
- command strings are a bad long-term interface
- packaging should converge on one stable executable or wrapper path

This should shape the future packaging cleanup work.

## Non-Goals For Now

These ideas should not distract from the current runtime slices.

- Do not add arbitrary existing-container adoption now.
- Do not add multiple runtime backends now.
- Do not redesign all runtime configuration ownership now.
- Do not overfit the product to Sandcastle semantics just because Sandcastle has a flexible provider API.

## Immediate Return To Track

After preserving these ideas, the current next slice remains the same:

1. implement real timeout class separation inside the Pi SDK runner
2. distinguish idle stall from legitimate long-running work with heartbeat
3. add targeted runtime tests proving terminal completion wins over later timeout noise

