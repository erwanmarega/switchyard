import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openConnectionSecrets } from '../src/connections/credentials.js'
import { USER_ID, makeSigner, type Signer } from './helpers.js'
import { bearer, routesApp, uid } from './support/routes.js'

const OTHER_ID = uid()
const SECRET = 'tok_SUPER_SECRET_value_123'
let signer: Signer
let ctx: ReturnType<typeof routesApp>
let app: FastifyInstance
let a: { authorization: string }
let b: { authorization: string }

beforeAll(async () => {
  signer = await makeSigner()
  ctx = routesApp(signer)
  app = ctx.app
  a = await bearer(signer, USER_ID)
  b = await bearer(signer, OTHER_ID)
})
afterAll(() => app.close())

const newProject = async (headers = a) =>
  (
    await app.inject({ method: 'POST', url: '/api/projects', headers, payload: { name: 'P' } })
  ).json().project.id as string

const connect = (projectId: string, payload: object, headers = a) =>
  app.inject({ method: 'POST', url: `/api/projects/${projectId}/connections`, headers, payload })

const validBody = (extra: Record<string, unknown> = {}) => ({
  integrationId: 'fake',
  label: 'Prod',
  credentials: { token: SECRET, teamId: 'team_1' },
  ...extra,
})

describe('connections: authentication', () => {
  const p = uid()
  const c = uid()
  it.each([
    ['GET', `/api/projects/${p}/connections`],
    ['POST', `/api/projects/${p}/connections`],
    ['GET', `/api/projects/${p}/connections/${c}`],
    ['PATCH', `/api/projects/${p}/connections/${c}`],
    ['DELETE', `/api/projects/${p}/connections/${c}`],
  ])('%s %s returns 401 without a token', async (method, url) => {
    const res = await app.inject({ method: method as 'GET', url, payload: { label: 'x' } })
    expect(res.statusCode).toBe(401)
  })
})

describe('connections: create', () => {
  it('splits config from secrets and never returns the secret', async () => {
    const pid = await newProject()
    const res = await connect(pid, validBody())
    expect(res.statusCode).toBe(201)
    const { connection } = res.json()
    expect(connection).toMatchObject({
      projectId: pid,
      integrationId: 'fake',
      label: 'Prod',
      config: { teamId: 'team_1' },
      secretFields: ['token'],
    })
    expect(connection.config).not.toHaveProperty('token')
    expect(res.body).not.toContain(SECRET)
    expect(res.headers['cache-control']).toBe('private, no-store')

    const raw = ctx.store.rawSecrets(connection.id)
    expect(raw).toMatch(/^v1\./)
    expect(raw).not.toContain(SECRET)
    expect(raw).not.toContain(Buffer.from(SECRET).toString('base64url'))
  })

  it('never returns the secret on get and list either', async () => {
    const pid = await newProject()
    const { connection } = (await connect(pid, validBody())).json()
    const got = await app.inject({
      method: 'GET',
      url: `/api/projects/${pid}/connections/${connection.id}`,
      headers: a,
    })
    const list = await app.inject({
      method: 'GET',
      url: `/api/projects/${pid}/connections`,
      headers: a,
    })
    expect(got.statusCode).toBe(200)
    expect(got.body).not.toContain(SECRET)
    expect(list.json().connections).toHaveLength(1)
    expect(list.body).not.toContain(SECRET)
    expect(list.body).not.toContain('v1.')
  })

  it('seals secrets bound to the user and connection id (AAD)', async () => {
    const pid = await newProject()
    const { connection } = (await connect(pid, validBody())).json()
    const raw = ctx.store.rawSecrets(connection.id)!
    expect(openConnectionSecrets(ctx.box, raw, connection.id, USER_ID)).toEqual({ token: SECRET })
    expect(() => openConnectionSecrets(ctx.box, raw, connection.id, OTHER_ID)).toThrow()
    expect(() => openConnectionSecrets(ctx.box, raw, uid(), USER_ID)).toThrow()
  })

  it('rejects an unknown integration with 400', async () => {
    const res = await connect(await newProject(), validBody({ integrationId: 'nope' }))
    expect(res.statusCode).toBe(400)
  })

  it('rejects a missing credential key without echoing values', async () => {
    const res = await connect(await newProject(), validBody({ credentials: { token: SECRET } }))
    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('teamId')
    expect(res.body).not.toContain(SECRET)
  })

  it('rejects an extra credential key without echoing values', async () => {
    const res = await connect(
      await newProject(),
      validBody({ credentials: { token: SECRET, teamId: 't', extra: 'EXTRA-VALUE' } }),
    )
    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('extra')
    expect(res.body).not.toContain('EXTRA-VALUE')
    expect(res.body).not.toContain(SECRET)
  })

  it.each([
    ['empty label', { label: '  ' }],
    ['too long label', { label: 'l'.repeat(101) }],
    ['empty credential value', { credentials: { token: '', teamId: 't' } }],
    ['unknown body key', { unexpected: 1 }],
    ['non-object credentials', { credentials: 'x' }],
  ])('rejects %s with 400 and no secret in the body', async (_n, extra) => {
    const res = await connect(await newProject(), validBody(extra))
    expect(res.statusCode).toBe(400)
    expect(res.body).not.toContain(SECRET)
  })

  it('rejects oversized credentials with 400 instead of overflowing the secrets column', async () => {
    // Each value fits the per-field limit, but 4-byte characters blow the total size cap.
    const big = '😀'.repeat(2048)
    const res = await connect(
      await newProject(),
      validBody({ credentials: { token: big, teamId: big } }),
    )
    expect(res.statusCode).toBe(400)
    expect(res.body).not.toContain(big)
  })

  it('seals the largest accepted credentials within the secrets column limit', async () => {
    const pid = await newProject()
    const res = await connect(
      pid,
      validBody({ credentials: { token: 'x'.repeat(4096), teamId: 't' } }),
    )
    expect(res.statusCode).toBe(201)
    expect(ctx.store.rawSecrets(res.json().connection.id)!.length).toBeLessThanOrEqual(16384)
  })

  it('returns 404 for a project of another user', async () => {
    const pid = await newProject(b)
    const res = await connect(pid, validBody())
    expect(res.statusCode).toBe(404)
  })

  it('returns 404 for a malformed project id', async () => {
    expect((await connect('nope', validBody())).statusCode).toBe(404)
  })

  it('returns 409 past 50 connections per project', async () => {
    const pid = await newProject()
    for (let i = 0; i < 50; i++) {
      expect((await connect(pid, validBody({ label: `c${i}` }))).statusCode).toBe(201)
    }
    const res = await connect(pid, validBody())
    expect(res.statusCode).toBe(409)
    expect(res.body).not.toContain(SECRET)
  })

  it('rejects a foreign Origin on POST with 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${await newProject()}/connections`,
      headers: { ...a, origin: 'https://evil.example' },
      payload: validBody(),
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('connections: update and delete', () => {
  it('patches the label only and keeps the sealed secret', async () => {
    const pid = await newProject()
    const { connection } = (await connect(pid, validBody())).json()
    const before = ctx.store.rawSecrets(connection.id)
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${pid}/connections/${connection.id}`,
      headers: a,
      payload: { label: ' Renamed ' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().connection).toMatchObject({ label: 'Renamed', config: { teamId: 'team_1' } })
    expect(ctx.store.rawSecrets(connection.id)).toBe(before)
  })

  it('re-seals when credentials are patched', async () => {
    const pid = await newProject()
    const { connection } = (await connect(pid, validBody())).json()
    const before = ctx.store.rawSecrets(connection.id)
    const NEW = 'tok_NEW_SECRET_456'
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${pid}/connections/${connection.id}`,
      headers: a,
      payload: { credentials: { token: NEW, teamId: 'team_2' } },
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain(NEW)
    expect(res.json().connection.config).toEqual({ teamId: 'team_2' })
    const after = ctx.store.rawSecrets(connection.id)!
    expect(after).not.toBe(before)
    expect(after).not.toContain(NEW)
    expect(openConnectionSecrets(ctx.box, after, connection.id, USER_ID)).toEqual({ token: NEW })
  })

  it('rejects an invalid credentials patch without values and keeps the old secret', async () => {
    const pid = await newProject()
    const { connection } = (await connect(pid, validBody())).json()
    const before = ctx.store.rawSecrets(connection.id)
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${pid}/connections/${connection.id}`,
      headers: a,
      payload: { credentials: { token: 'NEW-LEAK' } },
    })
    expect(res.statusCode).toBe(400)
    expect(res.body).not.toContain('NEW-LEAK')
    expect(ctx.store.rawSecrets(connection.id)).toBe(before)
  })

  it('rejects an empty patch with 400', async () => {
    const pid = await newProject()
    const { connection } = (await connect(pid, validBody())).json()
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${pid}/connections/${connection.id}`,
      headers: a,
      payload: {},
    })
    expect(res.statusCode).toBe(400)
  })

  it("returns 404 on get/patch/delete of another user's connection and leaves it intact", async () => {
    const pid = await newProject()
    const { connection } = (await connect(pid, validBody())).json()
    const url = `/api/projects/${pid}/connections/${connection.id}`
    const bodies = new Set<string>()
    for (const [method, payload] of [
      ['GET', undefined],
      ['PATCH', { label: 'hijack' }],
      ['PATCH', { credentials: { token: 'x', teamId: 'y' } }],
      ['DELETE', undefined],
    ] as const) {
      const res = await app.inject({ method, url, headers: b, payload })
      expect(res.statusCode).toBe(404)
      bodies.add(res.body)
    }
    expect(bodies.size).toBe(1)
    const still = await app.inject({ method: 'GET', url, headers: a })
    expect(still.json().connection.label).toBe('Prod')
  })

  it('returns 404 when the connection is addressed under another project', async () => {
    const pid = await newProject()
    const other = await newProject()
    const { connection } = (await connect(pid, validBody())).json()
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${other}/connections/${connection.id}`,
      headers: a,
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 404 for unknown and malformed connection ids', async () => {
    const pid = await newProject()
    for (const id of [uid(), 'nope']) {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/projects/${pid}/connections/${id}`,
        headers: a,
      })
      expect(res.statusCode).toBe(404)
    }
  })

  it('deletes a connection with 204', async () => {
    const pid = await newProject()
    const { connection } = (await connect(pid, validBody())).json()
    const url = `/api/projects/${pid}/connections/${connection.id}`
    expect((await app.inject({ method: 'DELETE', url, headers: a })).statusCode).toBe(204)
    expect((await app.inject({ method: 'GET', url, headers: a })).statusCode).toBe(404)
  })

  it('cascades connection deletion when the project is deleted', async () => {
    const pid = await newProject()
    const { connection } = (await connect(pid, validBody())).json()
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/projects/${pid}`, headers: a })).statusCode,
    ).toBe(204)
    expect(ctx.store.rawSecrets(connection.id)).toBeNull()
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/projects/${pid}/connections/${connection.id}`,
          headers: a,
        })
      ).statusCode,
    ).toBe(404)
  })

  it('lists connections of a project, 404 for a foreign project', async () => {
    const pid = await newProject()
    await connect(pid, validBody())
    expect(
      (
        await app.inject({ method: 'GET', url: `/api/projects/${pid}/connections`, headers: a })
      ).json().connections,
    ).toHaveLength(1)
    expect(
      (await app.inject({ method: 'GET', url: `/api/projects/${pid}/connections`, headers: b }))
        .statusCode,
    ).toBe(404)
  })
})

describe('GET /api/integrations', () => {
  it('includes credentialsSchema with secret flags', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/integrations', headers: a })
    expect(res.statusCode).toBe(200)
    const fake = res.json().integrations.find((i: { id: string }) => i.id === 'fake')
    expect(fake.credentialsSchema).toEqual([
      { key: 'token', label: 'Token', secret: true },
      { key: 'teamId', label: 'Team', secret: false },
    ])
  })
})
