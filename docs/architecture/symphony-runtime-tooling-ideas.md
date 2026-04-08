# Symphony Runtime Tooling And Operational Ideas

## Purpose

This document captures open ideas that came out of recent dogfooding and agent-run analysis. These are not all immediate implementation tasks. They are a structured backlog of operational and runtime ideas that need follow-up.

## 1. Make resource metrics a first-class runtime feature

The current resource dashboard is too rudimentary.

The stronger direction is:

- monitor command-level CPU and memory
- tie that data to active runs
- surface it in the dashboard as part of run analysis

Potential data model:

- run
- turn
- command
- sampled process tree stats over time

Practical boundary:

- only collect detailed resource data while a ticket is actively running
- avoid collecting it for idle time or unrelated local developer activity

## 2. Monitor CPU per command the agent triggers

This is a strong idea and lines up with the new monitoring work.

Good command classes to track first:

- `pnpm build`
- `pnpm test`
- `pnpm verify:precommit`
- `next build`
- `tsc -b ...`

Lower-value candidates for first-pass tracking:

- `pi.read`
- `pi.edit`
- `pi.write`

Why not start there:

- those are less likely to be the main CPU problem
- the higher leverage lies in build/test/verify commands

## 3. Completion tools are still not intuitive to the agent

We observed agent messages like:

```text
which finish_and_send_to_review ...
Tool not found as shell command - it's a Symphony runtime tool
```

and:

```text
finish_and_send_to_review not found as CLI
```

This shows a real mismatch between the agent's mental model and Symphony's current tool exposure model.

The agent naturally expects operational tools to be available as things it can invoke directly.

This creates a design question:

- should Symphony continue relying on Pi-specific dynamic tool integration
- or should Symphony expose its essential operational controls as normal CLI tools inside the workspace/runtime

Current concern:

- Pi mono custom tool handling is more complex than the value it is providing right now

This does not automatically mean "replace everything with CLI tools," but it is a serious design direction worth evaluating.

## 4. CLI-first runtime tools are a plausible simplification

A simpler operational model may be:

- expose Symphony runtime actions as explicit CLI commands
- let the agent discover them the same way it discovers other tools

Examples:

- `symphony submit-for-review`
- `symphony submit-spike-result`
- `symphony runtime-status`

Why this is appealing:

- easier for the agent to reason about
- discoverable with `which`, `--help`, and shell habits
- less transport-specific coupling to Pi internals

Main tradeoff:

- requires designing and maintaining a stable CLI surface

## 5. When runs pause, fail, or stop, all related processes should be cleaned up

This is an important operational requirement.

Desired behavior:

- when a ticket moves to `Paused`, `Failed`, or another terminal non-running state
- Symphony should ensure all related processes for that run are terminated

Why:

- prevent orphaned CPU load
- avoid background commands continuing after the run is no longer valid
- keep the machine predictable

This should apply to:

- workspace command processes
- agent session processes
- long-running verification or dev processes started by the run

## 6. Command-level metrics should probably feed the dashboard

The current performance notes support replacing the current simple resources dashboard with richer runtime-aware data.

Potential dashboard surfaces:

- command CPU over time
- command memory over time
- top processes during a run
- slowest build/test commands
- bootstrap phase durations
- run resource summary

## 7. Targeted tests need to stay truly targeted

This deserves repeating because it affects both performance and operator trust.

Symphony now has a Vitest wrapper to keep targeted runs narrow. That guarantee needs to remain intact whenever package scripts or test runners change.

This remains a high-priority testing/runtime hygiene rule.

## 8. Performance data volume is worth tolerating if the scope is controlled

There is a legitimate concern about storing too much metrics data.

The current best position is:

- be reasonably aggressive in storing run-scoped performance data
- but only for active ticket runs

That tradeoff is acceptable because:

- the data is highly actionable
- it directly supports agent optimization
- it can replace weak heuristics with real evidence

If storage later becomes a problem, Symphony can:

- summarize older runs
- keep detailed samples only for recent runs
- retain coarse aggregates long-term

## 9. Node processes over 100% CPU are not automatically a bug

A Node process using `174%` CPU is not inherently incorrect.

It usually means:

- multithreaded work under the hood
- child worker activity attributed to that command tree
- or multiple cores being utilized by the task family

The right question is not:

- "did Node exceed 100%?"

The right question is:

- "what specific work was happening when that occurred, and was it justified?"

## 10. Performance work should stay evidence-driven

The right next step is not broad optimization guessing.

The right next step is:

1. collect run-scoped command/resource data
2. fix targeted test execution
3. inspect the slowest command/test patterns
4. optimize the real hotspots

## Suggested Follow-on Tickets

Potential future tickets from these notes:

1. Persist command-level resource metrics for active runs.
2. Replace the dashboard resource view with run-aware command telemetry.
3. Clean up all run-owned processes when a run moves to `Paused`, `Failed`, or another terminal non-running state.
4. Investigate exposing Symphony completion/runtime operations as CLI tools instead of Pi-specific dynamic tools.
