# @symphony/core

Deep reusable Symphony orchestration modules for workflow, tracker, workspace, journal, and runtime behavior.

## Owns

- Symphony-owned runtime concepts and deep orchestration interfaces.
- Extraction-ready repository target and runtime config seams.
- Package-local deterministic builders and test-support for future boundary tests.

## Does not own

- Hono or Next.js app wiring.
- Transport schemas and response envelopes.
- Legacy business-domain packages or product-specific behavior.

This package is intentionally scaffolded before feature work so later tickets can deepen it without reorganizing the monorepo.
