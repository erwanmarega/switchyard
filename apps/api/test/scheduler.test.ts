import type { Check, CheckResult, Integration, Logger } from '@switchyard/plugin-sdk'
import { describe, expect, it, vi } from 'vitest'
import { createCheckScheduler, type CheckSchedulerOptions } from '../src/checks/scheduler.js'
import { splitCredentials } from '../src/connections/credentials.js'
import { createSecretBox } from '../src/crypto/secrets.js'
import { IntegrationRegistry } from '../src/integrations/registry.js'
import type { SchedulerStore } from '../src/store/types.js'
import { testConfig } from './helpers.js'
import { createMemoryStore } from './support/memory-store.js'

const box = createSecretBox(testConfig().SWITCHYARD_ENCRYPTION_KEY)
const USER = '11111111-1111-4111-8111-111111111111'
const TOKEN = 'tok_SCHEDULER_SECRET_42'
const INTERVAL = 300
const T0 = Date.parse('2026-05-05T10:00:00.000Z')

const ok = (checkId: string): CheckResult => ({
  checkId,
  status: 'ok',
  message: 'fine',
  checkedAt: new Date().toISOString(),
})

const integrationOf = (id: string, checks: Check[]): Integration => ({
  id,
  name: id,
  credentialsSchema: [{ key: 'token', label: 'Token', secret: true }],
  checks,
})

const simpleCheck = (id = 'ping', run?: Check['run']): Check => ({
  id,
  title: id,
  run: run ?? (async () => ok(id)),
})

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

function setup(
  integrations: Integration[],
  over: Partial<CheckSchedulerOptions> = {},
  scheduleWrap?: (s: SchedulerStore) => SchedulerStore,
) {
  let clock = T0
  const store = createMemoryStore({ now: () => clock })
  const registry = new IntegrationRegistry()
  for (const i of integrations) registry.register(i)
  const { logger, calls } = fakeLogger()
  const scheduler = createCheckScheduler({
    store,
    scheduler: scheduleWrap ? scheduleWrap(store) : store,
    registry,
    box,
    logger,
    intervalSeconds: INTERVAL,
    now: () => new Date(clock),
    fetch: vi.fn(async () => new Response('ok')) as unknown as typeof fetch,
    checkTimeoutMs: 1000,
    ...over,
  })
  return {
    store,
    scheduler,
    calls,
    advance: (ms: number) => {
      clock += ms
    },
    async addConnection(integration: Integration, user = USER) {
      const project = await store.createProject(user, 'P')
      const id = crypto.randomUUID()
      const sealed = splitCredentials(box, integration, { token: TOKEN }, id, user)
      await store.createConnection(user, project.id, {
        id,
        integrationId: integration.id,
        label: 'L',
        ...sealed,
      })
      return { id, projectId: project.id, user }
    },
  }
}

describe('check scheduler', () => {
  it('claims due connections, runs their checks and stores the results', async () => {
    const integration = integrationOf('fake', [simpleCheck('a'), simpleCheck('b')])
    const s = setup([integration])
    const c = await s.addConnection(integration)
    await s.scheduler.tick()
    const stored = s.store.rawResults(c.id)
    expect(stored.map((r) => [r.checkId, r.status])).toEqual([
      ['a', 'ok'],
      ['b', 'ok'],
    ])
    expect(stored[0]!.checkedAt).toBe(new Date(T0).toISOString())
  })

  it('does nothing on a second tick right after, and runs again once the interval passed', async () => {
    const integration = integrationOf('fake', [simpleCheck('a')])
    const s = setup([integration])
    const c = await s.addConnection(integration)
    await s.scheduler.tick()
    await s.scheduler.tick()
    expect(s.store.rawResults(c.id)).toHaveLength(1)
    s.advance(INTERVAL * 1000 - 1)
    await s.scheduler.tick()
    expect(s.store.rawResults(c.id)).toHaveLength(1)
    s.advance(1)
    await s.scheduler.tick()
    expect(s.store.rawResults(c.id)).toHaveLength(2)
  })

  it('makes a connection due again when its credentials are patched', async () => {
    const integration = integrationOf('fake', [simpleCheck('a')])
    const s = setup([integration])
    const c = await s.addConnection(integration)
    await s.scheduler.tick()
    const sealed = splitCredentials(box, integration, { token: 'new_token_value' }, c.id, c.user)
    await s.store.updateConnection(c.user, c.projectId, c.id, { credentials: sealed })
    await s.scheduler.tick()
    expect(s.store.rawResults(c.id)).toHaveLength(2)
  })

  it('skips a connection deleted between the claim and the run', async () => {
    const integration = integrationOf('fake', [simpleCheck('a')])
    const s = setup([integration], {}, (store) => ({
      ...store,
      claimDueConnections: async (limit, interval, perUser) => {
        const due = await store.claimDueConnections(limit, interval, perUser)
        for (const d of due) await s.store.deleteConnection(d.userId, d.projectId, d.connectionId)
        return due
      },
    }))
    const c = await s.addConnection(integration)
    await expect(s.scheduler.tick()).resolves.toBeUndefined()
    expect(s.store.rawResults(c.id)).toEqual([])
  })

  it('skips an unknown integration without throwing and keeps going', async () => {
    const known = integrationOf('known', [simpleCheck('a')])
    const ghost = integrationOf('ghost', [simpleCheck('a')])
    const s = setup([known])
    const g = await s.addConnection(ghost)
    const k = await s.addConnection(known)
    await expect(s.scheduler.tick()).resolves.toBeUndefined()
    expect(s.store.rawResults(g.id)).toEqual([])
    expect(s.store.rawResults(k.id)).toHaveLength(1)
    expect(
      s.calls.some((c) => c.level === 'warn' && c.message.includes('unknown integration')),
    ).toBe(true)
  })

  it('does not stop other connections when one run fails', async () => {
    const integration = integrationOf('fake', [simpleCheck('a')])
    const s = setup([integration])
    const bad = await s.addConnection(integration)
    const good = await s.addConnection(integration)
    const original = s.store.insertCheckResults.bind(s.store)
    s.store.insertCheckResults = async (u, p, c, r) => {
      if (c === bad.id) throw new Error('db exploded')
      return original(u, p, c, r)
    }
    await s.scheduler.tick()
    expect(s.store.rawResults(good.id)).toHaveLength(1)
    expect(s.store.rawResults(bad.id)).toEqual([])
    expect(s.calls.some((c) => c.level === 'error' && c.message === 'connection run failed')).toBe(
      true,
    )
  })

  it('survives a failing claim', async () => {
    const integration = integrationOf('fake', [simpleCheck('a')])
    const s = setup([integration], {}, (store) => ({
      ...store,
      claimDueConnections: async () => {
        throw new Error('db down')
      },
    }))
    await expect(s.scheduler.tick()).resolves.toBeUndefined()
    expect(s.calls.some((c) => c.message === 'claiming due connections failed')).toBe(true)
  })

  it('respects the concurrency limit', async () => {
    let inFlight = 0
    let max = 0
    const slow = simpleCheck('slow', async () => {
      inFlight++
      max = Math.max(max, inFlight)
      await new Promise((r) => setTimeout(r, 20))
      inFlight--
      return ok('slow')
    })
    const integration = integrationOf('fake', [slow])
    const s = setup([integration], { concurrency: 2, perUserPerTick: 100 })
    const conns = []
    for (let i = 0; i < 7; i++) conns.push(await s.addConnection(integration))
    await s.scheduler.tick()
    expect(max).toBe(2)
    for (const c of conns) expect(s.store.rawResults(c.id)).toHaveLength(1)
  })

  it('claims at most batchSize connections per tick', async () => {
    const integration = integrationOf('fake', [simpleCheck('a')])
    const s = setup([integration], { batchSize: 2 })
    const conns = []
    for (let i = 0; i < 3; i++) conns.push(await s.addConnection(integration))
    await s.scheduler.tick()
    expect(conns.map((c) => s.store.rawResults(c.id).length)).toEqual([1, 1, 0])
    await s.scheduler.tick()
    expect(s.store.rawResults(conns[2]!.id)).toHaveLength(1)
  })

  it('stop() aborts in-flight checks, stores nothing and awaits the tick', async () => {
    let started!: () => void
    const startedP = new Promise<void>((r) => (started = r))
    let sawAbort = false
    const hang = simpleCheck('hang', (ctx) => {
      started()
      ctx.signal?.addEventListener('abort', () => (sawAbort = true))
      return new Promise<CheckResult>(() => {})
    })
    const integration = integrationOf('fake', [hang])
    const s = setup([integration], { checkTimeoutMs: 30_000 })
    const c = await s.addConnection(integration)
    const tick = s.scheduler.tick()
    await startedP
    await s.scheduler.stop()
    await expect(tick).resolves.toBeUndefined()
    expect(sawAbort).toBe(true)
    expect(s.store.rawResults(c.id)).toEqual([])
  })

  it('stop() is idempotent and a stopped scheduler does not start nor claim', async () => {
    const integration = integrationOf('fake', [simpleCheck('a')])
    const s = setup([integration], { tickMs: 5 })
    const c = await s.addConnection(integration)
    await s.scheduler.stop()
    await s.scheduler.stop()
    s.scheduler.start()
    await s.scheduler.tick()
    expect(s.store.rawResults(c.id)).toEqual([])
  })

  it('start() runs a tick immediately and stop() clears the interval', async () => {
    const integration = integrationOf('fake', [simpleCheck('a')])
    const s = setup([integration], { tickMs: 10 })
    const c = await s.addConnection(integration)
    s.scheduler.start()
    s.scheduler.start()
    await vi.waitFor(() => expect(s.store.rawResults(c.id)).toHaveLength(1))
    await s.scheduler.stop()
    s.advance(INTERVAL * 1000)
    await new Promise((r) => setTimeout(r, 40))
    expect(s.store.rawResults(c.id)).toHaveLength(1)
  })

  it('shares the running promise between overlapping tick() calls', async () => {
    const integration = integrationOf('fake', [simpleCheck('a')])
    const s = setup([integration])
    const claim = vi.spyOn(s.store, 'claimDueConnections')
    await s.addConnection(integration)
    const p1 = s.scheduler.tick()
    const p2 = s.scheduler.tick()
    expect(p2).toBe(p1)
    await Promise.all([p1, p2])
    expect(claim).toHaveBeenCalledOnce()
    await s.scheduler.tick()
    expect(claim).toHaveBeenCalledTimes(2)
  })

  it('prunes only after pruneEveryMs has elapsed, with the retention days', async () => {
    const integration = integrationOf('fake', [simpleCheck('a')])
    const s = setup([integration], { pruneEveryMs: 1000, retentionDays: 7 })
    const prune = vi.spyOn(s.store, 'pruneCheckResults')
    await s.scheduler.tick()
    expect(prune).not.toHaveBeenCalled()
    s.advance(999)
    await s.scheduler.tick()
    expect(prune).not.toHaveBeenCalled()
    s.advance(1)
    await s.scheduler.tick()
    expect(prune).toHaveBeenCalledExactlyOnceWith(7)
    await s.scheduler.tick()
    expect(prune).toHaveBeenCalledOnce()
  })

  it('survives a failing prune', async () => {
    const integration = integrationOf('fake', [simpleCheck('a')])
    const s = setup([integration], { pruneEveryMs: 1 }, (store) => ({
      ...store,
      pruneCheckResults: async () => {
        throw new Error('nope')
      },
    }))
    s.advance(5)
    await expect(s.scheduler.tick()).resolves.toBeUndefined()
    expect(s.calls.some((c) => c.message === 'pruning check results failed')).toBe(true)
  })

  it('never logs the secret token, even when a check leaks it', async () => {
    const leaky = simpleCheck('leaky', async (ctx) => {
      ctx.logger.warn(`token=${ctx.credentials.token}`, { t: ctx.credentials.token })
      if (ctx.credentials.token) throw new Error(`bad ${ctx.credentials.token}`)
      return ok('leaky')
    })
    const integration = integrationOf('fake', [
      leaky,
      simpleCheck('echo', async (ctx) => ({
        ...ok('echo'),
        message: String(ctx.credentials.token),
      })),
    ])
    const s = setup([integration])
    const c = await s.addConnection(integration)
    await s.scheduler.tick()
    expect(JSON.stringify(s.calls)).not.toContain(TOKEN)
    expect(JSON.stringify(s.store.rawResults(c.id))).not.toContain(TOKEN)
    expect(s.calls.length).toBeGreaterThan(0)
  })

  it('claims at most perUserPerTick connections per user, so others are not starved', async () => {
    const integration = integrationOf('fake', [simpleCheck('a')])
    const other = '99999999-9999-4999-8999-999999999999'
    const s = setup([integration], { perUserPerTick: 2, batchSize: 4 })
    const hog = []
    for (let i = 0; i < 5; i++) hog.push(await s.addConnection(integration))
    const small = await s.addConnection(integration, other)
    await s.scheduler.tick()
    expect(hog.map((c) => s.store.rawResults(c.id).length)).toEqual([1, 1, 0, 0, 0])
    expect(s.store.rawResults(small.id)).toHaveLength(1)
  })

  it('passes perUserPerTick (default 5) to the claim', async () => {
    const integration = integrationOf('fake', [simpleCheck('a')])
    const s = setup([integration])
    const claim = vi.spyOn(s.store, 'claimDueConnections')
    await s.scheduler.tick()
    expect(claim).toHaveBeenCalledWith(20, INTERVAL, 5)
  })

  it('skips a connection whose previous plugin promise is still pending, until it settles', async () => {
    let release!: () => void
    let runs = 0
    const hang = simpleCheck('hang', () => {
      runs++
      if (runs > 1) return Promise.resolve(ok('hang'))
      return new Promise<CheckResult>((resolve) => (release = () => resolve(ok('hang'))))
    })
    const integration = integrationOf('fake', [hang])
    const s = setup([integration], { checkTimeoutMs: 20 })
    const c = await s.addConnection(integration)
    await s.scheduler.tick()
    expect(s.store.rawResults(c.id).map((r) => r.status)).toEqual(['error'])

    s.advance(INTERVAL * 1000)
    await s.scheduler.tick()
    expect(runs).toBe(1)
    expect(s.store.rawResults(c.id)).toHaveLength(1)
    const warn = s.calls.find((x) => x.level === 'warn' && x.message.includes('still-running'))
    expect(warn?.meta).toEqual({ connectionIds: [c.id] })

    release()
    await new Promise((r) => setTimeout(r, 5))
    s.advance(INTERVAL * 1000)
    await s.scheduler.tick()
    expect(runs).toBe(2)
    expect(s.store.rawResults(c.id).map((r) => r.status)).toEqual(['error', 'ok'])
  })

  it('stores NUL and lone surrogates as well-formed text', async () => {
    const bad = 'a\u0000b\ud800c'
    const integration = integrationOf('fake', [
      simpleCheck('dirty', async () => ({
        ...ok('dirty'),
        message: bad,
        details: { [bad]: bad, list: [bad] },
      })),
    ])
    const s = setup([integration])
    const c = await s.addConnection(integration)
    await s.scheduler.tick()
    const [r] = s.store.rawResults(c.id)
    expect(r!.message).toBe('ab\ufffdc')
    expect(r!.details).toEqual({ 'ab\ufffdc': 'ab\ufffdc', list: ['ab\ufffdc'] })
    expect(JSON.stringify(r)).not.toContain('\\u0000')
  })
})
