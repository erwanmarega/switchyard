import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { splitCredentials } from '../src/connections/credentials.js'
import type { NewCheckResult } from '../src/store/types.js'
import { USER_ID, makeSigner, type Signer } from './helpers.js'
import { bearer, fakeIntegration, routesApp, uid } from './support/routes.js'

const OTHER_ID = uid()
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

const get = (projectId: string, headers?: { authorization: string }) =>
  app.inject({ method: 'GET', url: `/api/projects/${projectId}/checks`, headers })

async function projectWithConnection(user = USER_ID) {
  const project = await ctx.store.createProject(user, 'P')
  const id = uid()
  const sealed = splitCredentials(
    ctx.box,
    fakeIntegration,
    { token: 'tok_route_secret', teamId: 't' },
    id,
    user,
  )
  await ctx.store.createConnection(user, project.id, {
    id,
    integrationId: 'fake',
    label: 'L',
    ...sealed,
  })
  return { projectId: project.id, connectionId: id }
}

const result = (checkId: string, over: Partial<NewCheckResult> = {}): NewCheckResult => ({
  checkId,
  status: 'ok',
  message: `msg ${checkId}`,
  details: null,
  checkedAt: '2026-05-05T10:00:00.000Z',
  ...over,
})

describe('GET /api/projects/:projectId/checks', () => {
  it('returns 401 without a token', async () => {
    expect((await get(uid())).statusCode).toBe(401)
  })

  it('returns 404 with the same body for unknown, malformed and foreign projects', async () => {
    const foreign = await projectWithConnection(OTHER_ID)
    const bodies = []
    for (const id of [uid(), 'not-a-uuid', foreign.projectId]) {
      const res = await get(id, a)
      expect(res.statusCode).toBe(404)
      bodies.push(res.body)
    }
    expect(new Set(bodies).size).toBe(1)
    expect(JSON.parse(bodies[0]!)).toEqual({ error: 'Projet introuvable.' })
  })

  it('returns an empty list for a project without results', async () => {
    const { projectId } = await projectWithConnection()
    const res = await get(projectId, a)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ checks: [] })
  })

  it('sets Cache-Control to private, no-store', async () => {
    const { projectId } = await projectWithConnection()
    const res = await get(projectId, a)
    expect(res.headers['cache-control']).toMatch(/private/)
    expect(res.headers['cache-control']).toMatch(/no-store/)
  })

  it('returns only the latest result per connection and check, with the public shape', async () => {
    const { projectId, connectionId } = await projectWithConnection()
    await ctx.store.insertCheckResults(USER_ID, projectId, connectionId, [
      result('a', { status: 'error', checkedAt: '2026-05-05T10:00:00.000Z' }),
      result('b', { checkedAt: '2026-05-05T10:00:00.000Z' }),
    ])
    await ctx.store.insertCheckResults(USER_ID, projectId, connectionId, [
      result('a', {
        status: 'warning',
        details: { n: 1 },
        checkedAt: '2026-05-05T11:00:00.000Z',
      }),
    ])
    const res = await get(projectId, a)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      checks: [
        {
          connectionId,
          checkId: 'a',
          status: 'warning',
          message: 'msg a',
          details: { n: 1 },
          checkedAt: '2026-05-05T11:00:00.000Z',
        },
        {
          connectionId,
          checkId: 'b',
          status: 'ok',
          message: 'msg b',
          details: null,
          checkedAt: '2026-05-05T10:00:00.000Z',
        },
      ],
    })
  })

  it('does not let an older result replace a newer one inserted earlier', async () => {
    const { projectId, connectionId } = await projectWithConnection()
    await ctx.store.insertCheckResults(USER_ID, projectId, connectionId, [
      result('a', { status: 'ok', checkedAt: '2026-05-05T12:00:00.000Z' }),
    ])
    await ctx.store.insertCheckResults(USER_ID, projectId, connectionId, [
      result('a', { status: 'error', checkedAt: '2026-05-05T09:00:00.000Z' }),
    ])
    const { checks } = (await get(projectId, a)).json()
    expect(checks).toHaveLength(1)
    expect(checks[0].status).toBe('ok')
  })

  it('orders results stably by connection then check', async () => {
    const { projectId, connectionId } = await projectWithConnection()
    await ctx.store.insertCheckResults(USER_ID, projectId, connectionId, [
      result('z'),
      result('m'),
      result('a'),
    ])
    const first = (await get(projectId, a)).json().checks.map((c: { checkId: string }) => c.checkId)
    const second = (await get(projectId, a))
      .json()
      .checks.map((c: { checkId: string }) => c.checkId)
    expect(first).toEqual(['a', 'm', 'z'])
    expect(second).toEqual(first)
  })

  it('never returns results of another user and cannot read them through a foreign project', async () => {
    const mine = await projectWithConnection(USER_ID)
    const theirs = await projectWithConnection(OTHER_ID)
    await ctx.store.insertCheckResults(OTHER_ID, theirs.projectId, theirs.connectionId, [
      result('theirs'),
    ])
    await ctx.store.insertCheckResults(USER_ID, mine.projectId, mine.connectionId, [result('mine')])
    const mineRes = (await get(mine.projectId, a)).json()
    expect(mineRes.checks.map((c: { checkId: string }) => c.checkId)).toEqual(['mine'])
    expect((await get(theirs.projectId, a)).statusCode).toBe(404)
    const theirRes = (await get(theirs.projectId, b)).json()
    expect(theirRes.checks.map((c: { checkId: string }) => c.checkId)).toEqual(['theirs'])
    expect(JSON.stringify(mineRes)).not.toContain('theirs')
  })

  it('does not insert results for a connection of another user', async () => {
    const theirs = await projectWithConnection(OTHER_ID)
    expect(
      await ctx.store.insertCheckResults(USER_ID, theirs.projectId, theirs.connectionId, [
        result('x'),
      ]),
    ).toBe(false)
  })
})
