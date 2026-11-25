import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { USER_ID, makeSigner, type Signer } from './helpers.js'
import { bearer, routesApp, uid } from './support/routes.js'

const OTHER_ID = uid()
let signer: Signer
let app: FastifyInstance
let a: { authorization: string }
let b: { authorization: string }

beforeAll(async () => {
  signer = await makeSigner()
  app = routesApp(signer).app
  a = await bearer(signer, USER_ID)
  b = await bearer(signer, OTHER_ID)
})
afterAll(() => app.close())

const newProject = async (headers = a) =>
  (
    await app.inject({ method: 'POST', url: '/api/projects', headers, payload: { name: 'P' } })
  ).json().project.id as string

const newConnection = async (pid: string, integrationId = 'fake', headers = a) => {
  const credentials = integrationId === 'fake' ? { token: 't', teamId: 'x' } : { apiKey: 'k' }
  const res = await app.inject({
    method: 'POST',
    url: `/api/projects/${pid}/connections`,
    headers,
    payload: { integrationId, label: 'c', credentials },
  })
  return res.json().connection.id as string
}

const put = (pid: string, payload: object, headers = a): Promise<LightMyRequestResponse> =>
  app.inject({ method: 'PUT', url: `/api/projects/${pid}/path`, headers, payload })
const get = (pid: string, headers = a): Promise<LightMyRequestResponse> =>
  app.inject({ method: 'GET', url: `/api/projects/${pid}/path`, headers })

const node = (over: Record<string, unknown> = {}) => ({
  id: uid(),
  integrationId: 'fake',
  label: 'Node',
  ...over,
})

describe('path: authentication and headers', () => {
  it.each(['GET', 'PUT'])('%s returns 401 without a token', async (method) => {
    const res = await app.inject({
      method: method as 'GET',
      url: `/api/projects/${uid()}/path`,
      payload: { nodes: [], edges: [] },
    })
    expect(res.statusCode).toBe(401)
  })

  it('sets cache-control private, no-store', async () => {
    const res = await get(await newProject())
    expect(res.headers['cache-control']).toBe('private, no-store')
  })

  it('rejects a foreign Origin on PUT with 403', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/projects/${await newProject()}/path`,
      headers: { ...a, origin: 'https://evil.example' },
      payload: { nodes: [], edges: [] },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('path: read and write', () => {
  it('returns an empty path for a new project', async () => {
    const res = await get(await newProject())
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ path: { nodes: [], edges: [] } })
  })

  it('stores a valid path and returns it on GET', async () => {
    const pid = await newProject()
    const cid = await newConnection(pid)
    const n1 = node({ connectionId: cid })
    const n2 = node({ integrationId: 'demo' })
    const e = { id: uid(), from: n1.id, to: n2.id, label: 'flow' }
    const res = await put(pid, { nodes: [n1, n2], edges: [e] })
    expect(res.statusCode).toBe(200)
    const path = (await get(pid)).json().path
    expect(path.nodes).toHaveLength(2)
    expect(path.nodes.find((n: { id: string }) => n.id === n1.id)).toMatchObject({
      integrationId: 'fake',
      connectionId: cid,
    })
    expect(path.nodes.find((n: { id: string }) => n.id === n2.id).connectionId).toBeNull()
    expect(path.edges).toEqual([e])
    expect(res.json().path).toEqual(path)
  })

  it('accepts an explicit null connectionId and an edge without label', async () => {
    const pid = await newProject()
    const n1 = node({ connectionId: null })
    const n2 = node()
    const e = { id: uid(), from: n1.id, to: n2.id }
    expect((await put(pid, { nodes: [n1, n2], edges: [e] })).statusCode).toBe(200)
    const path = (await get(pid)).json().path
    expect(path.edges[0]).not.toHaveProperty('label')
  })

  it('replaces the previous path entirely', async () => {
    const pid = await newProject()
    const old = node()
    await put(pid, { nodes: [old], edges: [] })
    const fresh = node()
    await put(pid, { nodes: [fresh], edges: [] })
    const ids = (await get(pid)).json().path.nodes.map((n: { id: string }) => n.id)
    expect(ids).toEqual([fresh.id])
    await put(pid, { nodes: [], edges: [] })
    expect((await get(pid)).json().path).toEqual({ nodes: [], edges: [] })
  })

  it('returns 404 on GET/PUT for another user, unknown and malformed project', async () => {
    const pid = await newProject()
    const foreign = [
      await get(pid, b),
      await put(pid, { nodes: [], edges: [] }, b),
      await get(uid()),
      await get('nope'),
      await put('nope', { nodes: [], edges: [] }),
    ]
    for (const res of foreign) expect(res.statusCode).toBe(404)
    expect(new Set(foreign.map((r) => r.body)).size).toBe(1)
  })

  it("does not let another user overwrite a project's path", async () => {
    const pid = await newProject()
    const n = node()
    await put(pid, { nodes: [n], edges: [] })
    await put(pid, { nodes: [], edges: [] }, b)
    expect((await get(pid)).json().path.nodes).toHaveLength(1)
  })
})

describe('path: validation', () => {
  const invalid = async (payload: object, pid?: string) => {
    const res = await put(pid ?? (await newProject()), payload)
    expect(res.statusCode).toBe(400)
    return res
  }

  it('rejects a dangling edge', async () => {
    const n = node()
    await invalid({ nodes: [n], edges: [{ id: uid(), from: n.id, to: uid() }] })
  })

  it('rejects duplicate node ids', async () => {
    const n = node()
    await invalid({ nodes: [n, { ...n, label: 'again' }], edges: [] })
  })

  it('rejects duplicate node ids that differ only by case', async () => {
    const n = node()
    await invalid({ nodes: [n, { ...n, id: n.id.toUpperCase() }], edges: [] })
  })

  it('rejects duplicate edge ids that differ only by case', async () => {
    const n1 = node()
    const n2 = node()
    const n3 = node()
    const id = uid()
    await invalid({
      nodes: [n1, n2, n3],
      edges: [
        { id, from: n1.id, to: n2.id },
        { id: id.toUpperCase(), from: n2.id, to: n3.id },
      ],
    })
  })

  it('treats uppercase uuids as the same node when resolving edges', async () => {
    const pid = await newProject()
    const n1 = node()
    const n2 = node()
    const res = await put(pid, {
      nodes: [n1, n2],
      edges: [{ id: uid(), from: n1.id.toUpperCase(), to: n2.id }],
    })
    expect(res.statusCode).toBe(200)
    expect((await get(pid)).json().path.edges[0].from).toBe(n1.id)
  })

  it('rejects a self-loop', async () => {
    const n = node()
    await invalid({ nodes: [n], edges: [{ id: uid(), from: n.id, to: n.id }] })
  })

  it('rejects a duplicate (from, to) edge', async () => {
    const n1 = node()
    const n2 = node()
    await invalid({
      nodes: [n1, n2],
      edges: [
        { id: uid(), from: n1.id, to: n2.id },
        { id: uid(), from: n1.id, to: n2.id },
      ],
    })
  })

  it('allows the reverse edge (to, from)', async () => {
    const pid = await newProject()
    const n1 = node()
    const n2 = node()
    const res = await put(pid, {
      nodes: [n1, n2],
      edges: [
        { id: uid(), from: n1.id, to: n2.id },
        { id: uid(), from: n2.id, to: n1.id },
      ],
    })
    expect(res.statusCode).toBe(200)
  })

  it.each(['Bad Id', 'UPPER', '-lead', '', 'a_b', 'x'.repeat(65)])(
    'rejects integrationId %j',
    async (integrationId) => {
      await invalid({ nodes: [node({ integrationId })], edges: [] })
    },
  )

  it.each([
    ['non-uuid node id', { nodes: [node({ id: 'n1' })], edges: [] }],
    ['unknown node key', { nodes: [node({ extra: 1 })], edges: [] }],
    ['empty label', { nodes: [node({ label: ' ' })], edges: [] }],
    ['missing edges', { nodes: [] }],
    ['unknown top-level key', { nodes: [], edges: [], extra: 1 }],
    ['array body', []],
  ])('rejects %s', async (_n, payload) => {
    await invalid(payload)
  })

  it('does not echo ids or values in validation errors', async () => {
    const n = node({ label: 'SECRET-LABEL' })
    const dangling = uid()
    const res = await invalid({ nodes: [n], edges: [{ id: uid(), from: n.id, to: dangling }] })
    expect(res.body).not.toContain(dangling)
    expect(res.body).not.toContain(n.id)
    const res2 = await invalid({ nodes: [node({ label: '' })], edges: [], extra: 'SECRET-VALUE' })
    expect(res2.body).not.toContain('SECRET-VALUE')
  })

  it('rejects a connectionId from another project of the same user', async () => {
    const pid = await newProject()
    const cid = await newConnection(await newProject())
    await invalid({ nodes: [node({ connectionId: cid })], edges: [] }, pid)
  })

  it('rejects a connectionId owned by another user', async () => {
    const cid = await newConnection(await newProject(b), 'fake', b)
    await invalid({ nodes: [node({ connectionId: cid })], edges: [] })
  })

  it('rejects an unknown connectionId', async () => {
    await invalid({ nodes: [node({ connectionId: uid() })], edges: [] })
  })

  it('rejects a connection whose integration differs from the node', async () => {
    const pid = await newProject()
    const cid = await newConnection(pid, 'other')
    await invalid({ nodes: [node({ integrationId: 'fake', connectionId: cid })], edges: [] }, pid)
  })

  it('keeps the previous path when a replace is rejected', async () => {
    const pid = await newProject()
    const keep = node()
    await put(pid, { nodes: [keep], edges: [] })
    await invalid({ nodes: [node({ connectionId: uid() })], edges: [] }, pid)
    expect((await get(pid)).json().path.nodes.map((n: { id: string }) => n.id)).toEqual([keep.id])
  })

  it('accepts exactly 200 nodes and rejects 201', async () => {
    const pid = await newProject()
    const nodes = Array.from({ length: 200 }, () => node())
    expect((await put(pid, { nodes, edges: [] })).statusCode).toBe(200)
    await invalid({ nodes: [...nodes, node()], edges: [] }, pid)
  })

  it('accepts exactly 500 edges and rejects 501', async () => {
    const pid = await newProject()
    const nodes = Array.from({ length: 40 }, () => node())
    const edges: { id: string; from: string; to: string }[] = []
    for (const from of nodes) {
      for (const to of nodes) {
        if (from !== to && edges.length < 501) edges.push({ id: uid(), from: from.id, to: to.id })
      }
    }
    expect((await put(pid, { nodes, edges: edges.slice(0, 500) })).statusCode).toBe(200)
    await invalid({ nodes, edges }, pid)
  })
})

describe('path: connection lifecycle', () => {
  it('detaches the node (connectionId null) when its connection is deleted', async () => {
    const pid = await newProject()
    const cid = await newConnection(pid)
    const n = node({ connectionId: cid })
    await put(pid, { nodes: [n], edges: [] })
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${pid}/connections/${cid}`,
      headers: a,
    })
    expect(del.statusCode).toBe(204)
    const path = (await get(pid)).json().path
    expect(path.nodes).toHaveLength(1)
    expect(path.nodes[0]).toMatchObject({ id: n.id, connectionId: null })
  })
})
