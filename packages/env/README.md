# Env

Type-safe environment variable handling powered by `@t3-oss/env-core`.

## Read next
- System docs flow: `README.md`
- Runtime env usage: `apps/symphony-runtime/README.md`
- Dashboard env usage: `apps/symphony-dashboard/README.md`

Usage:

```ts
import { createEnv, z, loadEnv } from "@symphony/env";

loadEnv({ mode: process.env.NODE_ENV, quiet: true });

export const env = createEnv({
  server: {
    DATABASE_URL: z.url()
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true
});
```

`loadEnv()` precedence is explicit:
- default merge behavior preserves existing `process.env` values
- within one directory, higher-precedence files win: `.env.<mode>.local`, `.env.local`, `.env.<mode>`, `.env`
- callers should load env from their own package/app boundary instead of reaching into sibling package env files
