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
  `redirect: 'error'`: redirects are never followed, whatever `redirect` option you pass (the
  allowlist only covers the first URL). The request sent is the validated URL and method snapshot.
  Always call a fixed provider base URL
  and only append path or id fragments you validated from the config; never build the host from
  user-provided config.
- Declare `allowedHosts` (exact lowercase public DNS hostnames, no scheme or port). IP literals
  (including `0x7f`-style forms), `localhost`, single-label hosts and hosts whose last label is not
  alphabetic are rejected. Without it every `ctx.fetch` call is blocked. URLs with credentials or a
  non-default port are always rejected.
- `allowedHosts` and `allowedMethods` are guardrails for honest plugins, not a sandbox: plugins run
  in-process and could call the global `fetch` directly. Only reviewed plugins may be added.
- Read JSON responses with `ctx.readJson(response, maxBytes?)`: it enforces a streaming size cap
  (default 1 MB, hard maximum 10 MB), throws a generic error when the body is missing, too large
  or not valid JSON, and decodes UTF-8. Do not call `response.json()` / `response.text()` on
  untrusted bodies.
- `ctx.fetch` is read-only by default: `allowedMethods` defaults to `['GET', 'HEAD']`. Only widen
  it for read APIs that need it (e.g. a GraphQL query over POST).
- Credential fields: `optional: true` lets a non-secret field be omitted (secret fields are always
  required). Give every non-secret value that ends up in a URL (ids, slugs, names) a `pattern`
  (regex source, anchored as `^(?:pattern)$`). Patterns are not allowed on secret fields. Patterns
  must be linear and short: at most 200 characters, no backreferences and no nested quantifiers
  such as `(a+)+` (rejected by `defineIntegration`). Any credential value containing a control
  character (`\u0000`-`\u001F`, `\u007F`) is rejected.
- Never put request URLs, headers or raw error messages in a result: they can echo credentials or
  internal details. Report a short fixed message instead.
- Checks run in-process: a CPU-bound loop blocks the whole API (the timeout cannot interrupt it).
  Keep work asynchronous and small. A plugin that ignores `ctx.signal` keeps running after the
  timeout, and its connection is skipped until it settles.
- Never put credentials in a result (`message`, `details`) or in logs. The runner redacts known
  secret values as a safety net, not as a guarantee.
- Keep results small: messages are truncated to 2000 characters and `details` over 8 KB are dropped.
- `checkId`, `checkedAt` and an invalid `status` are overridden by the runner.
