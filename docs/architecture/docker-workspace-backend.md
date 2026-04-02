# Docker Workspace Backend

Date: 2026-04-01

## Goal

Add a real Docker-backed `WorkspaceBackend` behind the execution-target-aware workspace seam and
exercise it through one intentional Codex runtime path without making Docker the default runtime.

This stage also makes the frozen runtime manifest operational for Docker-backed workspaces:

- explicit env bundle resolution from manifest host/static/runtime/service bindings
- one per-workspace Docker network
- one per-workspace Postgres sidecar
- Postgres readiness and optional service `init`
- explicit env bundle injection into hooks and Codex launch
- ordered manifest lifecycle execution plus warm-reuse skip caching
- teardown-time manifest cleanup before managed resources are removed

This stage now covers:

- prepare a deterministic container-backed workspace
- support both bind-mounted and container-owned Docker materialization modes
- prepare a deterministic per-workspace Docker network when a runtime manifest is present
- prepare a deterministic per-workspace Postgres sidecar when a runtime manifest is present
- resolve an explicit env bundle for hooks and runtime execution
- execute manifest `bootstrap`, `migrate`, optional `seed`, and required `verify`
- skip already-completed lifecycle phases for the current warm lifetime
- rerun service-dependent phases when the service side is recreated
- expose explicit workspace lifecycle metadata for prepare, launch, and cleanup
- expose explicit execution-target and materialization metadata
- run workspace hooks through the backend
- execute Codex against a prepared container target through `docker exec`
- clean up Docker and host-side resources deterministically
- surface high-signal lifecycle events and API-ready read-model data for operators

## Factory Shape

```ts
createDockerWorkspaceBackend({
  image,
  materializationMode?,
  workspacePath?,
  containerNamePrefix?,
  shell?,
  runtimeManifest?,
  commandRunner?,
  commandTimeoutMs?
})
```

The required option is `image`.

The public factory returns a normal `WorkspaceBackend`. Callers do not get a parallel Docker-only
orchestrator path.

## Lifecycle

### Prepare

`prepareWorkspace()` does the following:

1. Resolves a deterministic host workspace path under `workflow.workspace.root`
2. Materializes the workspace according to `materializationMode`:
   - `bind_mount`
     resolves and ensures a deterministic host workspace directory
   - `volume`
     resolves and ensures a deterministic managed Docker volume without inventing a host repo path
3. When a runtime manifest is present, derives and ensures a deterministic per-workspace Docker
   network
4. When a runtime manifest is present, derives and ensures a deterministic Postgres sidecar for
   each manifest service key
5. Waits for Postgres readiness and then runs optional Postgres `init` steps
6. Derives a deterministic workspace container name from the workspace key
7. Inspects any existing workspace container with that name
8. Reuses the workspace container only when all of the following are true:
   - it is labeled as Symphony-managed
   - it belongs to the same issue/workspace key
   - it is running
   - it uses the expected image
   - it has the expected workspace materialization mount for the workspace
   - when manifest-backed, it is attached to the expected workspace network
9. Otherwise, removes the stale managed workspace container and starts a fresh one
10. Resolves the explicit env bundle
11. Runs `after_create` inside the container only when the chosen materialization was newly
    created
12. Executes manifest lifecycle phases inside the workspace container when a runtime manifest is
    present:
    - `bootstrap`
    - `migrate`
    - optional `seed`
    - `verify`

The backend does not delete or mutate unrelated containers, networks, or service containers. A
name collision with a non-Symphony managed resource fails closed.

Manifest-backed Docker provisioning rules for this pass:

- one network per workspace
- one Postgres sidecar per workspace service key
- no host port publishing for sidecars
- stable hostnames via Docker network aliases
- service reuse is allowed only when the managed identity, config, effective resource limits, and
  network attachment all still match
- default sidecar resource limits are `512 MB` memory and `512` CPU shares when the manifest omits
  them

Manifest lifecycle reuse rules for this stage:

- a small workspace-root-adjacent cache tracks the latest successfully completed phase markers for
  the current warm lifetime
- `bootstrap` is keyed to the workspace filesystem lifetime
- `migrate` and `seed` are keyed to the service lifetime
- `verify` is keyed to the ready lifetime
  ready lifetime = workspace lifetime + service lifetime + container identity
- a fully reused warm workspace skips all setup phases
- if prepare fails after some phases already completed, only the unfinished phase and later phases
  rerun on the next attempt
- when no manifest services exist, `migrate` and `seed` fall back to the workspace lifetime

### Before Run / After Run

`runBeforeRun()` and `runAfterRun()` execute hooks through `docker exec` using the prepared
container execution target.

Hook env now comes from the prepared workspace env bundle as the primary model.

When no manifest is present, that bundle is an ambient snapshot of the runtime env source.

When a manifest is present, the bundle explicitly includes:

- `SYMPHONY_WORKSPACE_PATH`
- `SYMPHONY_ISSUE_IDENTIFIER`
- `SYMPHONY_ISSUE_ID` when available
- `SYMPHONY_WORKER_HOST` when available
- resolved `env.host.required`
- resolved `env.host.optional`
- `env.inject.static`
- `env.inject.runtime`
- `env.inject.service`

Behavior matches the local backend contract:

- `before_run` fails closed
- `after_run` is best effort

### Cleanup

`cleanupWorkspace()`:

1. Re-derives the managed workspace/container identity when needed
2. Runs `before_remove` inside the container when the managed container is still running
3. Runs manifest `cleanup` inside the workspace container before any managed resources are removed
4. Removes the managed workspace container
5. Removes managed Postgres sidecars
6. Removes the managed workspace network
7. Removes the selected workspace materialization and the warm-lifetime cache entry

`before_remove` is best effort, matching the local backend semantics.

Manifest `cleanup` is also best effort:

- cleanup failure is recorded explicitly in lifecycle events and cleanup metadata
- managed resource removal continues even when cleanup fails
- missing or non-running containers produce an explicit skipped cleanup record

Cleanup is tolerant of partially missing managed resources:

- missing service containers are reported as missing, not fatal
- missing networks are reported as missing, not fatal

## Prepared Workspace Metadata

The Docker backend now returns an explicit prepare summary rather than relying on vague payload
blobs:

```ts
{
  backendKind: "docker",
  prepareDisposition: "created" | "reused",
  containerDisposition: "started" | "reused" | "recreated",
  networkDisposition: "created" | "reused" | "not_applicable",
  afterCreateHookOutcome: "completed" | "skipped",
  executionTarget: {
    kind: "container",
    workspacePath: "/home/agent/workspace",
    containerId,
    containerName,
    hostPath, // null for container-owned materialization
    shell
  },
  materialization:
    | {
        kind: "bind_mount",
        hostPath,
        containerPath: "/home/agent/workspace"
      }
    | {
        kind: "volume",
        volumeName,
        containerPath: "/home/agent/workspace",
        hostPath: null
      },
  networkName,
  services: [
    {
      key,
      type: "postgres",
      hostname,
      port,
      containerId,
      containerName,
      disposition: "created" | "reused" | "recreated"
    }
  ],
  envBundle: {
    source: "ambient" | "manifest",
    values,
    summary
  },
  manifestLifecycle: {
    phases
  },
  workerHost,
  path: null
}
```

Notable details:

- `prepareDisposition` tells observers whether the host workspace directory was created for this
  run or reused from a prior run.
- `containerDisposition` tells observers whether Docker started, reused, or recreated the managed
  container.
- `networkDisposition` tells observers whether the workspace-scoped Docker network was created,
  reused, or not applicable.
- `afterCreateHookOutcome` stays explicit so operators can distinguish "new workspace, hook ran"
  from "reused workspace, hook skipped".
- `networkName` is explicit so operators can correlate the workspace container and sidecars.
- `services` surfaces bounded service metadata only: key, type, hostname, port, container id/name,
  and reuse vs creation.
- `envBundle.summary` surfaces the explicit env model without leaking secret values.
- `manifestLifecycle` surfaces the current prepare attempt only:
  completed phases, skipped phases, timestamps, step names, commands, cwd, and sanitized failure
  reasons.
- `path` stays `null` on purpose. The compatibility alias remains intended for local host-path
  execution, not container-target execution.
- `hostPath` is explicit and truthful:
  bind-mounted workspaces expose the canonical host repo path; container-owned workspaces expose
  `null`.
- `hostRepoMetadataAvailable` is explicit in the normalized summary so operators can tell whether
  host-side Git metadata should exist for the prepared workspace.
- `shell` is part of the prepared container execution target. The launch-target resolver now uses
  that backend-authored value instead of synthesizing shell choice from parallel runtime config.
- container names are deterministic and stable across retries for the same workspace key.

The normalized workspace summary used by the journal and HTTP serializers keeps the following
fields explicit for both local and Docker runs:

- `backendKind`
- `workerHost`
- `prepareDisposition`
- `executionTargetKind`
- `materializationKind`
- `hostRepoMetadataAvailable`
- `containerDisposition`
- `networkDisposition`
- `hostPath`
- `runtimePath`
- `containerId`
- `containerName`
- `networkName`
- `services`
- `envBundleSummary`
- `manifestLifecycle`
- `path`

## Runtime Execution

For this stage, `apps/api` keeps backend/runtime selection explicit:

- `SYMPHONY_WORKSPACE_BACKEND=local`
  Uses `createLocalWorkspaceBackend()` and the existing host-path runtime behavior.
- `SYMPHONY_WORKSPACE_BACKEND=docker`
  Uses `createDockerWorkspaceBackend()` plus the execution-target-aware Codex runtime path.
  `SYMPHONY_DOCKER_WORKSPACE_IMAGE` is required.
- `SYMPHONY_DOCKER_MATERIALIZATION_MODE=bind_mount|volume`
  Keeps `bind_mount` as the default and enables container-owned workspaces when set to `volume`.

The Codex runtime consumes only `PreparedWorkspace` and resolves one launch target:

- `executionTarget.kind === "host_path"`
  Launch Codex locally exactly as before.
- `executionTarget.kind === "container"`
  Launch Codex with
  `docker exec -i --workdir <container-workspace> <container-name> <shell> -lc "<codex command>"`.
  When no host repo path exists, the runtime uses a dedicated host launch directory under
  `workflow.workspace.root/.symphony-runtime/codex-launch/<workspaceKey>` as the safe app-server
  cwd.

Operationally important details:

- The Codex thread cwd is the container workspace path, not the host bind mount path.
- Repo snapshots run against the host repo path when one exists, otherwise they run through
  `docker exec` inside the container and record that source explicitly in the journal payload.
- The runtime still fails closed when the container name, runtime path, or shell needed for this
  bridge are missing.
- Host-path and container launch both receive the explicit env bundle rather than depending on
  ambient inheritance as the primary path.

The runtime launch step now resolves and surfaces an explicit launch target:

```ts
{
  kind: "container",
  hostLaunchPath: "/tmp/symphony/.symphony-runtime/codex-launch/COL-123",
  hostWorkspacePath: null,
  runtimeWorkspacePath: "/home/agent/workspace",
  containerId,
  containerName,
  shell: "sh"
}
```

That launch target is recorded in runtime logs, journal metadata, and the runtime HTTP read model
so operators can distinguish "workspace prepared in Docker" from "Codex actually launched in this
container target".

## Lifecycle Event Surface

The observability pass adds a small, explicit set of high-signal events.

Runtime log events emitted from `apps/api`:

- `workspace_backend_selected`
  App startup log that records which backend was selected and why.
- `runtime_launch_target_resolved`
  Records the resolved launch target before Codex is started.
- `runtime_session_started`
  Records the session id plus the resolved launch target after Codex startup succeeds.
- `runtime_startup_failed`
  Records startup failures with `failureStage`, `failureOrigin`, and `launchTarget`.
- `runtime_execution_failed`
  Records failures after the session has already started.

Run-journal / issue-timeline lifecycle events emitted by the orchestrator:

- `workspace_prepare_completed`
- `workspace_manifest_phase_started`
- `workspace_manifest_step_started`
- `workspace_manifest_step_completed`
- `workspace_manifest_phase_completed`
- `workspace_manifest_phase_skipped`
- `workspace_manifest_phase_failed`
- `docker_container_started`
- `docker_container_reused`
- `docker_container_recreated`
- `workspace_before_run_completed`
- `runtime_launch_requested`
- `runtime_startup_failed`
- `workspace_after_run_completed`
- `workspace_after_run_failed_ignored`
- `workspace_cleanup_completed`
- `workspace_cleanup_failed`
- `docker_container_removed`
- `docker_container_missing`

Event payload design rules for this stage:

- Workspace events carry the normalized workspace summary instead of raw backend-specific blobs.
- Manifest lifecycle events carry explicit phase/step metadata with sanitized failure reasons.
- Launch events carry an explicit `launchTarget`.
- Startup failure events carry both `failureStage` and `failureOrigin`.
- Startup failure events also carry manifest lifecycle context when prepare failed inside
  `bootstrap`, `migrate`, `seed`, or `verify`.
- Cleanup events carry explicit cleanup outcomes:
  `beforeRemoveHookOutcome`, `workspaceRemovalDisposition`,
  `containerRemovalDisposition`, `networkRemovalDisposition`, `serviceCleanup`, and
  `manifestLifecycleCleanup`.

Startup failure classification is intentionally narrow and operational:

- `failureStage`: `workspace_prepare`, `workspace_before_run`, `runtime_launch`,
  `runtime_session_start`
- `failureOrigin`: `workspace_lifecycle`, `docker_lifecycle`, `runtime_launch`,
  `codex_startup`

## HTTP Read Model

The runtime API now surfaces the normalized workspace and launch-target read model directly on
running, retrying, and per-issue runtime responses.

Workspace read-model fields:

- `backendKind`
- `workerHost`
- `prepareDisposition`
- `executionTargetKind`
- `materializationKind`
- `hostRepoMetadataAvailable`
- `containerDisposition`
- `networkDisposition`
- `hostPath`
- `runtimePath`
- `containerId`
- `containerName`
- `networkName`
- `services`
- `envBundleSummary`
- `manifestLifecycle`
- `path`
- `executionTarget`
- `materialization`

Launch-target read-model fields:

- `kind`
- `hostLaunchPath`
- `hostWorkspacePath`
- `runtimeWorkspacePath`
- `containerId`
- `containerName`
- `shell`

This keeps the dashboard and future optimization work focused on a small number of explicit fields
instead of a backend-specific nested dump.

## Live Verification

Normal `pnpm test` stays deterministic and does not require Docker.

Explicit live verification command:

```sh
pnpm --filter @symphony/api test:docker-live
```

Optional environment overrides:

```sh
SYMPHONY_DOCKER_WORKSPACE_IMAGE=alpine:3.20 pnpm --filter @symphony/api test:docker-live
```

The live verification test:

1. Prepares a real Docker-backed workspace
2. Boots a fake app-server script inside the container through the real runtime path
3. Waits for a real turn completion through the Codex runtime
4. Cleans the container and bind-mounted host workspace up
4. Cleans the container and the selected workspace materialization up
5. Asserts that the container and host workspace are gone

The live test is gated by `SYMPHONY_LIVE_DOCKER_VERIFY=1`, and the package script sets that flag
for you.

## Intentionally Deferred

This stage does not:

- make Docker the default backend
- add workflow-front-matter backend selection
- add service types beyond Postgres
- add shared Postgres instances
- add host port publishing for sidecars
- redesign runtime execution behavior beyond metadata surfacing and event clarity
- add broader cutover logic beyond bounded backend/launch-target observability
