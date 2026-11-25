import type {
  Check,
  CheckResult,
  Integration,
  IntegrationContext,
  Logger,
} from '@switchyard/plugin-sdk'
import { describe, expect, it, vi } from 'vitest'
import { runConnectionChecks } from '../src/checks/run-connection.js'
import { splitCredentials } from '../src/connections/credentials.js'
import { createSecretBox } from '../src/crypto/secrets.js'
import type { RunnableConnection } from '../src/store/types.js'
import { testConfig } from './helpers.js'

const box = createSecretBox(testConfig().SWITCHYARD_ENCRYPTION_KEY)
const USER = '11111111-1111-4111-8111-111111111111'
const CONN = '22222222-2222-4222-8222-222222222222'
const TOKEN = 'tok_SUPER_SECRET_value_123'
const now = new Date('2026-05-05T10:00:00.000Z')

const ok = (checkId: string, extra: Partial<CheckResult> = {}): CheckResult => ({
  checkId,
  status: 'ok',
  message: 'fine',
  checkedAt: now.toISOString(),
  ...extra,
})

const checkOf = (id: string, run: Check['run']): Check => ({ id, title: id, run })

const integrationOf = (checks: Check[]): Integration => ({
  id: 'fake',
  name: 'Fake',
  credentialsSchema: [
    { key: 'token', label: 'Token', secret: true },
    { key: 'teamId', label: 'Team', secret: false },
  ],
  checks,
})

function connection(
  integration: Integration,
  over: { user?: string; id?: string; sealUser?: string; secrets?: string | null } = {},
): RunnableConnection {
  const sealed = splitCredentials(
    box,
    integration,
    { token: TOKEN, teamId: 'team_1' },
    over.id ?? CONN,
    over.sealUser ?? over.user ?? USER,
  )
  return {
    id: CONN,
    projectId: 'p',
    integrationId: integration.id,
    config: sealed.config,
    secrets: over.secrets === undefined ? sealed.secrets : over.secrets,
  }
}

function fakeLogger() {
  const calls: { level: string; message: string; meta?: Record<string, unknown> }[] = []
  const rec =
    (level: string) =>
    (message: string, meta?: Record<string, unknown>): void => {
      calls.push({ level, message, meta })
    }
  const logger: Logger = {
    debug: rec('debug'),
    info: rec('info'),
    warn: rec('warn'),
    error: rec('error'),
  }
  return { logger, calls }
}

const run = (
  integration: Integration,
  conn: RunnableConnection,
  extra: Partial<Parameters<typeof runConnectionChecks>[0]> = {},
) => {
  const { logger, calls } = fakeLogger()
  const outcome = runConnectionChecks({
    integration,
    connection: conn,
    userId: USER,
    box,
    fetch: vi.fn(async () => new Response('ok')) as unknown as typeof fetch,
    logger,
    now,
    timeoutMs: 1000,
    ...extra,
  })
  return { promise: outcome.then((o) => o.results), outcome, calls }
}

describe('runConnectionChecks', () => {
  it('passes config merged with decrypted secrets as frozen credentials', async () => {
    let seen: IntegrationContext | undefined
    const integration = integrationOf([
      checkOf('a', async (ctx) => {
        seen = ctx
        return ok('a')
      }),
    ])
    const results = await run(integration, connection(integration)).promise
    expect(seen!.credentials).toEqual({ token: TOKEN, teamId: 'team_1' })
    expect(Object.isFrozen(seen!.credentials)).toBe(true)
    expect(results).toEqual([
      { checkId: 'a', status: 'ok', message: 'fine', details: null, checkedAt: now.toISOString() },
    ])
  })

  it('works with a connection without secrets', async () => {
    let creds: unknown
    const integration = integrationOf([
      checkOf('a', async (ctx) => {
        creds = ctx.credentials
        return ok('a')
      }),
    ])
    const conn = { ...connection(integration, { secrets: null }), config: { teamId: 't' } }
    const results = await run(integration, conn).promise
    expect(creds).toEqual({ teamId: 't' })
    expect(results[0]!.status).toBe('ok')
  })

  it('redacts the token from stored results and from logs', async () => {
    const integration = integrationOf([
      checkOf('a', async (ctx) => {
        ctx.logger.info(`using ${TOKEN}`, { auth: `Bearer ${TOKEN}`, nested: [TOKEN] })
        return ok('a', {
          message: `token is ${TOKEN}`,
          details: { echoed: TOKEN, [`k${TOKEN}`]: 1 },
        })
      }),
      checkOf('b', async () => {
        throw new Error(`failed with ${TOKEN}`)
      }),
    ])
    const { promise, calls } = run(integration, connection(integration))
    const results = await promise
    const serialized = JSON.stringify([results, calls])
    expect(serialized).not.toContain(TOKEN)
    expect(results[0]!.message).toBe('token is ***')
    expect(results[0]!.details).toEqual({ echoed: '***', 'k***': 1 })
    expect(calls.some((c) => c.message === 'using ***')).toBe(true)
  })

  it('turns a throwing check into a generic error and still runs the next checks', async () => {
    const second = vi.fn(async () => ok('second'))
    const integration = integrationOf([
      checkOf('first', async () => {
        throw new Error('boom')
      }),
      checkOf('second', second),
    ])
    const { promise, calls } = run(integration, connection(integration))
    const results = await promise
    expect(results.map((r) => [r.checkId, r.status])).toEqual([
      ['first', 'error'],
      ['second', 'ok'],
    ])
    expect(results[0]!.message).toBe('La vérification a échoué.')
    expect(second).toHaveBeenCalledOnce()
    expect(calls.some((c) => c.level === 'warn' && c.message === 'check failed')).toBe(true)
  })

  it('handles a synchronous throw and a non-Error rejection', async () => {
    const integration = integrationOf([
      checkOf('sync', () => {
        throw new TypeError('sync')
      }),
      checkOf('str', () => Promise.reject('just a string')),
    ])
    const results = await run(integration, connection(integration)).promise
    expect(results.map((r) => r.status)).toEqual(['error', 'error'])
  })

  it('maps garbage returned by a check to an unknown result', async () => {
    const integration = integrationOf([checkOf('a', async () => null as never)])
    const results = await run(integration, connection(integration)).promise
    expect(results[0]).toMatchObject({ checkId: 'a', status: 'unknown' })
  })

  it('times out a check that never resolves and ignores the signal', async () => {
    const integration = integrationOf([
      checkOf('hang', () => new Promise<CheckResult>(() => {})),
      checkOf('after', async () => ok('after')),
    ])
    const started = Date.now()
    const results = await run(integration, connection(integration), { timeoutMs: 50 }).promise
    expect(Date.now() - started).toBeLessThan(900)
    expect(results[0]).toMatchObject({
      checkId: 'hang',
      status: 'error',
      message: 'La vérification a dépassé le délai.',
    })
    expect(results[1]!.status).toBe('ok')
  })

  it('aborts ctx.signal on timeout', async () => {
    let signal: AbortSignal | undefined
    const integration = integrationOf([
      checkOf('hang', (ctx) => {
        signal = ctx.signal
        return new Promise<CheckResult>(() => {})
      }),
    ])
    await run(integration, connection(integration), { timeoutMs: 30 }).promise
    expect(signal!.aborted).toBe(true)
  })

  it('does not abort ctx.signal when the check finishes in time', async () => {
    let signal: AbortSignal | undefined
    const integration = integrationOf([
      checkOf('a', async (ctx) => {
        signal = ctx.signal
        return ok('a')
      }),
    ])
    await run(integration, connection(integration)).promise
    expect(signal!.aborted).toBe(false)
  })

  it('gives ctx.fetch a signal, combined with the caller signal', async () => {
    const baseFetch = vi.fn(
      async (...args: [unknown, RequestInit?]) => new Response(String(args.length)),
    )
    const caller = new AbortController()
    let ctxSignal: AbortSignal | undefined
    const integration = integrationOf([
      checkOf('a', async (ctx) => {
        ctxSignal = ctx.signal
        await ctx.fetch('https://example.test/a')
        await ctx.fetch('https://example.test/b', { method: 'POST', signal: caller.signal })
        return ok('a')
      }),
    ])
    await run(integration, connection(integration), {
      fetch: baseFetch as unknown as typeof fetch,
    }).promise
    const first = baseFetch.mock.calls[0]![1]!
    const second = baseFetch.mock.calls[1]![1]!
    expect(first.signal).toBe(ctxSignal)
    expect(second.method).toBe('POST')
    expect(second.signal).toBeInstanceOf(AbortSignal)
    expect(second.signal!.aborted).toBe(false)
    caller.abort()
    expect(second.signal!.aborted).toBe(true)
  })

  it('aborts the run when the outer stop signal fires', async () => {
    const stop = new AbortController()
    const integration = integrationOf([
      checkOf('hang', () => new Promise<CheckResult>(() => {})),
      checkOf('next', async () => ok('next')),
    ])
    const { promise } = run(integration, connection(integration), {
      signal: stop.signal,
      timeoutMs: 5000,
    })
    setTimeout(() => stop.abort(), 20)
    const started = Date.now()
    const results = await promise
    expect(Date.now() - started).toBeLessThan(2000)
    expect(results[0]!.status).toBe('error')
    expect(results.every((r) => r.status === 'error')).toBe(true)
  })

  it('does not run any check when the stop signal is already aborted', async () => {
    const stop = new AbortController()
    stop.abort()
    const spy = vi.fn(async () => ok('a'))
    const integration = integrationOf([checkOf('a', spy)])
    const results = await run(integration, connection(integration), { signal: stop.signal }).promise
    expect(results[0]!.status).toBe('error')
  })

  it('marks every check unknown and runs none when secrets were sealed for another user', async () => {
    const spy = vi.fn(async () => ok('a'))
    const integration = integrationOf([checkOf('a', spy), checkOf('b', spy)])
    const conn = connection(integration, { sealUser: '33333333-3333-4333-8333-333333333333' })
    const { promise, calls } = run(integration, conn)
    const results = await promise
    expect(spy).not.toHaveBeenCalled()
    expect(results.map((r) => r.status)).toEqual(['unknown', 'unknown'])
    expect(results[0]!.message).toMatch(/^Identifiants illisibles/)
    expect(results.map((r) => r.checkId)).toEqual(['a', 'b'])
    expect(JSON.stringify(calls)).not.toContain(TOKEN)
  })

  it('marks every check unknown when secrets were sealed with another key', async () => {
    const spy = vi.fn(async () => ok('a'))
    const integration = integrationOf([checkOf('a', spy)])
    const otherBox = createSecretBox(Buffer.alloc(32, 0x99))
    const sealed = splitCredentials(
      otherBox,
      integration,
      { token: TOKEN, teamId: 't' },
      CONN,
      USER,
    )
    const results = await run(integration, { ...connection(integration), ...sealed }).promise
    expect(spy).not.toHaveBeenCalled()
    expect(results[0]).toMatchObject({ status: 'unknown' })
  })

  it('marks checks unknown when the sealed secrets are corrupted', async () => {
    const integration = integrationOf([checkOf('a', async () => ok('a'))])
    const results = await run(integration, connection(integration, { secrets: 'garbage' })).promise
    expect(results[0]!.status).toBe('unknown')
  })

  it('returns an empty list for an integration without checks', async () => {
    const integration = integrationOf([])
    expect(await run(integration, connection(integration)).promise).toEqual([])
  })

  describe('ctx.fetch guard', () => {
    const fetchSpy = () => vi.fn<typeof fetch>(async () => new Response('ok'))
    async function attempt(input: string | URL, init?: RequestInit) {
      const base = fetchSpy()
      let error: unknown
      const integration = integrationOf([
        checkOf('a', async (ctx) => {
          try {
            await ctx.fetch(input, init)
          } catch (err) {
            error = err
          }
          return ok('a')
        }),
      ])
      await run(integration, connection(integration), { fetch: base as unknown as typeof fetch })
        .promise
      return { base, error }
    }

    it.each(['http://example.test/a', 'file:///etc/passwd', '/relative', 'ftp://example.test'])(
      'rejects %s with a TypeError and never calls the underlying fetch',
      async (url) => {
        const { base, error } = await attempt(url)
        expect(error).toBeInstanceOf(TypeError)
        expect(base).not.toHaveBeenCalled()
      },
    )

    it('rejects an http URL object', async () => {
      const { base, error } = await attempt(new URL('http://example.test/'))
      expect(error).toBeInstanceOf(TypeError)
      expect(base).not.toHaveBeenCalled()
    })

    it('defaults to redirect: error', async () => {
      const { base, error } = await attempt('https://example.test/a')
      expect(error).toBeUndefined()
      expect(base.mock.calls[0]![1]!.redirect).toBe('error')
    })

    it('keeps an explicit redirect option', async () => {
      const { base } = await attempt('https://example.test/a', { redirect: 'manual' })
      expect(base.mock.calls[0]![1]!.redirect).toBe('manual')
    })
  })

  describe('pending', () => {
    it('settles immediately when every plugin settled', async () => {
      const integration = integrationOf([checkOf('a', async () => ok('a'))])
      const { outcome } = run(integration, connection(integration))
      const { pending } = await outcome
      await expect(pending).resolves.toBeUndefined()
    })

    it('stays pending after a timeout until the plugin settles', async () => {
      let release!: () => void
      const integration = integrationOf([
        checkOf('hang', () => new Promise<CheckResult>((r) => (release = () => r(ok('hang'))))),
      ])
      const { outcome } = run(integration, connection(integration), { timeoutMs: 20 })
      const { results, pending } = await outcome
      expect(results[0]!.status).toBe('error')
      let settled = false
      void pending.then(() => (settled = true))
      await new Promise((r) => setTimeout(r, 20))
      expect(settled).toBe(false)
      release()
      await pending
      expect(settled).toBe(true)
    })

    it('settles even when the plugin rejects late', async () => {
      let fail!: () => void
      const integration = integrationOf([
        checkOf(
          'a',
          () => new Promise<CheckResult>((_, rej) => (fail = () => rej(new Error('x')))),
        ),
      ])
      const { outcome } = run(integration, connection(integration), { timeoutMs: 20 })
      const { pending } = await outcome
      fail()
      await expect(pending).resolves.toBeUndefined()
    })
  })
})
