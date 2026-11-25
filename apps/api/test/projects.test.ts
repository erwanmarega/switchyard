import type { FastifyInstance } from 'fastify'
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

const create = async (headers: { authorization: string }, name = 'My project') => {
  const res = await app.inject({ method: 'POST', url: '/api/projects', headers, payload: { name } })
  return res
}

describe('projects: authentication', () => {
  const id = uid()
  it.each([
    ['GET', '/api/projects'],
    ['POST', '/api/projects'],
    ['GET', `/api/projects/${id}`],
    ['PATCH', `/api/projects/${id}`],
    ['DELETE', `/api/projects/${id}`],
  ])('%s %s returns 401 without a token', async (method, url) => {
    const res = await app.inject({ method: method as 'GET', url, payload: { name: 'x' } })
    expect(res.statusCode).toBe(401)
  })
})

describe('projects: CRUD', () => {
  it('creates a project with a trimmed name', async () => {
    const res = await create(a, '  Padded  ')
    expect(res.statusCode).toBe(201)
    expect(res.json().project).toMatchObject({ name: 'Padded' })
    expect(res.json().project.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.headers['cache-control']).toBe('private, no-store')
  })

  it('lists only the caller own projects', async () => {
    const mine = (await create(a, 'mine-list')).json().project
    const theirs = (await create(b, 'theirs-list')).json().project
    const listA = (await app.inject({ method: 'GET', url: '/api/projects', headers: a })).json()
    const listB = (await app.inject({ method: 'GET', url: '/api/projects', headers: b })).json()
    const idsA = listA.projects.map((p: { id: string }) => p.id)
    const idsB = listB.projects.map((p: { id: string }) => p.id)
    expect(idsA).toContain(mine.id)
    expect(idsA).not.toContain(theirs.id)
    expect(idsB).toContain(theirs.id)
    expect(idsB).not.toContain(mine.id)
  })

  it('gets, patches and deletes a project', async () => {
    const p = (await create(a, 'before')).json().project
    const url = `/api/projects/${p.id}`
    const got = await app.inject({ method: 'GET', url, headers: a })
    expect(got.json().project.name).toBe('before')

    const patched = await app.inject({
      method: 'PATCH',
      url,
      headers: a,
      payload: { name: ' after ' },
    })
    expect(patched.statusCode).toBe(200)
    expect(patched.json().project).toMatchObject({ id: p.id, name: 'after' })

    const del = await app.inject({ method: 'DELETE', url, headers: a })
    expect(del.statusCode).toBe(204)
    expect(del.body).toBe('')
    expect((await app.inject({ method: 'GET', url, headers: a })).statusCode).toBe(404)
  })
})

describe('projects: validation', () => {
  const bodies: [string, unknown][] = [
    ['empty name', { name: '' }],
    ['blank name', { name: '   ' }],
    ['too long name', { name: 'x'.repeat(101) }],
    ['unknown key', { name: 'ok', admin: true }],
    ['missing name', {}],
    ['non-string name', { name: 42 }],
    ['array body', ['name']],
    ['string body', '"name"'],
  ]
  it.each(bodies)('rejects %s with 400', async (_label, payload) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { ...a, 'content-type': 'application/json' },
      payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
    })
    expect(res.statusCode).toBe(400)
  })

  it('accepts a 100-character name', async () => {
    expect((await create(a, 'y'.repeat(100))).statusCode).toBe(201)
  })

  it('rejects a missing body', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/projects', headers: a })
    expect(res.statusCode).toBe(400)
  })

  it('never echoes the received value in the 400 body', async () => {
    const secret = 'LEAK-ME-' + 'z'.repeat(120)
    const tooLong = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: a,
      payload: { name: secret },
    })
    expect(tooLong.statusCode).toBe(400)
    expect(tooLong.body).not.toContain('LEAK-ME')

    const unknownKey = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: a,
      payload: { name: 'ok', 'LEAK-ME-key': 'LEAK-ME-value' },
    })
    expect(unknownKey.statusCode).toBe(400)
    expect(unknownKey.body).not.toContain('LEAK-ME-value')

    const wrongType = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${uid()}`,
      headers: a,
      payload: { name: { nested: 'LEAK-ME' } },
    })
    expect(wrongType.body).not.toContain('LEAK-ME')
  })
})

describe('projects: not found', () => {
  it('returns the same 404 body for unknown, malformed and foreign ids', async () => {
    const foreign = (await create(b, 'foreign')).json().project
    const ids = [uid(), 'not-a-uuid', foreign.id]
    for (const method of ['GET', 'PATCH', 'DELETE'] as const) {
      const bodies = new Set<string>()
      for (const id of ids) {
        const res = await app.inject({
          method,
          url: `/api/projects/${id}`,
          headers: a,
          payload: method === 'PATCH' ? { name: 'x' } : undefined,
        })
        expect(res.statusCode).toBe(404)
        bodies.add(res.body)
      }
      expect(bodies.size).toBe(1)
    }
    // the foreign project is untouched
    const still = await app.inject({
      method: 'GET',
      url: `/api/projects/${foreign.id}`,
      headers: b,
    })
    expect(still.json().project.name).toBe('foreign')
  })
})

describe('projects: limits and headers', () => {
  it('returns 409 past 100 projects per user', async () => {
    const user = await bearer(signer, uid())
    for (let i = 0; i < 100; i++) {
      expect((await create(user, `p${i}`)).statusCode).toBe(201)
    }
    const res = await create(user, 'one too many')
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toEqual(expect.any(String))
    // another user is unaffected
    expect((await create(b, 'still ok')).statusCode).toBe(201)
  })

  it('rejects a foreign Origin on POST with 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { ...a, origin: 'https://evil.example' },
      payload: { name: 'csrf' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.headers['cache-control']).toBe('private, no-store')
  })

  it('sets cache-control private, no-store on every route', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects', headers: a })
    expect(res.headers['cache-control']).toBe('private, no-store')
  })
})
