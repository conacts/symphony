# Symphony Agent OS Evaluation

## Date

2026-04-08

## Spike Issue

[SYM-8](https://linear.app/coldets/issue/SYM-8/spike-agent-os-as-a-possible-docker-replacement-for-symphony-agent)

## Summary

Rivet Agent OS is a credible candidate to replace Docker for the common Symphony agent-runtime path, but it should be evaluated as a targeted runtime replacement rather than assumed to be a full Linux substitute.

The most promising aspects are:

- faster startup and lower runtime overhead than Docker
- a session-native agent execution model
- direct support for Pi
- filesystem mounts and persistent runtime state
- permission hooks and event streaming that fit Symphony's lifecycle model

The main constraint is that Agent OS is not a full Linux environment. It uses a lightweight POSIX-like runtime and a curated software model rather than a general-purpose Linux container.

## Current Symphony Architecture (Docker Baseline)

### Execution Model

Symphony's current Docker backend provides:

1. **One container per Linear issue** - deterministic workspace identity
2. **Bind-mounted or volume-mounted workspaces** - persistent across runs
3. **Full Linux environment** - Debian-based (`node:24-bookworm-slim`)
4. **Required toolchain** (validated at startup):
   - `bash` - shell execution
   - `git` - version control
   - `node` - JavaScript runtime
   - `pnpm` (via corepack) - package manager
   - `python3` - Python runtime
   - `rg` (ripgrep) - fast code search
   - `pi` - Pi coding agent (installed globally)
   - `psql` - PostgreSQL client
   - `gh` - GitHub CLI
   - `linear-cli` - Linear CLI
5. **Service sidecars** - PostgreSQL containers for repos that need database access
6. **Docker networks** - isolated networking per workspace
7. **Lifecycle phases** - `bootstrap`, `migrate`, `seed`, `verify`, `cleanup`

### Pi Integration Model

Symphony launches Pi through:
- `codex exec --experimental-json` inside the container
- Typed SDK events captured for observability
- Dynamic tools (`linear_graphql`, `finish_and_send_to_review`) injected at runtime
- Environment bundle from manifest `env.host` and `env.inject`

### Pain Points with Docker

Based on the architecture docs and codebase analysis:

1. **Startup latency** - container creation, image pulls, lifecycle phases
2. **Command transport complexity** - `docker exec` adds overhead for every shell command
3. **Workspace lifecycle failure modes** - Docker daemon issues, container state corruption
4. **Resource overhead** - full Linux container for what is essentially a coding agent workflow
5. **Docker daemon dependency** - requires Docker Desktop or daemon running on host

## Agent OS Capabilities (Based on Documentation)

### What Agent OS Provides

1. **Lightweight POSIX-like runtime** - not full Linux
2. **Session-native execution** - designed for agent workflows
3. **Direct Pi support** - first-class integration
4. **Filesystem mounts** - workspace access without container overhead
5. **Permission hooks** - explicit control over agent actions
6. **Event streaming** - structured observability
7. **Persistent state** - session continuity

### What Agent OS Does NOT Provide

1. **No standard package managers** - no `apt`, `yum`, etc.
2. **No full Linux kernel** - limited syscall compatibility
3. **No container runtimes** - cannot run Docker inside Agent OS
4. **No guaranteed POSIX completeness** - some Linux behaviors may be missing

## Detailed Findings

### 1. Mounted Workspace Behavior

**Current Docker model:**
- Workspace materialized via bind mount or Docker volume
- Container path: `/home/agent/workspace`
- Source repo mounted read-only at `/home/agent/source-repo`
- Persistent across runs for same issue

**Agent OS expectation:**
- Direct filesystem mount from host
- No container path abstraction
- Potential path compatibility issues with repos that assume specific paths

**Assessment:** Agent OS's direct mount model is actually *simpler* and should work for the common case. However, repos that depend on container-specific paths or environment setup may need adjustment.

### 2. Pi Integration Model

**Current Docker model:**
- Pi installed globally in Docker image (`@mariozechner/pi-coding-agent@0.65.0`)
- Launched via `codex exec --experimental-json` inside container
- SDK events streamed back to Symphony
- Dynamic tools injected via Symphony runtime

**Agent OS expectation:**
- Pi runs natively on Agent OS
- Potentially tighter integration with session model
- May need to adapt the harness transport layer

**Assessment:** This is a **significant compatibility risk**. Symphony's Pi integration relies on:
- Container isolation for Pi execution
- Docker exec for command transport
- Environment injection via Docker

If Agent OS provides a comparable execution model with direct Pi support, this could be simplified. However, the current `@symphony/agent-harnesses` transport layer would need adaptation.

### 3. Shell/Process Execution

**Current Docker model:**
- Commands executed via `docker exec` against container
- Shell: configurable, defaults to `bash`
- Timeout handling via Docker client
- Exit codes captured from Docker API

**Agent OS expectation:**
- Direct process execution
- Native shell support
- Potentially faster command dispatch

**Assessment:** Agent OS should provide equivalent or better shell execution. The main concern is whether timeout handling and exit code semantics match Docker's behavior.

### 4. Required Toolchain Availability

**Symphony's required tools:**

| Tool | Purpose | Agent OS Risk |
|------|---------|---------------|
| `bash` | Shell | Low - POSIX-like runtime should support |
| `git` | Version control | Medium - needs full git with SSH support |
| `node` | JavaScript runtime | Medium - Agent OS needs Node.js support |
| `pnpm` | Package manager | Medium - requires Node.js + corepack |
| `python3` | Python runtime | High - Python may not be available |
| `rg` | Code search | High - ripgrep is a native binary |
| `pi` | Coding agent | Low - Node.js package, should work |
| `psql` | DB client | High - PostgreSQL client not guaranteed |
| `gh` | GitHub CLI | High - Go binary, may not run |
| `linear-cli` | Linear CLI | Medium - Node.js package |

**Assessment:** This is the **biggest blocker**. Symphony's Docker image includes 10+ tools that are validated at startup. Agent OS would need to provide or support installation of:
- At minimum: `bash`, `git`, `node`, `pnpm`, `pi`
- Ideally: all tools in the required list
- For repos with Postgres services: `psql`

### 5. Lifecycle and Observability Fit

**Current Docker model:**
- Lifecycle phases (`bootstrap`, `migrate`, `verify`) run inside container
- Events recorded via `WorkspaceBackendEventRecorder`
- Manifest lifecycle state cached on host filesystem
- Warm reuse skips already-completed phases

**Agent OS expectation:**
- Lifecycle phases would run natively
- Event streaming may have native support
- State persistence model needs validation

**Assessment:** Agent OS's session model may actually provide better lifecycle observability. However, the warm reuse semantics (bootstrap once per filesystem, migrate once per service) would need to be reimplemented.

### 6. Service Sidecars (PostgreSQL)

**Current Docker model:**
- PostgreSQL containers provisioned per workspace service key
- Containers share Docker network with workspace
- Connection strings injected via env bindings
- Readiness checks and init steps supported

**Agent OS limitation:**
- Cannot run Docker containers inside Agent OS
- Cannot provision PostgreSQL sidecars

**Assessment:** This is a **critical gap**. Any repo that declares services in `.symphony/runtime.ts` cannot use Agent OS as the sole runtime. Symphony would need:
- Host-based PostgreSQL for Agent OS runs
- Or: Agent OS + host service proxy pattern
- Or: Hybrid model (Agent OS for non-service repos, Docker for service repos)

### 7. Workspace Reuse and Warm Caching

**Current Docker model:**
- Containers persist across runs for same issue
- Build artifacts cached in container filesystem
- Lifecycle phases skipped on warm reuse
- Explicit reset required to recreate

**Agent OS expectation:**
- Direct filesystem means artifacts persist naturally
- No container lifecycle to manage
- Simpler reuse model

**Assessment:** Agent OS's model is actually *simpler* for workspace reuse. The tradeoff is losing container-level isolation between issues.

## Compatibility Risks

### High Risk

1. **Toolchain gaps** - Python3, ripgrep, psql, gh may not be available
2. **Service sidecars** - Cannot run PostgreSQL containers
3. **Pi transport adaptation** - Harness layer needs rework for non-Docker execution

### Medium Risk

1. **Path compatibility** - Repos may assume container paths
2. **Environment injection** - Current model relies on Docker env passing
3. **Timeout semantics** - Command timeout handling may differ

### Low Risk

1. **Workspace mounts** - Direct filesystem is simpler
2. **Git operations** - Should work if git is available
3. **Node.js ecosystem** - Should work if Node.js is available

## Recommendation

### Do Not Migrate Directly

Agent OS is **not a blind Docker replacement** for Symphony. The toolchain gaps and service sidecar limitations make a full migration premature.

### Recommended Approach

1. **Keep Docker as the stable production path** - No changes to current runtime
2. **Run a focused validation spike** - Test Agent OS with a minimal Symphony workflow:
   - Simple repo without services
   - Required tools: bash, git, node, pnpm, pi only
   - Mount workspace directly
   - Run a real coding task end-to-end
3. **Categorize workloads** - Determine which repos can run on Agent OS vs. need Docker
4. **Consider hybrid runtime** - Agent OS for simple coding tasks, Docker for service-dependent repos

### Potential Hybrid Model

```
┌─────────────────────────────────────────────────────────┐
│                    Symphony Runtime                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────┐      ┌─────────────────────┐       │
│  │   Agent OS      │      │   Docker Backend    │       │
│  │   Backend       │      │   (existing)        │       │
│  ├─────────────────┤      ├─────────────────────┤       │
│  │ • No services   │      │ • Has services      │       │
│  │ • Simple repos  │      │ • Complex deps      │       │
│  │ • Fast startup  │      │ • Full Linux        │       │
│  │ • Pi native     │      │ • All tools         │       │
│  └─────────────────┘      └─────────────────────┘       │
│                                                          │
│  Selection: repo manifest + service requirements         │
└─────────────────────────────────────────────────────────┘
```

## Suggested Follow-up Tickets

1. **SYM-XX: Agent OS toolchain validation spike**
   - Install and test required Symphony tools on Agent OS
   - Document which tools work, which fail, which need adaptation
   - Scope: bash, git, node, pnpm, pi, python3, rg, psql, gh

2. **SYM-XX: Agent OS Pi integration prototype**
   - Adapt harness transport layer for Agent OS execution
   - Test dynamic tool injection (linear_graphql, finish_and_send_to_review)
   - Validate event streaming and observability

3. **SYM-XX: Workspace backend abstraction review**
   - Review `WorkspaceBackend` interface for runtime-agnostic design
   - Identify Docker-specific assumptions in current interface
   - Design adapter pattern for multiple backends

4. **SYM-XX: Service-less repo Agent OS pilot**
   - Select a real repo without service dependencies
   - Run full Symphony workflow on Agent OS
   - Measure: startup time, execution overhead, failure modes

5. **SYM-XX: Hybrid runtime routing design**
   - Design manifest-based backend selection
   - Define fallback strategy (Agent OS -> Docker)
   - Consider per-repo or per-run backend selection

## Conclusion

Agent OS is worth continued evaluation but is not ready to replace Docker for Symphony today. The most promising path is a hybrid model where Agent OS handles simple coding tasks (faster, lighter) and Docker handles complex workloads (full Linux, services).

The key validation questions remain:
1. Can Agent OS provide the required toolchain?
2. Can Symphony's Pi integration work natively on Agent OS?
3. Can service-dependent repos be handled via host services or hybrid routing?

Until these questions are answered with concrete experiments, Docker remains the safe default for Symphony's production runtime.
