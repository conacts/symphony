# Resource Measurement Plan

Date: 2026-04-05

## Goal

Define how Symphony should measure and persist resource usage per container, per issue, and per run
so the platform can make better scheduling decisions, surface hotspots in the dashboard, and size
worker infrastructure from actual observed pressure instead of guesses.

## Purpose

This plan exists alongside the shared-Postgres and remote-Turbo-cache direction.

That architecture work reduces duplicated cost. This plan explains how to measure the remaining
cost so we can answer questions like:

- which issue runs are the heaviest
- which repositories have the most expensive bootstrap, build, verify, or smoke phases
- which workers are CPU-bound versus memory-bound
- whether a workspace/container shape is too large, too small, or simply slow
- how many concurrent heavy workers the host can safely run

## Scope

In scope:

- resource measurement for workspace/container lifecycle commands
- run-level and issue-level aggregation
- container/process attribution
- storage and dashboard-read design
- support for both Docker-backed and host-native execution

Out of scope:

- final dashboard UI implementation
- exact scheduler policy
- repository-specific smoke-task restructuring
- billing or cost attribution beyond local machine resources

## Core Decisions

1. Measurement should happen in Symphony, not be delegated entirely to the target repository.
2. The platform should capture resource usage for every lifecycle command it executes.
3. Metrics should be attributable at three levels:
   - container or process group
   - run
   - issue
4. Docker-backed and host-native workers should share one logical measurement model.
5. Run-level storage should keep both raw samples and derived summaries.
6. Dashboard views should primarily use derived summaries, not raw timeseries.
7. Resource measurement should be passive and automatic; repos should not need to add custom hooks
   to participate.

## Measurement Model

### Unit 1: execution target

The lowest-level measured object is an execution target:

- a Docker container when the worker runs in Docker
- a cgroup, process group, or supervised process scope when the worker runs on the host

This level answers:

- peak RSS / memory pressure
- CPU usage over time
- I/O usage if we decide to capture it later
- lifespan and exit reason

### Unit 2: command execution

Each explicit platform command should create one measured command-execution record.

Examples:

- `pnpm bootstrap`
- `pnpm build`
- `pnpm verify`
- `pnpm test:smoke`
- repo-specific verify or smoke scripts

This level answers:

- which command was expensive
- peak resource usage during the command
- whether the command failed because of timeout, exit code, or likely resource pressure

### Unit 3: run

A Symphony run should aggregate all measured command executions that occurred during that run.

This level answers:

- total wall time
- max concurrent CPU pressure across the run
- max concurrent memory pressure across the run
- which command dominated the run

### Unit 4: issue

An issue should aggregate the runs associated with that issue.

This level answers:

- typical cost of work on this issue
- whether repeated retries are expensive
- whether a specific issue shape is systematically heavier than others

## Data To Capture

### Per sample

At a regular interval during command execution, capture:

- timestamp
- run id
- issue id / issue identifier
- workspace key
- repository key
- execution target id
- command execution id
- CPU percent
- RSS bytes
- memory percent if available
- optional fields later:
  - read bytes
  - write bytes
  - network bytes

### Per command execution

- command execution id
- run id
- issue id / issue identifier
- repository key
- workspace key
- execution target id
- command string
- phase label
  - `bootstrap`
  - `build`
  - `migrate`
  - `verify`
  - `smoke`
  - `cleanup`
  - `custom`
- started at
- ended at
- duration ms
- exit code
- timeout flag
- peak RSS bytes
- average RSS bytes
- peak CPU percent
- average CPU percent
- sample count
- failure classification
  - `exit_nonzero`
  - `timeout`
  - `killed`
  - `infra_error`
  - `unknown`
- optional metadata
  - repo command alias
  - Turbo summary path
  - cached task counts

### Per execution target

- execution target id
- backend kind
  - `docker`
  - `host`
- container id or process scope id
- image or runtime label when applicable
- started at
- ended at
- peak RSS bytes
- peak CPU percent
- aggregate duration

### Per run summary

- run id
- issue id / issue identifier
- worker host
- workspace path
- started at
- ended at
- total duration ms
- peak run RSS bytes
- peak run CPU percent
- command count
- top command by duration
- top command by RSS
- top command by CPU
- timeout count
- failed command count

### Per issue summary

- issue id / issue identifier
- run count
- latest run started at
- average run duration ms
- max run duration ms
- average peak RSS bytes
- max peak RSS bytes
- average peak CPU percent
- max peak CPU percent
- most expensive repo
- most expensive command family

## Collection Strategy

### Docker-backed workers

For Docker workers, Symphony should sample container stats directly.

Preferred inputs:

- Docker stats API or CLI-backed structured stats
- container lifecycle metadata already known to the workspace backend

The measurement loop should start before the first lifecycle command and stop after cleanup or
container exit.

### Host-native workers

For host-native workers, Symphony should measure the supervised process group or cgroup scope.

Preferred inputs:

- process group sampling
- `systemd` scope or cgroup stats when present

This keeps the measurement model stable even if Docker is removed or made optional later.

### Command boundaries

Every platform-executed command should be wrapped by a measurement harness that:

1. records the command start
2. samples resources while the command is running
3. records end state, peaks, averages, and exit classification

This is the most important boundary because it gives us actionable attribution.

## Storage Shape

The platform should store both raw timeseries and derived summaries.

Suggested logical tables:

- `resource_execution_targets`
- `resource_command_executions`
- `resource_command_samples`
- `resource_run_summaries`
- `resource_issue_summaries`

Raw samples should have retention limits. Derived summaries should be kept longer.

## Integration With Existing Platform Data

Resource measurement should join naturally to existing run metadata instead of creating a parallel
identity model.

Preferred joins:

- `run_id`
- `issue_id`
- `issue_identifier`
- `workspace_path`
- `worker_host`

This should remain separate from Codex transcript analytics. Resource usage is orchestration and
runtime infrastructure data, not transcript data.

## Dashboard Reads

The dashboard should eventually expose:

- run-level resource summary
- issue-level resource trends
- top expensive commands
- top expensive repositories
- worker-host saturation view

The primary user-facing questions should be:

- what was the peak memory pressure
- what was the peak CPU pressure
- which command caused it
- was the run slow because of CPU, memory, or uncached work

## Turborepo Integration

Turborepo should be treated as an additional attribution layer, not the only source of truth.

When a command uses Turbo:

- collect the normal resource measurement around the whole command
- also ingest Turbo run summaries when available

That lets Symphony answer both:

- how expensive the whole command was on the host
- which Turbo tasks inside that command consumed the time

Turbo summaries should enrich:

- task counts
- cache hit counts
- cache miss counts
- per-task durations

But Turbo does not replace host/container memory measurement.

## Acceptance Criteria

- every lifecycle command executed by Symphony can emit a measured command-execution record
- each measured command links to a run and issue
- Docker-backed and host-native execution share one read model
- the platform can report peak RSS and peak CPU for a run
- the platform can identify the most expensive command within a run
- the platform can compare issue-level resource pressure across runs
- raw sample retention is bounded
- the design remains compatible with shared Postgres and remote Turbo cache

## Risks

- high-frequency sampling can create too much write volume
- incorrect process attribution can undercount or overcount child processes
- Docker and host-native backends can drift if they are implemented separately
- summary logic can become misleading if command boundaries are not recorded consistently

## Suggested Execution Order

1. Add a command-execution measurement wrapper in the platform runtime.
2. Record run-linked command summaries without raw samples first.
3. Add periodic sampling for RSS and CPU.
4. Add execution-target records for Docker containers and host-native scopes.
5. Add Turbo summary ingestion for Turbo-backed commands.
6. Add run-level and issue-level derived summaries.
7. Expose dashboard reads once the data model is stable.
