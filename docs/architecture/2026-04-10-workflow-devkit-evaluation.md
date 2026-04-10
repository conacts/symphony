# Workflow DevKit Evaluation

Date: 2026-04-10

## Purpose

Evaluate whether Vercel Workflow DevKit should become part of Symphony's long-running execution
stack, and define the correct timing and architectural boundary for introducing it.

This document is intentionally opinionated.

It answers:

- what Workflow DevKit is good at
- what it should not replace in Symphony
- how it compares to Linear and the router
- why the right time to introduce it is later, not now
- what a safe adoption path would look like once the current hard cuts are complete

## Short Answer

Workflow DevKit looks like a strong fit for Symphony's durable execution layer.

It does **not** look like a replacement for:

- the workflow router
- the router journal
- Linear ticket state
- Symphony's control-plane semantics

The right time to introduce Workflow DevKit is **after**:

- the router owns lifecycle authority
- legacy routing paths are removed
- package and app cleanup passes are complete
- contracts are stricter and less nullable
- recovery behavior is already well-defined in our own model

In other words:

**Workflow DevKit should be added after the hard cuts, not during them.**

## Core Position

Workflow DevKit and the router solve different problems.

The router answers:

- what workflow state Symphony is in
- why it moved there
- what signal caused the move
- what command should happen next
- whether the system is allowed to progress

Workflow DevKit answers:

- how to run durable, long-lived execution safely
- how to pause without burning compute
- how to resume from hooks or webhooks
- how to survive restarts and deployments
- how to model long waits, approvals, and resumptions cleanly

If we collapse those responsibilities together too early, we will blur the exact boundary we are
trying to sharpen.

So the correct relationship is:

- the router remains the control-plane authority
- Workflow DevKit becomes a candidate execution substrate underneath it

That means:

**router decides, workflow runs**

not:

**workflow decides the product lifecycle**

## Linear Is Not A Substitute For Workflow DevKit

It is tempting to say that Linear is already "holding the state" for us, so maybe it covers the
same role.

It does not.

Linear is good at:

- business-visible ticket status
- team coordination
- operator interaction
- external product state

Linear is not good at:

- durable internal execution stacks
- pausing and resuming process-level work
- waiting safely for callbacks for hours or days
- hook/webhook based continuation semantics
- replaying an execution boundary with typed program state

So the correct mental model is:

- Linear stores business-facing tracker state
- router history stores Symphony's workflow progression authority
- Workflow DevKit would store durable execution continuity for a running command or long-lived task

Those are three different layers.

They should not be conflated.

## What Workflow DevKit Appears To Be Good At

Based on the current Workflow DevKit documentation, it is especially well-suited for:

- long-running workflows that survive restarts and deployments
- explicit pause/resume flows
- human approval or operator-in-the-loop waits
- webhook or hook based resumption from external systems
- resumable streams
- durable AI agent loops that span multiple turns or multiple waits

The parts most relevant to Symphony are:

- hooks and webhooks for typed resume points
- human-in-the-loop patterns for approvals
- durable workflow execution that can sleep or wait without active compute
- event-sourced execution semantics

That aligns with several Symphony needs:

- waiting for review
- waiting for merge outcomes
- waiting for CI or GitHub callbacks
- long-running agent sessions
- recovery after restart while work is still logically in progress

Official docs reviewed for this evaluation:

- `https://useworkflow.dev/llms.txt`
- `https://useworkflow.dev/docs/ai/human-in-the-loop`
- `https://useworkflow.dev/docs/foundations/hooks`
- `https://useworkflow.dev/docs/foundations/workflows-and-steps`
- `https://useworkflow.dev/docs/how-it-works/event-sourcing`

## What Workflow DevKit Should Not Replace

This needs to stay explicit.

Workflow DevKit should **not** replace:

### 1. Router authority

The router journal must remain Symphony's source of truth for workflow progression.

If Workflow DevKit becomes the place where route truth lives, we will reintroduce hidden lifecycle
authority under a different name.

### 2. Linear state

Linear remains the external tracker and business-facing state boundary.

Workflow DevKit is not a replacement for project management state.

### 3. Router graph semantics

The meaning of:

- `bootstrapping`
- `implementation`
- `rework`
- `review`
- `approved_merge`
- `blocked`
- `paused`
- `failed`

should remain Symphony-owned semantics.

Workflow DevKit can execute commands that correspond to those states, but it should not define the
meaning of those states.

### 4. Symphony's contract layer

Claims, evidence, critics, routing policies, and approval rules are product semantics.

They belong in Symphony.

Workflow DevKit can help execute them durably.

It should not become the home of those decisions.

## The Correct Layering

The layering I would aim for is:

### Layer 1: Linear

Owns:

- business-visible ticket state
- human-visible project workflow
- external collaboration surface

Examples:

- `Todo`
- `In Progress`
- `In Review`
- `Approved`
- `Done`

### Layer 2: Router journal

Owns:

- internal workflow progression
- signal history
- decisions
- emitted commands
- command settlements
- replay and explainability

This remains Symphony's control plane.

### Layer 3: Durable execution substrate

Candidate: Workflow DevKit

Owns:

- execution continuity for long-running tasks
- pause/resume behavior
- callback waiting
- approval waits
- durable continuation for a single execution path

### Layer 4: Runtime side effects

Owns:

- tracker mutations
- comments
- GitHub operations
- workspace lifecycle
- agent invocation
- merge operations

This is where concrete commands execute.

## Why Now Is The Wrong Time

Even though Workflow DevKit looks promising, adding it now would be premature.

The main reason is simple:

we are still in the middle of removing shadow lifecycle authority.

If we introduce Workflow DevKit now, we will be changing:

- workflow authority
- execution substrate
- restart model
- runtime boundaries

all at once.

That is the wrong sequencing.

It would make it much harder to answer whether a bug came from:

- router design
- API cutover logic
- orchestration behavior
- Workflow DevKit semantics
- hook/webhook integration

The right strategy is to change one control-plane variable at a time.

## Why Later Is The Right Time

Once the hard cuts are done, Workflow DevKit becomes much more attractive.

At that point we should already have:

- router-owned lifecycle truth
- explicit signals
- explicit commands
- explicit command settlements
- recovery tests around our own history and snapshots
- stricter command and signal contracts

Then Workflow DevKit becomes a clean substitution candidate for one layer:

- how we execute long-running routed work

That is a much safer evaluation.

It lets us ask a focused question:

**does Workflow DevKit improve durable execution without damaging router authority?**

That is the right question.

## Recommended Timing

I agree with the proposed timing:

introduce Workflow DevKit only after:

- router integration is complete
- legacy routing authority is removed
- package-level cleanup passes are complete
- `apps/*` cleanup passes are complete
- the repo has undergone the broader strictness and modularity sweeps

That is the point where the system becomes stable enough that introducing a new execution substrate
does not confuse the architecture.

## Preconditions Before Adoption

These should be true before we evaluate Workflow DevKit seriously.

### 1. Router history is the only lifecycle authority

No direct GitHub review requeue mutation.

No tracker-first routing truth.

No refresh-based hidden dispatch semantics for routed commands.

### 2. Contracts are strict

We should continue the current push toward:

- required ids
- required timestamps
- fewer nullable payloads
- stricter validation
- clearer unsupported-command failures

Workflow systems are much easier to reason about when the inputs are strict.

### 3. Recovery behavior is already proven locally

Before introducing another durable system, we need confidence that Symphony itself can already:

- rehydrate from route history
- resume deterministically
- avoid duplicate command emission
- explain its current state after restart

### 4. Runtime boundaries are cleaner

The current orchestration and runtime layers should already be more modular, with narrower
responsibilities and cleaner exports.

That lowers the blast radius of introducing a new durable executor.

## What A Good First Workflow DevKit Experiment Looks Like

The first experiment should be narrow and reversible.

It should not be:

- a full orchestrator rewrite
- a router rewrite
- a complete replacement of the runtime

It should be one bounded execution slice where Workflow DevKit's value is obvious.

Good first candidates:

### Option 1: Human approval gate

Use Workflow DevKit hooks for a pause-until-approved flow.

Why this is attractive:

- the benefit is obvious
- pause/resume is the core Workflow DevKit value proposition
- it avoids rewriting dispatch and agent runtime immediately

### Option 2: GitHub or CI callback wait

Use a durable workflow to wait for an external callback and resume.

Why this is attractive:

- hooks/webhooks are a strong Workflow DevKit feature
- this matches a real long-running wait state
- it does not require moving all execution under Workflow DevKit

### Option 3: Approved merge execution wrapper

Wrap the approved-merge path in a durable workflow that can pause, retry, or await follow-up state.

Why this is attractive:

- merge flows are naturally long-lived and failure-prone
- approvals and callbacks fit well
- the state machine is narrow

## What The First Experiment Should Not Be

It should not:

- become the new workflow authority
- replace the route journal
- replace Linear issue state
- remove our own command settlement model
- introduce multiple durable authorities for the same lifecycle concept

If the first experiment does any of those things, it is too large.

## Candidate Future Architecture

If Workflow DevKit proves useful, the future architecture could look like this:

1. router receives signal
2. router records decision
3. router emits command
4. a command executor starts or resumes a Workflow DevKit run
5. Workflow DevKit handles long-lived execution details
6. Workflow DevKit completion or callback is translated back into a Symphony signal
7. router records the new fact and decides the next move

That keeps the ownership clean:

- router controls workflow truth
- Workflow DevKit controls durable execution continuity

## Risks

There are real risks and we should name them now.

### 1. A second durable state system

If we are not careful, Workflow DevKit history could become shadow authority relative to the router
journal.

That must not happen.

### 2. Boundary confusion

Workflows, steps, hooks, and serialized data boundaries can push architectural decisions upward.

If we introduce it too early, we may start reshaping the router around tool constraints instead of
product semantics.

### 3. Migration complexity

If the runtime is still messy when we adopt it, the migration cost will rise sharply.

That is another reason the broader package and app cleanup should come first.

### 4. Over-adoption

Workflow DevKit may be very useful for a subset of Symphony, but not necessarily all of it.

We should resist the temptation to move everything into it just because it is elegant.

## Recommendation

The recommendation is:

1. finish the current hard cuts first
2. keep making the router and runtime contracts stricter
3. complete the broader package and app cleanup program
4. then evaluate Workflow DevKit as a durable execution substrate
5. start with one narrow pause/resume or callback-heavy slice
6. keep router history as the only workflow authority throughout

This gives Symphony the best sequencing:

- first make the control plane clean
- then improve the execution substrate beneath it

That is much safer than trying to do both at once.

## Decision Summary

Workflow DevKit looks like a good fit for the durable execution layer of Symphony.

It does not replace:

- Linear
- the router
- route history
- Symphony's workflow semantics

The right time to introduce it is after the current router hard cuts and broader cleanup passes are
done.

The right adoption style is:

- narrow
- reversible
- execution-focused
- subordinate to router authority

That is the path most likely to improve the product without reintroducing ambiguity.
