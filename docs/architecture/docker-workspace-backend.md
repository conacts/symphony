# Docker Workspace Backend

Date: 2026-04-01

## Goal

Add a real Docker-backed `WorkspaceBackend` behind the execution-target-aware workspace seam and
exercise it through one intentional Codex runtime path without making Docker the default runtime.

This stage now covers:

- prepare a deterministic container-backed workspace
- expose explicit execution-target and materialization metadata
- run workspace hooks through the backend
- execute Codex against a prepared container target through `docker exec`
- clean up Docker and host-side resources deterministically

## Factory Shape

```ts
createDockerWorkspaceBackend({
  image,
  workspacePath?,
  containerNamePrefix?,
  shell?,
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
2. Ensures the host workspace directory exists
3. Derives a deterministic container name from the workspace key
4. Inspects any existing container with that name
5. Reuses the container only when all of the following are true:
   - it is labeled as Symphony-managed
   - it belongs to the same issue/workspace key
   - it is running
   - it uses the expected image
   - it has the expected bind mount for the workspace
6. Otherwise, removes the stale managed container and starts a fresh one
7. Runs `after_create` inside the container only when the materialized workspace directory was
   newly created

The backend does not delete or mutate unrelated containers. A name collision with a non-Symphony
container fails closed.

### Before Run / After Run

`runBeforeRun()` and `runAfterRun()` execute hooks through `docker exec` using the prepared
container execution target.

Hook env is explicit and includes:

- `SYMPHONY_WORKSPACE_PATH`
- `SYMPHONY_ISSUE_IDENTIFIER`
- `SYMPHONY_ISSUE_ID` when available
- `SYMPHONY_WORKER_HOST` when available
- any caller-provided workspace env entries with string values

Behavior matches the local backend contract:

- `before_run` fails closed
- `after_run` is best effort

### Cleanup

`cleanupWorkspace()`:

1. Re-derives the managed workspace/container identity when needed
2. Runs `before_remove` inside the container when the managed container is still running
3. Removes the managed container
4. Removes the host bind-mounted workspace directory

`before_remove` is best effort, matching the local backend semantics.

## Prepared Workspace Metadata

The Docker backend returns:

```ts
{
  backendKind: "docker",
  executionTarget: {
    kind: "container",
    workspacePath: "/home/agent/workspace",
    containerId,
    containerName,
    hostPath
  },
  materialization: {
    kind: "bind_mount",
    hostPath,
    containerPath: "/home/agent/workspace"
  },
  path: null
}
```

Notable details:

- `path` stays `null` on purpose. The compatibility alias remains intended for local host-path
  execution, not container-target execution.
- `hostPath` is still carried explicitly so observers, serializers, and operators can understand
  where the workspace is materialized on the host.
- container names are deterministic and stable across retries for the same workspace key.

## Runtime Execution

For this stage, `apps/api` keeps backend/runtime selection explicit:

- `SYMPHONY_WORKSPACE_BACKEND=local`
  Uses `createLocalWorkspaceBackend()` and the existing host-path runtime behavior.
- `SYMPHONY_WORKSPACE_BACKEND=docker`
  Uses `createDockerWorkspaceBackend()` plus the execution-target-aware Codex runtime path.
  `SYMPHONY_DOCKER_WORKSPACE_IMAGE` is required.

The Codex runtime consumes only `PreparedWorkspace` and resolves one launch target:

- `executionTarget.kind === "host_path"`
  Launch Codex locally exactly as before.
- `executionTarget.kind === "container"`
  Validate the bind-mounted host workspace path, then launch Codex with
  `docker exec -i --workdir <container-workspace> <container-name> <shell> -lc "<codex command>"`.

Operationally important details:

- The Codex thread cwd is the container workspace path, not the host bind mount path.
- Repo snapshots still run against the host bind-mounted path.
- The runtime fails closed when a container target does not include the host path or container
  name needed for this bridge.
- The current runtime path intentionally supports bind-mounted Docker workspaces only. Volume-only
  execution remains deferred.

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
5. Asserts that the container and host workspace are gone

The live test is gated by `SYMPHONY_LIVE_DOCKER_VERIFY=1`, and the package script sets that flag
for you.

## Intentionally Deferred

This stage does not:

- make Docker the default backend
- add workflow-front-matter backend selection
- support volume-only runtime execution without a host bind mount
- add broader app-level observability or cutover logic
- add broader app-level observability or cutover logic beyond bounded launch-target metadata
