# Symphony Agent OS Evaluation

## Summary

Rivet Agent OS is a credible candidate to replace Docker for the common Symphony agent-runtime path, but it should be evaluated as a targeted runtime replacement rather than assumed to be a full Linux substitute.

The most promising aspects are:

- faster startup and lower runtime overhead than Docker
- a session-native agent execution model
- direct support for Pi
- filesystem mounts and persistent runtime state
- permission hooks and event streaming that fit Symphony's lifecycle model

The main constraint is that Agent OS is not a full Linux environment. It uses a lightweight POSIX-like runtime and a curated software model rather than a general-purpose Linux container.

## Why It Is Interesting

Symphony currently pays a large operational cost for Docker-backed workspaces:

- container startup latency
- command transport complexity
- extra failure modes around Docker exec and workspace lifecycle
- high friction when trying to integrate Pi cleanly

Agent OS appears better aligned with what Symphony actually wants for the common path:

- run a coding agent in a mounted workspace
- let it read and edit files
- execute shell commands
- stream structured events
- preserve session state
- apply explicit permissions

For the common coding-agent workflow, this is a closer conceptual match than "start a whole Docker container and script around it."

## Why It Is Not A Blind Docker Replacement

Agent OS is not full Linux.

The documented limitations include:

- no standard Linux package managers like `apt` or `yum`
- no full Linux kernel behavior
- no container runtimes like Docker inside Agent OS

This means the migration question is not:

- "Can Agent OS replace Docker everywhere?"

It is:

- "Can Agent OS replace Docker for Symphony's normal Pi coding workflow?"

That distinction matters.

## Current Hypothesis

Agent OS may be able to replace Docker for the majority of Symphony runs if the real required toolchain is available and stable:

- `bash`
- `git`
- `node`
- `pnpm`
- `python3`
- `rg`
- any additional repo bootstrap dependencies that are actually exercised in normal runs

If those tools are available and the mounted workspace model behaves correctly, Agent OS could likely serve as the default runtime.

For workloads that truly require full Linux behavior, Symphony could still fall back to a heavier sandbox path.

## Benefits If It Works

- lower startup latency
- lower overhead for short-lived runs
- simpler runtime model than Docker-backed workspaces
- better fit for session-oriented Pi execution
- easier future path to richer native agent integrations

## Risks

- incomplete toolchain support for real Symphony bootstrap flows
- incompatibilities with repo install/build/test workflows
- missing Linux behaviors that only appear under real project workloads
- beta/runtime maturity risk
- migration complexity around workspace lifecycle, observability, and failure handling

## Validation Questions

Before Symphony should consider migration, the following need clear answers:

1. Can Agent OS run a real Symphony Pi coding session end-to-end in a mounted repo workspace?
2. Can it support the actual Symphony bootstrap toolchain without hidden Linux compatibility gaps?
3. Can Symphony preserve current run/turn observability and diagnostics on top of Agent OS sessions?
4. Can Symphony expose explicit completion tooling cleanly in the Agent OS + Pi integration model?
5. Which workloads still require a full sandbox fallback instead of Agent OS?

## Recommended Approach

Do not migrate directly.

Instead:

1. keep Docker + Pi RPC as the stable production path
2. run a focused spike against a real Symphony workflow
3. validate toolchain compatibility, repo mounts, Pi execution, and observability
4. only consider runtime migration after the spike produces a clear recommendation

## Recommendation

Agent OS is worth a focused spike.

It is promising because it matches Symphony's common execution shape better than Docker, but it should only be adopted if it can run a real Symphony workflow without requiring constant fallbacks to a heavier sandbox.
