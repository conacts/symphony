# Symphony Performance And Observability Notes

## Current Context

These notes capture what we learned while investigating high CPU usage, expensive test runs, and how Symphony should collect runtime resource data without adding unnecessary complexity too early.

The main goal is not premature tuning. The main goal is to make expensive behavior visible, identify the real hotspots, and then optimize the code and execution model from evidence.

## Verified Findings

### Docker was not the main CPU problem

The high `300%+` CPU readings were not primarily Docker daemon overhead.

What was actually hot:

- active Symphony workspace containers
- `pnpm verify:precommit`
- `turbo run lint typecheck test`
- `vitest` workers
- `tsc`
- `next build`

Docker itself was not the dominant process.

### PID `19726` was the host orchestrator, not the real worker

At inspection time, PID `19726` was:

```text
node .../pnpm/bin/pnpm.cjs dev:host
```

This is an important distinction:

- the parent host process can show high CPU because its child tree is active
- the expensive work is usually in descendant processes, not the `pnpm dev:host` wrapper itself

### Build CPU is currently dominated by Next.js

From the first real command profile:

- `next build` peaked around `553.9%` CPU
- the hottest `tsc` process was much lower, around `105.4%`

That means the current build hotspot is not primarily TypeScript compilation. The largest build spike is the web app build.

### Test cost is being driven by large suites plus worker/process overhead

The expensive part of tests does not appear to be simple assertions by themselves.

The likely main contributors are:

1. large test files
2. Vitest worker fan-out
3. Turbo package-level fan-out on top of Vitest workers
4. repeated module loading and transform cost
5. only then, potentially expensive setup helpers or hooks

### Targeted test execution was not narrow enough

A command like:

```bash
pnpm --filter @symphony/api test -- --run src/core/runtime-dynamic-tools.test.ts
```

previously executed a broad set of API tests instead of only the intended file.

Observed side effects:

- unrelated slow suites still ran
- `src/http/app.test.ts` still ran
- `src/core/runtime-services.test.ts` still ran
- default `5s` timeouts were still hit in unrelated files

This meant Symphony was paying for far more suite surface than intended during "targeted" verification.

That was a correctness issue in the test invocation path, not just a tuning issue.

Current state:

- package test scripts now go through [`scripts/run-vitest.mjs`](/Users/connorsheehan/junction/symphony/scripts/run-vitest.mjs)
- the wrapper strips pnpm's extra leading `--`
- targeted commands now stay targeted

## Monitoring Added

### Command-level process monitoring

We added:

- [`scripts/monitor-command.mjs`](/Users/connorsheehan/junction/symphony/scripts/monitor-command.mjs)

This script:

- runs an arbitrary command
- samples its descendant process tree once per second
- captures CPU, memory, RSS, and command args
- writes a JSON profile to:
  - `.symphony/metrics/command-profiles/`

Current root scripts:

- `pnpm monitor:build`
- `pnpm monitor:test`

### Vitest timing reporting

We added timing instrumentation in:

- [`packages/vitest-configs/src/base.ts`](/Users/connorsheehan/junction/symphony/packages/vitest-configs/src/base.ts)

This currently provides:

- per-module timing summary
- optional JSON output when `SYMPHONY_VITEST_TIMING_DIR` is set
- optional stderr summary when `SYMPHONY_VITEST_TIMING_SUMMARY=1`

Example artifact:

- [`apps/api/.symphony/metrics/vitest/api.json`](/Users/connorsheehan/junction/symphony/apps/api/.symphony/metrics/vitest/api.json)

### Conservative Vitest worker default

The Vitest config now defaults to:

```text
maxWorkers = "50%"
```

unless overridden by:

```text
SYMPHONY_VITEST_MAX_WORKERS
```

Reason:

- Turbo already parallelizes packages
- unrestricted Vitest worker pools inside each package create oversubscription

## Slow Test Signal Captured So Far

The first timing pass identified these expensive API test files:

- `src/core/runtime-services.test.ts`
- `src/core/agent-harness-runtime.test.ts`
- `src/core/agent-app-server-client.test.ts`
- `src/http/app.test.ts`

This is already enough to start targeted optimization work later.

## Recommendations

### Short-term

1. Keep the new monitoring and timing instrumentation.
2. Fix targeted test command forwarding so narrow runs stay narrow.
3. Continue collecting data before making aggressive test-architecture changes.

### Medium-term

1. Surface command CPU and timing data in the dashboard.
2. Replace the current rudimentary resources view with command- and run-scoped metrics.
3. Identify patterns in the slowest tests and codify them in testing guidance.

### Data retention policy

The best first policy is:

- collect detailed resource data only while a ticket is actively `In Progress`
- avoid full-time global collection when nothing is running

This keeps the data more relevant and reduces waste.

## Open Questions

1. Should command-level resource data be stored for every agent command, or only selected classes like:
   - `pnpm build`
   - `pnpm test`
   - `pnpm verify:precommit`
   - `next build`
2. Should the dashboard show:
   - per-command CPU
   - per-run aggregate CPU
   - both
3. Should large timing artifacts be retained indefinitely, or summarized after a run completes?

## Current Position

The right direction is:

- keep collecting this data
- scope collection to active ticket runs
- fix the targeted-test execution problem before assuming tests are inherently too expensive
- use the resulting evidence to tune workers and identify bad patterns
