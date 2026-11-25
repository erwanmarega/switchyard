# @switchyard/plugin-sdk

Common interface every Switchyard integration implements. Integrations are read-only:
a check observes a tool and reports a status, it never changes anything.

## Consuming the package

`exports` has a custom `source` condition that points to `./src/index.ts`, so dev tooling can use
the TypeScript source with no build step:

- tsx: `--conditions=source`
- Vitest / Vite / Nuxt: `resolve.conditions: ['source']` (and `ssr.resolve.conditions`)
- tsc (typecheck): `"customConditions": ["source"]`

Without that condition (production, `node dist/server.js`), consumers get the built output:
`npm run build -w @switchyard/plugin-sdk` emits `dist/` with declarations.

## Writing checks safely

Checks run in-process inside the Switchyard API, with the connection's credentials decrypted.

- Be read-only: observe the tool, never change anything.
- Honor `ctx.signal` and make every HTTP call through `ctx.fetch` (it carries the signal). A check
  that takes longer than 15 seconds is aborted and reported as an error.
- `ctx.fetch` only accepts absolute `https:` URLs (anything else throws a `TypeError`) and uses
  `redirect: 'error'` unless you set `redirect` explicitly. Always call a fixed provider base URL
  and only append path or id fragments you validated from the config; never build the host from
  user-provided config.
- Never put request URLs, headers or raw error messages in a result: they can echo credentials or
  internal details. Report a short fixed message instead.
- Checks run in-process: a CPU-bound loop blocks the whole API (the timeout cannot interrupt it).
  Keep work asynchronous and small. A plugin that ignores `ctx.signal` keeps running after the
  timeout, and its connection is skipped until it settles.
- Never put credentials in a result (`message`, `details`) or in logs. The runner redacts known
  secret values as a safety net, not as a guarantee.
- Keep results small: messages are truncated to 2000 characters and `details` over 8 KB are dropped.
- `checkId`, `checkedAt` and an invalid `status` are overridden by the runner.
