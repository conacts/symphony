# Symphony Ticket Writing Spec

## Purpose

This document defines how Linear tickets should be written for Symphony-managed
agent work.

The goal is not generic backlog quality. The goal is to produce tickets that
agents can execute cleanly, review well, and finish within a narrow and
intentional execution lane.

Good Symphony tickets should:

- reduce ambiguity before the run starts
- constrain scope tightly enough that the agent can finish coherently
- make review easier by limiting concept count per PR
- define what counts as done
- define what is explicitly out of scope

## Core Principles

- Prefer many narrow tickets over few broad tickets.
- One ticket should usually produce one coherent PR.
- A ticket should change one main concept, not many unrelated concepts.
- If a ticket is likely to produce a noisy or hard-to-review PR, split it.
- Tickets should reduce the agent's search space instead of making the agent
  infer the whole plan.
- Touch points should guide the agent, not imprison it.
- Out of scope must be explicit.

## Ticket Types

Every ticket should declare one primary `Work Type`.

### Implementation Types

- `bugfix`
- `scaffold`
- `feature`
- `refactor`
- `cleanup`
- `observability`
- `performance`
- `ux_polish`
- `integration`

### Investigation Type

- `spike`

## Ticket Patterns

In addition to `Work Type`, tickets should usually fit one of these execution
patterns:

- `scaffold`
  - establish structure, interfaces, routes, shells, or wiring
  - not expected to deliver the full feature
- `slice`
  - implement one narrow end-to-end behavior
- `polish`
  - tighten or refine an existing behavior without changing the main design
- `spike`
  - investigate, compare, or de-risk; may recommend follow-up tickets instead
    of shipping production code

## PR Size Bands

Every implementation ticket should declare a `PR Size` expectation.

- `S`
  - one narrow fix or polish pass
- `M`
  - one bounded feature or refactor
- `L`
  - multi-step but still coherent implementation
- `XL`
  - intentionally broad or experimental; usually a sign the work should be
    split further unless we are explicitly testing agent limits

Important rule:

- `XL` is allowed, but `XL` is not the default.
- If a ticket naturally wants to become `XL`, split it unless there is a clear
  reason not to.

## Scope Expectations

For Symphony-managed work, the healthiest default is:

- one concept per ticket
- one coherent PR per ticket
- usually `S` or `M`

As a rough reviewability heuristic:

- small healthy PRs often land in the ~150-500 changed-line range
- ~300-600 changed lines is still healthy when the concept count remains low
- >1000 changed lines is usually a warning that the ticket is too broad
- ~2000 changed lines is almost always a scoping failure unless the work is a
  deliberate migration or generated artifact update

Do not put explicit line-count targets into the ticket body. Use `PR Size` as
the planning signal and split the work accordingly.

## File Constraints

Tickets should reduce search space by pointing the agent at the most likely
areas of change.

Use:

- `Likely Touch Points`
- `Likely New Files`
- `Avoid Touching`

Do not use:

- rigid "only edit these files" constraints unless the task genuinely requires
  that restriction

The right ticket should say:

- start here
- prefer working in these modules
- avoid broad cross-cutting edits unless required

## When To Split A Ticket

Split the ticket before implementation if any of the following are true:

- it changes more than one core concept
- it likely needs multiple unrelated module families
- it is difficult to describe the done condition in 3-6 acceptance criteria
- it has no clear out-of-scope boundary
- it likely produces an `XL` PR and we are not intentionally stress-testing the
  agent
- the first implementation step is "figure out the architecture"

If architecture is still uncertain, write a `spike` or `scaffold` ticket first.

## Implementation Ticket Template

Use this for `bugfix`, `scaffold`, `feature`, `refactor`, `cleanup`,
`observability`, `performance`, `ux_polish`, and `integration` work.

```md
## Problem

Describe the exact problem being solved.
Be concrete and operator-facing when possible.

## Desired Outcome

Describe the exact behavior expected after this ticket lands.

## Work Type

`bugfix|scaffold|feature|refactor|cleanup|observability|performance|ux_polish|integration`

## Execution Pattern

`scaffold|slice|polish`

## PR Size

`S|M|L|XL`

## Scope

Describe what this ticket is allowed to change.
Keep this narrow and concrete.

## Out of Scope

List what this ticket must not do.
Be explicit.

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Likely Touch Points

- `path/to/file-or-module`
- `path/to/file-or-module`

## Likely New Files

- `path/to/new-file` (if any)

## Avoid Touching

- `path/to/module-or-area`
- broad unrelated runtime policy changes
- unrelated UI cleanup

## Dependencies

- None

or

- Depends on <ticket>

## Notes For Agent

Add any execution guidance that reduces ambiguity without turning the ticket
into an implementation novel.
Examples:

- Prefer extending the existing runtime path instead of adding a parallel one.
- Reuse the existing serializer shape.
- Do not redesign surrounding modules as part of this ticket.
```

## Spike Ticket Template

Use this for investigation work where the main output is understanding,
recommendation, or de-risking.

Default spike expectation:

- no production code required
- result should usually be delivered as a detailed Linear comment
- small experiment code is allowed only when needed to answer the question

```md
## Question

What exact question should this spike answer?

## Why It Matters

Why is this uncertainty worth resolving now?

## Work Type

`spike`

## PR Size

`S|M|L|XL`

## Investigation Scope

Describe what the agent is allowed to investigate.

## Out of Scope

List what this spike must not do.
Examples:

- do not ship production-facing behavior changes
- do not perform a broad migration
- do not rewrite the current implementation

## Expected Output

The default output should be a detailed Linear comment containing:

- findings
- options considered
- recommendation
- risks
- suggested follow-up tickets

## Optional Experiment Scope

If code experiments are allowed, define the limits explicitly.

## Likely Touch Points

- `path/to/module-or-doc`
- `path/to/module-or-doc`

## Avoid Touching

- broad production code paths unless required for a small experiment

## Dependencies

- None

or

- Depends on <ticket>
```

## Ticket Writing Rules

### Rule 1: One Main Outcome

Every ticket must have one main outcome.

Bad:

- fix runtime completion semantics and redesign dashboard review views

Good:

- require explicit delivery for persisted runs

### Rule 2: Out Of Scope Is Mandatory

Every implementation ticket should explicitly say what it does not include.

This prevents accidental ticket expansion during the run.

### Rule 3: Acceptance Criteria Must Be Observable

Acceptance criteria should describe behavior we can verify.

Bad:

- [ ] code is cleaned up

Good:

- [ ] persisted runs fail if the agent ends without recording delivery
- [ ] successful delivery moves the issue to `In Review`

### Rule 4: Guide The Search Space

Give the agent likely touch points and avoided areas.

Do not make the agent infer the entire codebase entry point when we already
know where the work probably belongs.

### Rule 5: Prefer Scaffold Before Broad Feature Delivery

When a feature is too large for one coherent PR, start with a `scaffold`
ticket:

- establish structure
- define interfaces
- add shells or wiring
- leave full feature completion to later slice tickets

### Rule 6: Use Spikes To Reduce Uncertainty

If the first step is "figure out what approach we should take", write a spike
before writing the implementation ticket.

### Rule 7: Split On Concept Count, Not Just Size

Even a smaller PR can be too broad if it changes multiple unrelated concepts.

The enemy is not only line count. The enemy is review complexity.

### Rule 8: Tickets Should Narrow, Not Expand, Agent Freedom

The agent should still choose exact implementation details when appropriate, but
the ticket should remove ambiguity about:

- goal
- scope
- done condition
- forbidden expansion

## Example Implementation Ticket

```md
## Problem

Persisted Symphony runs can end successfully without recording explicit
delivery, which causes lifecycle ambiguity and extra cleanup turns.

## Desired Outcome

Persisted runs only succeed when delivery is reported explicitly through the
runtime delivery tool.

## Work Type

`bugfix`

## Execution Pattern

`slice`

## PR Size

`S`

## Scope

Align the persisted-run completion path so that missing delivery reports fail
the run instead of being treated as normal completion.

## Out of Scope

- renaming the delivery tool
- redesigning the review lifecycle
- changing Linear state names

## Acceptance Criteria

- [ ] persisted native Pi runs fail when no explicit delivery report is recorded
- [ ] persisted app-server runs keep the same explicit-delivery requirement
- [ ] targeted runtime tests cover both cases

## Likely Touch Points

- `apps/api/src/core/agent-harness-runtime.ts`
- `apps/api/src/core/agent-harness-runtime.test.ts`

## Likely New Files

- None

## Avoid Touching

- dashboard UI
- tracker config unrelated to delivery

## Dependencies

- None

## Notes For Agent

Keep the runtime policy change narrow. Do not redesign the surrounding harness
or review flow as part of this ticket.
```

## Example Spike Ticket

```md
## Question

Should Symphony replace the current Docker workspace backend with a minimal
sandbox platform for agent execution?

## Why It Matters

The current Docker path has more surface area than we may need and may be
costing reliability and performance.

## Work Type

`spike`

## PR Size

`S`

## Investigation Scope

Compare the current Docker backend against the candidate sandbox approach for:

- execution model fit
- lifecycle compatibility
- startup cost
- observability implications
- migration risk

## Out of Scope

- do not migrate the backend
- do not remove Docker support
- do not land production runtime changes

## Expected Output

Leave a detailed Linear comment with:

- findings
- tradeoffs
- recommendation
- risks
- proposed follow-up tickets

## Optional Experiment Scope

Small local experiments are allowed if needed to validate assumptions, but do
not leave production code changes behind unless explicitly requested.

## Likely Touch Points

- `packages/workspace/`
- `docs/architecture/symphony-runtime-operations.md`
- `docs/architecture/durable-issue-workspace-state-machine.md`

## Avoid Touching

- production runtime policy
- unrelated prompt work

## Dependencies

- None
```
