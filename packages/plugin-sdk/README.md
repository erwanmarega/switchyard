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
