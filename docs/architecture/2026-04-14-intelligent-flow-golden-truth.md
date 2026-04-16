# Intelligent-Flow Golden Truth

Date: 2026-04-14

Status: Active target architecture aligned with the implementation-first cleanup

Audience:

- Symphony maintainers
- Symphony control-plane implementers
- Symphony UI and read-model implementers
- Future contributors making cuts against the current system

Related documents:

- [`2026-04-09-workflow-router-architecture.md`](2026-04-09-workflow-router-architecture.md)
- [`2026-04-10-router-authority-and-ingress.md`](2026-04-10-router-authority-and-ingress.md)
- [`2026-04-11-lifecycle-authority-matrix.md`](2026-04-11-lifecycle-authority-matrix.md)
- [`../adr/2026-04-08-runtime-result-command-contract.md`](../adr/2026-04-08-runtime-result-command-contract.md)
- [`../adr/2026-04-13-intelligent-flow-contract.md`](../adr/2026-04-13-intelligent-flow-contract.md)
- [`../plans/2026-04-13-router-hardening-and-e2e-stabilization-plan.md`](../plans/2026-04-13-router-hardening-and-e2e-stabilization-plan.md)

## Purpose

This document defines the single source of truth for Symphony's next simplification pass.

The goal is not to preserve every investment made so far.

The goal is to define the smallest coherent product and control-plane model that:

- keeps the intelligent router direction
- removes redundant workflow concepts
- collapses legacy completion semantics
- stabilizes one golden path end to end
- gives future deletion work a clear authority

This document should be used to answer:

- what Symphony is
- what Symphony is not
- which concepts survive
- which packages survive
- how a run completes
- how the router transitions after completion
- what we cut first
- what we test first

If existing code conflicts with this document, the code is wrong unless a later accepted ADR overrides this document.

## Core Thesis

Symphony should operate as a router-first development control plane whose primary execution module is:

- `implement.spec`

The contract may still define bounded follow-up verifier or reporting modules, but those are
follow-up modules inside the same lifecycle shell, not separate workflow phases like `rework`,
`approved_merge`, or `merge.execute`.

The router chooses whether to:

- execute the module
- wait for user input
- mark the workflow blocked
- mark the workflow done

The system should not rely on:

- slash commands to re-enter the flow
- `finish`-style tool commands as the main completion boundary
- multiple concurrent workflow presets
- PR automation, merge automation, or review automation as part of the initial golden path
- ambiguous read models compensating for unstable backend behavior

The first stable product is not:

- a general-purpose autonomous SDLC platform

The first stable product is:

- an issue enters the queue
- the router chooses `implement.spec`
- the agent executes one bounded implementation run
- the run ends with a structured terminal result
- the router transitions from that result
- the system explains exactly what happened

Everything else is deferred.

## Product Boundary

### What Symphony Is

Symphony is a control plane that:

- attaches a router-owned workflow to a tracker issue
- selects the next admissible module for that issue
- launches a run to execute that module
- records a durable narrative of the run
- interprets the run's structured terminal result
- transitions the workflow accordingly

### What Symphony Is Not

Symphony is not:

- a PR automation product
- a merge queue product
- a slash-command orchestration product
- a generalized review engine in phase one
- a UI-first observability tool
- a system where a plain-English "done" message is authoritative

## Non-Negotiable Principles

- One concept has one meaning.
- One authority owns each lifecycle boundary.
- Structured terminal results beat natural-language summaries.
- Full-fidelity event and output storage beats truncation-first storage.
- Read models are projections, not lifecycle authority.
- The router decides what happens next.
- The agent executes one bounded module at a time.
- The golden path must pass in deterministic E2E replay before new branches are added.
- If a feature does not strengthen the golden path, it is a cut candidate.

## Canonical Vocabulary

These terms are mandatory and should be used consistently across code, tests, prompts, APIs, and UI.

### Issue

A tracker-owned work item.

Examples:

- a Linear ticket
- a GitHub-backed work item in future integrations

The issue is not the workflow.

### Workflow

A router-owned durable lifecycle record for one issue.

The workflow is the authority for:

- current route state
- selected module
- module attempt history
- blocked or awaiting-input state
- done state

The workflow is not the workspace.

### Route State

A router-owned lifecycle state.

Current intelligent-flow route states are:

- `queued`
- `claimed`
- `active`
- `awaiting_input`
- `blocked`
- `paused`
- `failed`
- `done`

These are not modules.

The UI may collapse `claimed` and `active` into a simpler "executing" presentation, but the router
contract keeps them distinct.

### Module

A bounded executable unit chosen by the router.

Phase one requires exactly one primary implementation module:

- `implement.spec`

The current contract may retain bounded verification and reporting modules, but they only exist as
follow-up modules inside intelligent-flow. They do not reintroduce review, rework, or merge as
first-class lifecycle phases.

### Run

One concrete attempt to execute one module.

A run:

- belongs to one issue
- belongs to one workflow
- belongs to one selected module
- emits a durable event narrative
- ends in one terminal result

### Module Result

The structured terminal result emitted by the run.

A module result is the only authoritative completion boundary for intelligent-flow.

It replaces `symphony tool finish` in the golden path.

### Workspace

A disposable execution surface used by a run.

The workspace is not lifecycle authority.

The workspace may be:

- preserved for inspection
- destroyed after completion

Neither choice changes the workflow truth.

### Observability Event

An append-only record of something that happened.

Examples:

- router selected `implement.spec`
- run launched
- command started
- command updated
- command completed
- module result parsed
- workflow entered `blocked`

Observability events are not reduced summaries pretending to be authority.

### Evidence

Artifacts or structured facts produced by a module result.

In phase one, evidence is limited to implementation-oriented delivery facts tied to `implement.spec`.

### Router Decision

The recorded explanation for why the router selected a module or route state transition.

The decision should be inspectable, but it is not itself a module result.

## The Golden Path

The golden path is the only path we optimize for until it is stable.

### Golden Path Sequence

1. An issue becomes dispatchable.
2. Symphony ensures a workflow exists for that issue.
3. The workflow enters `queued`.
4. The router evaluates the workflow and selects `implement.spec`.
5. Symphony launches one run for `implement.spec`.
6. The agent performs implementation work.
7. The run emits a structured terminal module result.
8. The router interprets the result.
9. The workflow transitions to one of:
   - `done`
   - `awaiting_input`
   - `blocked`
   - `queued` again if a retryable execution failure should be retried later
10. The UI renders the route state, selected module, current run, and event narrative plainly.

### Golden Path Outcomes

`implement.spec` may end in:

- `completed`
- `awaiting_input`
- `blocked`
- `failed_transient`
- `failed_permanent`
- `invalid_result`
- `missing_terminal_result`

These are module results, not tracker states.

### Golden Path Transition Rules

`completed` means:

- the module believes the requested implementation work is complete
- the module supplied required structured delivery fields
- the router can now decide whether the workflow is `done`

`awaiting_input` means:

- the module cannot continue without explicit user input
- the workflow transitions to `awaiting_input`
- a later user answer re-queues the workflow for the same module family

`blocked` means:

- the module hit a blocker outside its authority
- the workflow transitions to `blocked`

`failed_transient` means:

- execution failed for an infrastructure or provider reason that may succeed later
- the workflow remains resumable

`failed_permanent` means:

- execution failed in a way the router should not auto-continue from
- the workflow records the failure and waits for operator intervention

`invalid_result` means:

- the run attempted completion but produced an unparsable or invalid terminal payload
- this is a first-class failure mode, not a silent fallback

`missing_terminal_result` means:

- the run ended or went idle without producing a terminal module result
- this is also a first-class failure mode

## Completion Contract

### The Old Model We Are Leaving

The old model expected implementation work to cross the delivery boundary through a command like:

- `symphony tool finish`

That model created several problems:

- completion lived in CLI semantics instead of the run protocol
- prompts, runtime tools, router behavior, and tracker transitions drifted apart
- a run could look complete in English but still be incomplete to the control plane

### The New Model We Are Adopting

The intelligent-flow path ends through a structured terminal module result emitted by the run itself.

Natural-language completion text may still exist for operator readability, but it is never authoritative.

### Required Properties Of A Terminal Module Result

The terminal result must include:

- `schemaVersion`
- `moduleId`
- `outcome`
- `summary`
- `evidence`
- `requestedState`
- `nextInputPrompt` when `outcome=awaiting_input`
- `blockers` when `outcome=blocked`

### Phase-One Result Shape

The exact transport may evolve, but the canonical meaning is:

```json
{
  "schemaVersion": "1",
  "moduleId": "implement.spec",
  "outcome": "completed",
  "summary": "Implemented the requested issue behavior.",
  "evidence": {
    "filesChanged": ["apps/api/src/example.ts"],
    "verification": [
      {
        "command": "pnpm --filter @symphony/api test -- src/example.test.ts",
        "status": "passed"
      }
    ],
    "notes": "Scoped the change to the runtime issue detail serializer."
  },
  "requestedState": "done",
  "nextInputPrompt": null,
  "blockers": []
}
```

### Parsing Rules

- The parser must fail closed.
- Partial or informal matches are invalid.
- A natural-language summary without a valid structured result is not completion.
- A malformed result records `invalid_result`.
- A run that ends without a result records `missing_terminal_result`.

## Router Semantics

### What The Router Owns

The router owns:

- workflow creation
- route-state transitions
- module selection
- retry eligibility
- interpretation of module results

### What The Router Does Not Own

The router does not own:

- shell command execution details
- workspace materialization details
- raw tracker API transport
- UI rendering

### Phase-One Router Policy

The default path must start with:

- `implement.spec`

The contract may permit bounded follow-up modules that consume implementation evidence, such as:

- `critic.code_review`
- `critic.adversarial_tests`
- `critic.browser_test` when runtime support is explicitly enabled
- `blocked.report`

The router should never reintroduce:

- merge modules
- PR modules
- review-rework lifecycle phases
- approved-merge lifecycle phases

The browser module remains optional and must stay disabled unless runtime support and policy allow
it.

## Timeout And Stall Truth

Timeouts and stalls are different concepts and must remain different concepts.

### Command Timeout

A command timeout is a tool-level event inside a run.

It should:

- be recorded in the run narrative
- be visible to the agent as a recoverable command failure
- not automatically terminate the entire run

The run may continue after a command timeout if the agent can recover.

### Run Stall

A run stall means:

- the run is making no meaningful progress
- there is no live command activity
- there are no new agent events
- there is no structured terminal result

A run must not be marked stalled solely because it is quiet while a subprocess is still alive.

### Max-Turn Exhaustion

Max-turn exhaustion is distinct from both command timeout and stall.

It means:

- the run consumed its turn budget without producing a terminal result

### Phase-One Rule

An active command prevents stall classification.

If the harness knows a subprocess is still running, the run is not stalled.

## Storage Truth

### Canonical Storage Rule

Symphony should store full outputs and full payloads as the canonical record.

That includes:

- full command output
- full terminal result payloads
- full structured tool payloads when needed for replay or debugging

### What We Are Moving Away From

We should not treat truncated previews as canonical stored truth.

Previews may still exist for rendering convenience, but they must be derived from the full stored output, not replace it.

### Read-Model Rule

Any preview, excerpt, truncation, or summary displayed in UI is a read-model convenience only.

The source of truth remains the full event or output record.

## Observability Truth

The UI should answer five questions plainly:

1. What route state is the issue in right now?
2. What module is selected right now?
3. What is the run doing right now?
4. What was the last router decision and why?
5. What exact events occurred in order?

The UI does not need to be visually ambitious yet.

The UI does need to be unambiguous.

### Minimum Observability Surface

For each issue workflow, we need:

- current route state
- selected module
- active run status
- current command
- last agent event timestamp
- last command update timestamp
- last router decision summary
- event log
- full command output on demand
- structured terminal result on demand

## What We Keep

These concepts survive phase one:

- issue
- workflow
- route state
- module
- run
- module result
- workspace
- router decision
- observability event

These packages likely survive phase one:

- `apps/api`
- `apps/web`
- `packages/router`
- `packages/db`
- `packages/tracker`
- `packages/workspace`
- `packages/agent-harnesses`
- `packages/contracts`
- `packages/env`
- `packages/errors`
- `packages/logger`

## What We Collapse

These packages should justify themselves quickly or collapse into stronger owners:

- `packages/orchestrator`
- `packages/runtime`
- `packages/runtime-policy`
- `packages/runtime-tools`
- `packages/runtime-run-ledger`
- `packages/forensics`
- `packages/agent-analytics`
- `packages/test-support`

The likely direction is:

- router and API own lifecycle truth
- DB owns durable storage and read-side helpers
- workspace owns execution-surface mechanics
- harnesses own agent transport

If a package only exists to preserve old boundaries, it is a collapse candidate.

## What We Cut First

These features are outside the phase-one golden path and should be removed or disabled aggressively:

- `current-flow` as an active preset
- slash-command re-entry such as `/rework`
- PR automation as part of the default path
- merge automation as part of the default path
- review-specific routing as part of the default path
- `finish` as the completion boundary for intelligent-flow
- tracker-state hacks that simulate router truth
- UI sections that exist only to compensate for unstable backend contracts

## Phase-One Module Surface

The required execution module in phase one is:

- `implement.spec`

The current contract may still define bounded follow-up modules:

- `critic.code_review`
- `critic.adversarial_tests`
- `critic.browser_test` when explicitly enabled
- `blocked.report`

The following are explicitly removed from the intelligent-flow lifecycle:

- PR modules
- merge modules
- `approved_merge`
- review-rework routing loops

This is not a statement that those modules are bad.

This is a statement that they are not part of the active lifecycle shell we are standardizing.

## E2E Replay Strategy

We will build deterministic `.e2e.test.ts` coverage around real captured run data.

### Fixture Sources

Fixtures should be derived from:

- real run event logs
- real command narratives
- real terminal results
- sanitized runtime DB exports when useful

### Fixture Format

The fixture format should be JSON.

Each fixture should capture:

- issue input
- workflow seed state
- router decision input
- run event transcript
- terminal module result
- expected workflow transition

### Required Phase-One Scenarios

- `implement.spec -> completed -> done`
- `implement.spec -> awaiting_input`
- `implement.spec -> blocked`
- `implement.spec -> failed_transient`
- `implement.spec -> failed_permanent`
- `implement.spec -> invalid_result`
- `implement.spec -> missing_terminal_result`
- active command remains alive without being marked stalled
- command timeout is surfaced without killing the run immediately

## Deletion Rules

Deletion is not optional cleanup.

Deletion is part of the design.

We should delete code when:

- it exists only for `current-flow`
- it exists only for `finish`-style completion
- it exists only for slash-command based re-entry
- it exists only for PR or merge automation outside the golden path
- it exists only to reconcile duplicate lifecycle authorities
- it exists only because previews were treated as authority

## Migration Rules

During simplification:

- it is acceptable to break non-golden-path behavior
- it is acceptable to delete tests that enforce obsolete behavior
- it is acceptable to collapse packages if the resulting ownership is clearer
- it is acceptable to remove compatibility shims without replacement

What is not acceptable:

- introducing another lifecycle authority
- keeping obsolete behavior "just in case"
- letting UI requirements redefine workflow truth
- keeping `finish` alive in the intelligent path because it feels familiar

## Definition Of Phase-One Success

Phase one is successful when all of the following are true:

- only `intelligent-flow` matters operationally
- only `implement.spec` executes in the default path
- the run ends through a structured terminal result, not `finish`
- the router transitions cleanly from that result
- active commands do not cause false stalls
- command timeouts do not automatically kill healthy runs
- the UI renders the workflow state and event narrative plainly
- deterministic E2E replay covers the full golden path
- legacy rework, PR, and merge paths are removed or disabled

## Final Rule

If a design choice improves optionality but makes the golden path harder to explain, test, or operate, reject it.

The product does not need more breadth right now.

The product needs one strong truth and one strong path.
