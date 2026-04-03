# @symphony/core

Compatibility facade and transitional runtime wiring while the former core surface is split into focused packages.

## Owns

- Thin compatibility re-exports over focused Symphony packages.
- Transitional runtime composition seams until `@symphony/core` is deleted.
- Small package-local metadata and test helpers that have not yet been relocated.

## Does not own

- Hono or Next.js app wiring.
- Runtime contract ownership.
- Long-lived domain modules that already have their own top-level packages.

This package is intentionally shrinking toward removal as the remaining facades and helpers are relocated.
