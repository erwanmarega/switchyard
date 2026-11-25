import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import type { Store } from '../store/types.js'
import { parseParams, uuid } from './util.js'

const NOT_FOUND = 'Projet introuvable.'
const params = z.strictObject({ projectId: uuid })

export const checkRoutes =
  (store: Store): FastifyPluginAsync =>
  async (app) => {
    app.get(
      '/api/projects/:projectId/checks',
      { preHandler: app.requireAuth },
      async (request, reply) => {
        const p = parseParams(params, request.params, reply, NOT_FOUND)
        if (!p) return reply
        const results = await store.latestCheckResults(request.user!.id, p.projectId)
        if (!results) return reply.code(404).send({ error: NOT_FOUND })
        return {
          checks: results.map((r) => ({
            connectionId: r.connectionId,
            checkId: r.checkId,
            status: r.status,
            message: r.message,
            details: r.details,
            checkedAt: r.checkedAt,
          })),
        }
      },
    )
  }
