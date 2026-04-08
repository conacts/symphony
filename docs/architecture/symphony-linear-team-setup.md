# Symphony Linear Team Setup

Use this document whenever a new Linear team should become Symphony-managed.

## Purpose

Symphony routes work to repositories by Linear team.

That means each repo-owning team must expose the workflow states and labels that the runtime expects.

This is an operating document, not a one-off migration note. A newly created team should be considered incomplete until everything in this checklist exists.

## Operating Model

- use one Linear workspace
- use one Linear team per repository
- use the repo manifest to bind a repository to its team
- use projects for planning and grouping work, not for repo routing
- use a shared `LINEAR_API_KEY` unless a repository truly requires a separate Linear workspace or token

Each admitted repo should declare its owning team in `.symphony/runtime.ts`:

```ts
linear: {
  teamKey: "SYM"
}
```

## Setup Checklist

For a new Symphony-managed Linear team, create:

- 11 workflow states
- 3 model labels
- a repo manifest entry that binds the repo to the team key

Do not treat the team as ready until all of these are present.

## Required Workflow States

Add these states to the team workflow.

### Active Work States

- `Todo`
- `Bootstrapping`
- `In Progress`
- `Rework`
- `Approved`

### Non-Dispatch Parking States

- `In Review`
- `Blocked`
- `Paused`
- `Failed`

### Terminal States

- `Done`
- `Canceled`

## Why These States Are Required

- `Bootstrapping` is the platform-owned claim state.
- `In Progress` is the normal active execution state after workspace preparation succeeds.
- `Rework` is the re-entry state after review feedback.
- `Approved` is reserved for merge execution.
- `In Review`, `Blocked`, `Paused`, and `Failed` are non-dispatch states.
- `Done` and `Canceled` are terminal states.

If `Bootstrapping` is missing, the runtime will fail during issue claim with:

```text
Linear state not found for Bootstrapping.
```

## Required Labels

Add these team labels:

- `model:basic`
- `model:advanced`
- `model:premium`

These labels let Symphony select the intended model tier for the issue.

## Repository Binding

After the Linear team exists, bind the repository to that team in `.symphony/runtime.ts`:

```ts
export default defineSymphonyRuntime({
  repositoryKey: "owner/repo-name",
  linear: {
    teamKey: "TEAM"
  }
});
```

The important rule is:

- team chooses repo
- project does not choose repo

## Validation

After setup, verify:

- the team contains all required states
- the team contains all three model labels
- the repo manifest points at the correct `teamKey`
- Symphony can claim a `Todo` issue into `Bootstrapping`

If the last step fails, the first thing to inspect is whether the team is missing one of the required state names.

## Current Example Mapping

At the time of writing, the intended mapping is:

- `conacts/symphony` -> `SYM`
- `conacts/coldets-v2` -> `COL`

Treat that as an example of the pattern, not the core rule. The durable rule is one repo-owning team per admitted repository.
