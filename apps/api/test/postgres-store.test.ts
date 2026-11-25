// Opt-in integration tests against a real Postgres (RLS, cascades, atomicity).
// Skipped unless SWITCHYARD_TEST_DATABASE_URL is set, e.g. for the local Supabase stack:
//   SWITCHYARD_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test
// The database must have the core migration applied. Test users are created in auth.users with
// random ids and removed in afterAll (cascades to all their rows).
import { randomUUID } from 'node:crypto'
import postgres, { type Sql } from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openConnectionSecrets, splitCredentials } from '../src/connections/credentials.js'
import { createSecretBox } from '../src/crypto/secrets.js'
import { createPostgresStore } from '../src/store/postgres.js'
import {
  LIMITS,
  LimitError,
  ValidationError,
  type NewConnection,
  type Store,
} from '../src/store/types.js'
import { testConfig } from './helpers.js'

const url = process.env.SWITCHYARD_TEST_DATABASE_URL
const SECRET = 'sk_live_PG_SECRET_789'

describe.skipIf(!url)('postgres store', () => {
  let sql: Sql
  let store: Store
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
    store = createPostgresStore(sql)
    try {
      for (const [id, n] of [
        [A, 'a'],
        [B, 'b'],
      ] as const) {
        await sql`insert into auth.users (id, email) values (${id}, ${`pgtest-${n}-${id}@example.test`})`
      }
    } catch (err) {
      await sql`delete from auth.users where id in (${A}, ${B})`.catch(() => undefined)
      await sql.end({ timeout: 5 })
      throw err
    }
  })

  afterAll(async () => {
    if (!sql) return
    try {
      await sql`delete from auth.users where id in (${A}, ${B})`
    } finally {
      await sql.end({ timeout: 5 })
    }
  })

  const project = (user = A, name = 'P') => store.createProject(user, name)

  async function connection(projectId: string, user = A, integrationId = 'stripe') {
    const id = randomUUID()
    const sealed = splitCredentials(box, integration, { account: 'acme', apiKey: SECRET }, id, user)
    const input: NewConnection = { id, integrationId, label: 'Prod', ...sealed }
    const c = await store.createConnection(user, projectId, input)
    return c!
  }

  const node = (over: Partial<{ connectionId: string | null; integrationId: string }> = {}) => ({
    id: randomUUID(),
    integrationId: 'stripe',
    label: 'N',
    connectionId: null as string | null,
    ...over,
  })

  describe('isolation', () => {
    it('hides every resource of A from B', async () => {
      const p = await project(A, 'private')
      const c = await connection(p.id)
      const n = node({ connectionId: c.id })
      expect(await store.replacePath(A, p.id, { nodes: [n], edges: [] })).toBe(true)

      expect(await store.getProject(B, p.id)).toBeNull()
      expect(await store.updateProject(B, p.id, 'hacked')).toBeNull()
      expect(await store.deleteProject(B, p.id)).toBe(false)
      expect(await store.listConnections(B, p.id)).toBeNull()
      expect(await store.getConnection(B, p.id, c.id)).toBeNull()
      expect(await store.updateConnection(B, p.id, c.id, { label: 'x' })).toBeNull()
      expect(await store.deleteConnection(B, p.id, c.id)).toBe(false)
      expect(await store.getConnectionSecrets(B, p.id, c.id)).toBeNull()
      expect(await store.getPath(B, p.id)).toBeNull()
      expect(await store.replacePath(B, p.id, { nodes: [], edges: [] })).toBe(false)
      expect(
        await store.createConnection(B, p.id, {
          id: randomUUID(),
          integrationId: 'demo',
          label: 'x',
          config: {},
          secrets: null,
        }),
      ).toBeNull()

      expect((await store.getProject(A, p.id))?.name).toBe('private')
      expect((await store.getConnection(A, p.id, c.id))?.label).toBe('Prod')
      expect((await store.getPath(A, p.id))?.nodes).toHaveLength(1)
    })

    it('lists only own projects', async () => {
      const pa = await project(A, 'list-a')
      const pb = await project(B, 'list-b')
      const idsA = (await store.listProjects(A)).map((p) => p.id)
      const idsB = (await store.listProjects(B)).map((p) => p.id)
      expect(idsA).toContain(pa.id)
      expect(idsA).not.toContain(pb.id)
      expect(idsB).toContain(pb.id)
      expect(idsB).not.toContain(pa.id)
    })

    it('does not accept a connection id belonging to another user in a path', async () => {
      const pa = await project(A)
      const ca = await connection(pa.id)
      const pb = await project(B)
      await expect(
        store.replacePath(B, pb.id, { nodes: [node({ connectionId: ca.id })], edges: [] }),
      ).rejects.toBeInstanceOf(ValidationError)
    })
  })

  describe('row level security', () => {
    const countFor = (setUser: string | null) =>
      sql.begin(async (tx) => {
        await tx`set local role switchyard_api`
        if (setUser !== null) await tx`select set_config('switchyard.user_id', ${setUser}, true)`
        const [r] = await tx<{ n: number }[]>`
          select count(*)::int as n from switchyard.projects where user_id = ${A}`
        return r!.n
      })

    it('shows nothing of A to the role when the user setting is B', async () => {
      await project(A, 'rls')
      expect(await countFor(B)).toBe(0)
    })

    it('shows nothing when no user is set', async () => {
      await project(A, 'rls2')
      expect(await countFor(null)).toBe(0)
    })

    it('shows A rows when the user setting is A (control)', async () => {
      await project(A, 'rls3')
      expect(await countFor(A)).toBeGreaterThan(0)
    })

    it('blocks inserting a row for another user through the role', async () => {
      const attempt = sql.begin(async (tx) => {
        await tx`set local role switchyard_api`
        await tx`select set_config('switchyard.user_id', ${B}, true)`
        await tx`insert into switchyard.projects (user_id, name) values (${A}, 'forged')`
      })
      await expect(attempt).rejects.toThrow()
    })

    it('does not let the user setting leak between transactions', async () => {
      await project(A, 'leak')
      await countFor(A)
      expect(await countFor(null)).toBe(0)
    })
  })

  describe('connections', () => {
    it('stores secrets as ciphertext only, and they decrypt for the owner only', async () => {
      const p = await project()
      const c = await connection(p.id)
      expect(c).toMatchObject({ hasSecrets: true, config: { account: 'acme' } })
      expect(JSON.stringify(c)).not.toContain(SECRET)

      const [raw] = await sql<{ secrets: string; config: unknown }[]>`
        select secrets, config from switchyard.connections where id = ${c.id}`
      expect(raw!.secrets).toMatch(/^v1\./)
      expect(raw!.secrets).not.toContain(SECRET)
      expect(JSON.stringify(raw!.config)).not.toContain(SECRET)

      const sealed = (await store.getConnectionSecrets(A, p.id, c.id))!
      expect(openConnectionSecrets(box, sealed, c.id, A)).toEqual({ apiKey: SECRET })
      expect(() => openConnectionSecrets(box, sealed, c.id, B)).toThrow()
    })

    it('stores null secrets for an integration without secret fields', async () => {
      const p = await project()
      const c = await store.createConnection(A, p.id, {
        id: randomUUID(),
        integrationId: 'demo',
        label: 'No secret',
        config: {},
        secrets: null,
      })
      expect(c?.hasSecrets).toBe(false)
      expect(await store.getConnectionSecrets(A, p.id, c!.id)).toBeNull()
    })

    it('updates the label and replaces credentials as a whole', async () => {
      const p = await project()
      const c = await connection(p.id)
      const before = await store.getConnectionSecrets(A, p.id, c.id)
      const sealed = splitCredentials(box, integration, { account: 'new', apiKey: 'k2' }, c.id, A)
      const updated = await store.updateConnection(A, p.id, c.id, {
        label: 'Renamed',
        credentials: sealed,
      })
      expect(updated).toMatchObject({ label: 'Renamed', config: { account: 'new' } })
      expect(await store.getConnectionSecrets(A, p.id, c.id)).not.toBe(before)
    })

    it('detaches path nodes when their connection is deleted', async () => {
      const p = await project()
      const c = await connection(p.id)
      const n = node({ connectionId: c.id })
      await store.replacePath(A, p.id, { nodes: [n], edges: [] })
      expect(await store.deleteConnection(A, p.id, c.id)).toBe(true)
      const path = await store.getPath(A, p.id)
      expect(path?.nodes).toEqual([{ ...n, connectionId: null }])
    })

    it('enforces the per-project connection limit', async () => {
      const p = await project()
      for (let i = 0; i < LIMITS.connectionsPerProject; i++) {
        await store.createConnection(A, p.id, {
          id: randomUUID(),
          integrationId: 'demo',
          label: `c${i}`,
          config: {},
          secrets: null,
        })
      }
      await expect(
        store.createConnection(A, p.id, {
          id: randomUUID(),
          integrationId: 'demo',
          label: 'over',
          config: {},
          secrets: null,
        }),
      ).rejects.toBeInstanceOf(LimitError)
    })
  })

  describe('projects', () => {
    it('cascades project deletion to connections, nodes and edges', async () => {
      const p = await project()
      const c = await connection(p.id)
      const n1 = node({ connectionId: c.id })
      const n2 = node()
      await store.replacePath(A, p.id, {
        nodes: [n1, n2],
        edges: [{ id: randomUUID(), from: n1.id, to: n2.id }],
      })
      expect(await store.deleteProject(A, p.id)).toBe(true)
      const left = await sql<{ t: string; n: number }[]>`
        select 'c' as t, count(*)::int as n from switchyard.connections where project_id = ${p.id}
        union all select 'n', count(*)::int from switchyard.path_nodes where project_id = ${p.id}
        union all select 'e', count(*)::int from switchyard.path_edges where project_id = ${p.id}`
      expect(left.map((r) => r.n)).toEqual([0, 0, 0])
      expect(await store.getProject(A, p.id)).toBeNull()
    })

    it('enforces the per-user project limit and keeps other users unaffected', async () => {
      const user = randomUUID()
      await sql`insert into auth.users (id, email) values (${user}, ${`pgtest-limit-${user}@example.test`})`
      try {
        for (let i = 0; i < LIMITS.projectsPerUser; i++) await store.createProject(user, `p${i}`)
        await expect(store.createProject(user, 'over')).rejects.toBeInstanceOf(LimitError)
        expect((await store.listProjects(user)).length).toBe(LIMITS.projectsPerUser)
        await expect(store.createProject(B, 'fine')).resolves.toMatchObject({ name: 'fine' })
      } finally {
        await sql`delete from auth.users where id = ${user}`
      }
    })

    it('updates the name and returns ISO timestamps', async () => {
      const p = await project(A, 'old')
      const u = await store.updateProject(A, p.id, 'new')
      expect(u?.name).toBe('new')
      expect(new Date(u!.updatedAt).toISOString()).toBe(u!.updatedAt)
    })
  })

  describe('path', () => {
    it('round-trips nodes and edges, with and without edge label', async () => {
      const p = await project()
      const n1 = node()
      const n2 = node()
      const n3 = node()
      const e1 = { id: randomUUID(), from: n1.id, to: n2.id, label: 'flow' }
      const e2 = { id: randomUUID(), from: n2.id, to: n3.id }
      await store.replacePath(A, p.id, { nodes: [n1, n2, n3], edges: [e1, e2] })
      const path = (await store.getPath(A, p.id))!
      expect(path.nodes.map((n) => n.id).sort()).toEqual([n1.id, n2.id, n3.id].sort())
      expect(path.edges.find((e) => e.id === e1.id)).toEqual(e1)
      expect(path.edges.find((e) => e.id === e2.id)).toEqual(e2)
    })

    it('keeps the previous path intact when a replace fails validation', async () => {
      const p = await project()
      const c = await connection(p.id, A, 'stripe')
      const keep = node({ connectionId: c.id })
      await store.replacePath(A, p.id, { nodes: [keep], edges: [] })

      const mismatched = node({ integrationId: 'other', connectionId: c.id })
      await expect(
        store.replacePath(A, p.id, { nodes: [node(), mismatched], edges: [] }),
      ).rejects.toBeInstanceOf(ValidationError)
      expect((await store.getPath(A, p.id))?.nodes).toEqual([keep])
    })

    it('keeps the previous path intact when the insert itself fails mid-way', async () => {
      const p = await project()
      const keep = node()
      await store.replacePath(A, p.id, { nodes: [keep], edges: [] })
      const dup = node()
      // Duplicate node ids violate the primary key after the old rows were deleted.
      await expect(
        store.replacePath(A, p.id, { nodes: [dup, { ...dup }], edges: [] }),
      ).rejects.toThrow()
      expect((await store.getPath(A, p.id))?.nodes).toEqual([keep])
    })

    it('replaces the whole path, removing old nodes and edges', async () => {
      const p = await project()
      const n1 = node()
      const n2 = node()
      await store.replacePath(A, p.id, {
        nodes: [n1, n2],
        edges: [{ id: randomUUID(), from: n1.id, to: n2.id }],
      })
      const fresh = node()
      await store.replacePath(A, p.id, { nodes: [fresh], edges: [] })
      expect(await store.getPath(A, p.id)).toEqual({ nodes: [fresh], edges: [] })
    })
  })
})
