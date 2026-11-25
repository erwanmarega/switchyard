// Opt-in integration tests of the check runner against a real Postgres. Same skip pattern and
// requirements as postgres-store.test.ts (SWITCHYARD_TEST_DATABASE_URL, check_runner migration).
// The claim is global (all users): assertions are scoped to this file's own connection ids, and
// our rows are made due with a very old next_check_at so they sort first.
import { randomUUID } from 'node:crypto'
import postgres, { type Sql } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { splitCredentials } from '../src/connections/credentials.js'
import { sanitizeResult } from '../src/checks/sanitize.js'
import { createSecretBox } from '../src/crypto/secrets.js'
import { createPostgresSchedulerStore, createPostgresStore } from '../src/store/postgres.js'
import type { NewCheckResult, SchedulerStore, Store } from '../src/store/types.js'
import { testConfig } from './helpers.js'

const url = process.env.SWITCHYARD_TEST_DATABASE_URL

describe.skipIf(!url)('postgres check runner', () => {
  let sql: Sql
  let sql2: Sql
  let store: Store
  let sched: SchedulerStore
  let sched2: SchedulerStore
  const A = randomUUID()
  const B = randomUUID()
  const box = createSecretBox(testConfig().SWITCHYARD_ENCRYPTION_KEY)
  const integration = {
    id: 'stripe',
    name: 'Stripe',
    checks: [],
    credentialsSchema: [
      { key: 'account', label: 'Account', secret: false },
      { key: 'apiKey', label: 'Key', secret: true },
    ],
  }

  beforeAll(async () => {
    sql = postgres(url!, { ssl: false, max: 4, onnotice: () => {} })
    sql2 = postgres(url!, { ssl: false, max: 4, onnotice: () => {} })
    store = createPostgresStore(sql)
    sched = createPostgresSchedulerStore(sql)
    sched2 = createPostgresSchedulerStore(sql2)
    try {
      for (const [id, n] of [
        [A, 'a'],
        [B, 'b'],
      ] as const) {
        await sql`insert into auth.users (id, email) values (${id}, ${`pgsched-${n}-${id}@example.test`})`
      }
    } catch (err) {
      await sql`delete from auth.users where id in (${A}, ${B})`.catch(() => undefined)
      await sql.end({ timeout: 5 })
      await sql2.end({ timeout: 5 })
      throw err
    }
  })

  afterAll(async () => {
    try {
      if (sql) await sql`delete from auth.users where id in (${A}, ${B})`
    } finally {
      await sql?.end({ timeout: 5 })
      await sql2?.end({ timeout: 5 })
    }
  })

  async function connection(user = A) {
    const project = await store.createProject(user, 'P')
    const id = randomUUID()
    const sealed = splitCredentials(
      box,
      integration,
      { account: 'acme', apiKey: 'sk_x_1234' },
      id,
      user,
    )
    await store.createConnection(user, project.id, {
      id,
      integrationId: 'stripe',
      label: 'L',
      ...sealed,
    })
    return { id, projectId: project.id, user }
  }

  /** Makes the given connections due, ahead of any other row of the database. */
  const makeDue = (ids: string[]) =>
    sql`update switchyard.connections set next_check_at = '1970-01-01T00:00:00Z'::timestamptz
        where id in ${sql(ids)}`

  const nextCheck = async (id: string) => {
    const [r] = await sql<{ next_check_at: Date; updated_at: Date }[]>`
      select next_check_at, updated_at from switchyard.connections where id = ${id}`
    return r!
  }

  const result = (checkId: string, over: Partial<NewCheckResult> = {}): NewCheckResult => ({
    checkId,
    status: 'ok',
    message: `m ${checkId}`,
    details: null,
    checkedAt: new Date().toISOString(),
    ...over,
  })

  describe('claimDueConnections', () => {
    it('never returns the same connection to two concurrent claimers', async () => {
      const conns = await Promise.all(Array.from({ length: 6 }, () => connection()))
      const ids: string[] = conns.map((c) => c.id)
      await makeDue(ids)
      const [x, y] = await Promise.all([
        sched.claimDueConnections(3, 300, 100),
        sched2.claimDueConnections(3, 300, 100),
      ])
      const mine = (r: typeof x) => r.map((d) => d.connectionId).filter((i) => ids.includes(i))
      const all = [...mine(x), ...mine(y)]
      expect(new Set(all).size).toBe(all.length)
      expect(all.length).toBeGreaterThan(0)
      // Each row returned carries its owner and project.
      for (const d of [...x, ...y]) {
        const c = conns.find((k) => k.id === d.connectionId)
        if (c) expect(d).toEqual({ userId: A, projectId: c.projectId, connectionId: c.id })
      }
    })

    it('does not return a claimed connection again until the interval has passed', async () => {
      const c = await connection()
      await makeDue([c.id])
      const first = await sched.claimDueConnections(100, 300, 100)
      expect(first.map((d) => d.connectionId)).toContain(c.id)
      const second = await sched.claimDueConnections(100, 300, 100)
      expect(second.map((d) => d.connectionId)).not.toContain(c.id)

      const { next_check_at } = await nextCheck(c.id)
      const deltaMs = next_check_at.getTime() - Date.now()
      expect(deltaMs).toBeGreaterThan(290_000)
      expect(deltaMs).toBeLessThanOrEqual(300_000)

      await sql`update switchyard.connections set next_check_at = now() - interval '1 second' where id = ${c.id}`
      const third = await sched.claimDueConnections(100, 300, 100)
      expect(third.map((d) => d.connectionId)).toContain(c.id)
    })

    it('claims connections of every user', async () => {
      const a = await connection(A)
      const b = await connection(B)
      await makeDue([a.id, b.id])
      const claimed = await sched.claimDueConnections(100, 300, 100)
      const owners = new Map(claimed.map((d) => [d.connectionId, d.userId]))
      expect(owners.get(a.id)).toBe(A)
      expect(owners.get(b.id)).toBe(B)
    })

    it('claims at most perUser connections per user per call', async () => {
      const conns = await Promise.all(Array.from({ length: 4 }, () => connection(A)))
      const other = await connection(B)
      const ids: string[] = [...conns.map((c) => c.id), other.id]
      await makeDue(ids)
      // Our rows sort first (epoch). B's single row must not be starved by A's four.
      const claimed = await sched.claimDueConnections(100, 300, 2)
      const mine = claimed.filter((d) => ids.includes(d.connectionId))
      expect(mine.filter((d) => d.userId === A)).toHaveLength(2)
      expect(mine.filter((d) => d.userId === B).map((d) => d.connectionId)).toContain(other.id)
      // The rest is still due and is claimed by the next calls.
      const next = await sched.claimDueConnections(100, 300, 2)
      expect(next.filter((d) => ids.includes(d.connectionId) && d.userId === A)).toHaveLength(2)
    })

    it('respects the limit', async () => {
      const claimed = await sched.claimDueConnections(1, 300, 100)
      expect(claimed.length).toBeLessThanOrEqual(1)
    })

    it('does not bump updated_at', async () => {
      const c = await connection()
      await sql`update switchyard.connections
                set updated_at = '2020-01-01T00:00:00Z', next_check_at = '1970-01-01T00:00:00Z'
                where id = ${c.id}`
      const before = await nextCheck(c.id)
      const claimed = await sched.claimDueConnections(100, 300, 100)
      expect(claimed.map((d) => d.connectionId)).toContain(c.id)
      const after = await nextCheck(c.id)
      expect(after.updated_at.getTime()).toBe(before.updated_at.getTime())
      expect(after.next_check_at.getTime()).toBeGreaterThan(before.next_check_at.getTime())
    })

    it.each([
      [0, 300],
      [101, 300],
      [1.5, 300],
      [Number.NaN, 300],
      [10, 59],
      [10, 86401],
      [10, 1.5],
    ])('rejects invalid arguments (limit=%s, interval=%s)', async (limit, interval) => {
      await expect(sched.claimDueConnections(limit, interval, 5)).rejects.toThrow(RangeError)
    })

    it('rejects out-of-range arguments at the database level too', async () => {
      await expect(
        sql.begin(async (tx) => {
          await tx`set local role switchyard_scheduler`
          await tx`select * from switchyard.claim_due_connections(0, 300, 5)`
        }),
      ).rejects.toThrow(/p_limit/)
      await expect(
        sql.begin(async (tx) => {
          await tx`set local role switchyard_scheduler`
          await tx`select * from switchyard.claim_due_connections(10, 5, 5)`
        }),
      ).rejects.toThrow(/p_interval_seconds/)
      await expect(
        sql.begin(async (tx) => {
          await tx`set local role switchyard_scheduler`
          await tx`select * from switchyard.claim_due_connections(10, 300, 0)`
        }),
      ).rejects.toThrow(/p_per_user/)
    })

    it('resets next_check_at when credentials are patched', async () => {
      const c = await connection()
      await sql`update switchyard.connections set next_check_at = now() + interval '1 day' where id = ${c.id}`
      const sealed = splitCredentials(
        box,
        integration,
        { account: 'new', apiKey: 'sk_y_5678' },
        c.id,
        c.user,
      )
      await store.updateConnection(c.user, c.projectId, c.id, { credentials: sealed })
      const { next_check_at } = await nextCheck(c.id)
      expect(next_check_at.getTime()).toBeLessThanOrEqual(Date.now() + 2000)
    })

    it('keeps next_check_at when only the label is patched', async () => {
      const c = await connection()
      await sql`update switchyard.connections set next_check_at = now() + interval '1 day' where id = ${c.id}`
      await store.updateConnection(c.user, c.projectId, c.id, { label: 'renamed' })
      const { next_check_at } = await nextCheck(c.id)
      expect(next_check_at.getTime()).toBeGreaterThan(Date.now() + 80_000_000)
    })

    it('still bumps updated_at on a user-visible change', async () => {
      const c = await connection()
      await sql`update switchyard.connections set updated_at = '2020-01-01T00:00:00Z' where id = ${c.id}`
      await store.updateConnection(c.user, c.projectId, c.id, { label: 'renamed' })
      expect((await nextCheck(c.id)).updated_at.getFullYear()).toBeGreaterThan(2020)
    })
  })

  describe('check results', () => {
    it('stores results and returns the latest one per connection and check', async () => {
      const c = await connection()
      expect(
        await store.insertCheckResults(c.user, c.projectId, c.id, [
          result('a', { status: 'error', checkedAt: '2026-05-05T10:00:00.000Z' }),
          result('b', { checkedAt: '2026-05-05T10:00:00.000Z' }),
        ]),
      ).toBe(true)
      await store.insertCheckResults(c.user, c.projectId, c.id, [
        result('a', {
          status: 'warning',
          details: { n: 1 },
          checkedAt: '2026-05-05T11:00:00.000Z',
        }),
      ])
      const latest = await store.latestCheckResults(c.user, c.projectId)
      expect(latest).toEqual([
        {
          connectionId: c.id,
          checkId: 'a',
          status: 'warning',
          message: 'm a',
          details: { n: 1 },
          checkedAt: '2026-05-05T11:00:00.000Z',
        },
        {
          connectionId: c.id,
          checkId: 'b',
          status: 'ok',
          message: 'm b',
          details: null,
          checkedAt: '2026-05-05T10:00:00.000Z',
        },
      ])
    })

    it('does not let a late-inserted older result win', async () => {
      const c = await connection()
      await store.insertCheckResults(c.user, c.projectId, c.id, [
        result('a', { status: 'ok', checkedAt: '2026-05-05T12:00:00.000Z' }),
      ])
      await store.insertCheckResults(c.user, c.projectId, c.id, [
        result('a', { status: 'error', checkedAt: '2026-05-05T09:00:00.000Z' }),
      ])
      const latest = await store.latestCheckResults(c.user, c.projectId)
      expect(latest!.map((r) => r.status)).toEqual(['ok'])
    })

    it('accepts an empty batch on an existing connection', async () => {
      const c = await connection()
      expect(await store.insertCheckResults(c.user, c.projectId, c.id, [])).toBe(true)
      expect(await store.latestCheckResults(c.user, c.projectId)).toEqual([])
    })

    it('isolates users: no read, no insert on another user connection', async () => {
      const mine = await connection(A)
      await store.insertCheckResults(A, mine.projectId, mine.id, [result('a')])
      expect(await store.latestCheckResults(B, mine.projectId)).toBeNull()
      expect(await store.insertCheckResults(B, mine.projectId, mine.id, [result('x')])).toBe(false)
      expect((await store.latestCheckResults(A, mine.projectId))!.map((r) => r.checkId)).toEqual([
        'a',
      ])
    })

    it('returns false when inserting on a deleted connection', async () => {
      const c = await connection()
      expect(await store.deleteConnection(c.user, c.projectId, c.id)).toBe(true)
      expect(await store.insertCheckResults(c.user, c.projectId, c.id, [result('a')])).toBe(false)
    })

    it('removes results with their connection (cascade)', async () => {
      const c = await connection()
      await store.insertCheckResults(c.user, c.projectId, c.id, [result('a')])
      await store.deleteConnection(c.user, c.projectId, c.id)
      const rows = await sql`select 1 from switchyard.check_results where connection_id = ${c.id}`
      expect(rows).toHaveLength(0)
    })

    it('getConnectionForRun returns the sealed secrets only for the owner', async () => {
      const c = await connection()
      const run = await store.getConnectionForRun(c.user, c.projectId, c.id)
      expect(run).toMatchObject({
        id: c.id,
        projectId: c.projectId,
        integrationId: 'stripe',
        config: { account: 'acme' },
      })
      expect(run!.secrets).toEqual(expect.any(String))
      expect(await store.getConnectionForRun(B, c.projectId, c.id)).toBeNull()
      expect(await store.getConnectionForRun(c.user, randomUUID(), c.id)).toBeNull()
    })
  })

  describe('sanitized results reach the database', () => {
    it('stores NUL / lone surrogates after sanitizing (batched insert)', async () => {
      const c = await connection()
      const bad = 'a\u0000b\ud800c\udc00'
      const check = { id: 'dirty', title: 'Dirty', run: async () => ({}) as never }
      const sanitized = ['dirty', 'dirty2'].map((id) =>
        sanitizeResult(
          { status: 'ok', message: bad, details: { [bad]: bad, list: [bad, 1] } },
          { ...check, id },
          [],
          new Date(),
        ),
      )
      expect(await store.insertCheckResults(c.user, c.projectId, c.id, sanitized)).toBe(true)
      const latest = await store.latestCheckResults(c.user, c.projectId)
      expect(latest!.map((r) => r.message)).toEqual(['ab\ufffdc\ufffd', 'ab\ufffdc\ufffd'])
    })

    it('keeps the worst-case sanitized details under the database size check', async () => {
      const c = await connection()
      const check = { id: 'big', title: 'Big', run: async () => ({}) as never }
      const shapes: Record<string, unknown>[] = [
        { l: Array.from({ length: 400 }, () => 0) },
        { l: Array.from({ length: 200 }, () => 1.5), s: 'y'.repeat(4000) },
        { l: Array.from({ length: 150 }, () => ({ a: 0 })) },
        Object.fromEntries(Array.from({ length: 240 }, (_, i) => [`k${i}`, i])),
        { s: 'z'.repeat(8000) },
        { l: Array.from({ length: 480 }, () => '') },
      ]
      const sanitized = shapes.map((details, i) =>
        sanitizeResult(
          { status: 'ok', message: 'm', details },
          { ...check, id: `big${i}` },
          [],
          new Date(),
        ),
      )
      expect(await store.insertCheckResults(c.user, c.projectId, c.id, sanitized)).toBe(true)
    })

    it('rejects oversized details at the database level', async () => {
      const c = await connection()
      await expect(
        sql`insert into switchyard.check_results
              (user_id, project_id, connection_id, check_id, status, message, details, checked_at)
            values (${c.user}, ${c.projectId}, ${c.id}, 'x', 'ok', 'm',
                    ${sql.json({ l: Array.from({ length: 4000 }, () => 0) })}, now())`,
      ).rejects.toThrow(/check_results_details_size/)
    })
  })

  describe('pruneCheckResults', () => {
    it('deletes only results older than the retention', async () => {
      const c = await connection()
      const insertAt = (checkId: string, days: number) =>
        sql`insert into switchyard.check_results
              (user_id, project_id, connection_id, check_id, status, message, checked_at)
            values (${c.user}, ${c.projectId}, ${c.id}, ${checkId}, 'ok', 'm',
                    now() - make_interval(days => ${days}))`
      await insertAt('old1', 45)
      await insertAt('old2', 31)
      await insertAt('fresh1', 29)
      await insertAt('fresh2', 1)
      const deleted = await sched.pruneCheckResults(30)
      expect(deleted).toBeGreaterThanOrEqual(2)
      const left = await sql<{ check_id: string }[]>`
        select check_id from switchyard.check_results where connection_id = ${c.id} order by check_id`
      expect(left.map((r) => r.check_id)).toEqual(['fresh1', 'fresh2'])
    })

    it.each([0, 3651, 1.5, Number.NaN])('rejects invalid retention %s', async (days) => {
      await expect(sched.pruneCheckResults(days)).rejects.toThrow(RangeError)
    })
  })

  describe('privileges', () => {
    const canExecute = async (role: string, fn: string) => {
      const [r] = await sql<
        { ok: boolean }[]
      >`select has_function_privilege(${role}, ${fn}, 'execute') as ok`
      return r!.ok
    }
    const claimFn = 'switchyard.claim_due_connections(integer, integer, integer)'
    const pruneFn = 'switchyard.prune_check_results(integer)'

    it('lets only switchyard_scheduler execute the cross-user functions', async () => {
      for (const fn of [claimFn, pruneFn]) {
        expect(await canExecute('switchyard_scheduler', fn)).toBe(true)
        for (const role of ['switchyard_api', 'anon', 'authenticated'])
          expect(await canExecute(role, fn)).toBe(false)
      }
    })

    it('rejects switchyard_api calling the cross-user functions', async () => {
      await expect(
        sql.begin(async (tx) => {
          await tx`set local role switchyard_api`
          await tx`select * from switchyard.claim_due_connections(1, 300, 1)`
        }),
      ).rejects.toThrow(/permission denied/)
      await expect(
        sql.begin(async (tx) => {
          await tx`set local role switchyard_api`
          await tx`select switchyard.prune_check_results(30)`
        }),
      ).rejects.toThrow(/permission denied/)
    })

    it('gives switchyard_scheduler no table privileges', async () => {
      await expect(
        sql.begin(async (tx) => {
          await tx`set local role switchyard_scheduler`
          await tx`select 1 from switchyard.connections limit 1`
        }),
      ).rejects.toThrow(/permission denied/)
    })

    it('does not let switchyard_api read other users rows directly', async () => {
      const c = await connection(A)
      const rows = await sql.begin(async (tx) => {
        await tx`set local role switchyard_api`
        return tx`select id from switchyard.connections where id = ${c.id}`
      })
      expect(rows).toHaveLength(0)
    })
  })
})
