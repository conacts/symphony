# Docker Workspace Backend

Date: 2026-04-01

## Goal

Add a real Docker-backed `WorkspaceBackend` behind the execution-target-aware workspace seam
without changing the active Codex runtime path.

This stage is intentionally about backend lifecycle only:

- prepare a deterministic container-backed workspace
- expose explicit execution-target and materialization metadata
- run workspace hooks through the backend
- clean up Docker and host-side resources deterministically

It is not a runtime cutover.

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

## Intentionally Deferred

This stage does not:

- run the Codex runtime inside the container
- make Docker the default backend
- change `apps/api` runtime selection
- teach the agent runtime to consume `executionTarget.kind === "container"`
- add broader app-level observability or cutover logic

The next stage can focus on runtime execution support because the backend lifecycle and metadata
contract now exist independently and are covered by backend tests.
