import type { FastifyPluginAsync } from 'fastify'
import { validatePath } from '@switchyard/plugin-sdk'
import { z } from 'zod'
import { LIMITS, ValidationError, type PathRecord, type Store } from '../store/types.js'
import { parseBody, parseParams, sendInvalid, trimmed, uuid, type Issue } from './util.js'

const NOT_FOUND = 'Projet introuvable.'
const params = z.strictObject({ projectId: uuid })

const nodeSchema = z.strictObject({
  id: uuid,
  integrationId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  label: trimmed(100),
  connectionId: uuid.nullable().optional(),
})
const edgeSchema = z.strictObject({
  id: uuid,
  from: uuid,
  to: uuid,
  label: trimmed(100).optional(),
})
const pathBody = z.strictObject({
  nodes: z.array(nodeSchema).max(LIMITS.nodesPerPath),
  edges: z.array(edgeSchema).max(LIMITS.edgesPerPath),
})

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/** Structural checks on top of the SDK's `validatePath`. Messages never echo input values. */
function checkStructure(path: PathRecord): Issue[] {
  const issues: Issue[] = validatePath(path).map((message) => ({
    path: 'path',
    message: message.replace(UUID, '<id>'),
  }))
  const pairs = new Set<string>()
  path.edges.forEach((edge, i) => {
    if (edge.from === edge.to) {
      issues.push({
        path: `edges.${i}`,
        message: 'Une arête ne peut pas relier un nœud à lui-même.',
      })
    }
    const pair = `${edge.from}>${edge.to}`
    if (pairs.has(pair)) {
      issues.push({ path: `edges.${i}`, message: 'Arête en double entre ces deux nœuds.' })
    }
    pairs.add(pair)
  })
  return issues
}

export const pathRoutes =
  (store: Store): FastifyPluginAsync =>
  async (app) => {
    const opts = { preHandler: app.requireAuth }

    app.get('/api/projects/:projectId/path', opts, async (request, reply) => {
      const p = parseParams(params, request.params, reply, NOT_FOUND)
      if (!p) return reply
      const path = await store.getPath(request.user!.id, p.projectId)
      return path ? { path } : reply.code(404).send({ error: NOT_FOUND })
    })

    app.put('/api/projects/:projectId/path', opts, async (request, reply) => {
      const p = parseParams(params, request.params, reply, NOT_FOUND)
      if (!p) return reply
      const data = parseBody(pathBody, request.body, reply)
      if (!data) return reply

      const path: PathRecord = {
        nodes: data.nodes.map((n) => ({
          id: n.id,
          integrationId: n.integrationId,
          label: n.label,
          connectionId: n.connectionId ?? null,
        })),
        edges: data.edges.map((e) => {
          const edge: PathRecord['edges'][number] = { id: e.id, from: e.from, to: e.to }
          if (e.label !== undefined) edge.label = e.label
          return edge
        }),
      }
      const issues = checkStructure(path)
      if (issues.length > 0) return sendInvalid(reply, issues)

      try {
        const saved = await store.replacePath(request.user!.id, p.projectId, path)
        if (!saved) return reply.code(404).send({ error: NOT_FOUND })
      } catch (err) {
        if (err instanceof ValidationError) {
          return sendInvalid(reply, [{ path: err.path, message: err.message }])
        }
        throw err
      }
      const stored = await store.getPath(request.user!.id, p.projectId)
      return stored ? { path: stored } : reply.code(404).send({ error: NOT_FOUND })
    })
  }
