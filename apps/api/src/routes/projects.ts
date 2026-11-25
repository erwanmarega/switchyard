import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { LimitError, type Store } from '../store/types.js'
import { parseBody, parseParams, trimmed, uuid } from './util.js'

const NOT_FOUND = 'Projet introuvable.'
const params = z.strictObject({ projectId: uuid })
const body = z.strictObject({ name: trimmed(100) })

export const projectRoutes =
  (store: Store): FastifyPluginAsync =>
  async (app) => {
    const opts = { preHandler: app.requireAuth }

    app.get('/api/projects', opts, async (request) => ({
      projects: await store.listProjects(request.user!.id),
    }))

    app.post('/api/projects', opts, async (request, reply) => {
      const data = parseBody(body, request.body, reply)
      if (!data) return reply
      try {
        const project = await store.createProject(request.user!.id, data.name)
        return reply.code(201).send({ project })
      } catch (err) {
        if (err instanceof LimitError) return reply.code(409).send({ error: err.message })
        throw err
      }
    })

    app.get('/api/projects/:projectId', opts, async (request, reply) => {
      const p = parseParams(params, request.params, reply, NOT_FOUND)
      if (!p) return reply
      const project = await store.getProject(request.user!.id, p.projectId)
      return project ? { project } : reply.code(404).send({ error: NOT_FOUND })
    })

    app.patch('/api/projects/:projectId', opts, async (request, reply) => {
      const p = parseParams(params, request.params, reply, NOT_FOUND)
      if (!p) return reply
      const data = parseBody(body, request.body, reply)
      if (!data) return reply
      const project = await store.updateProject(request.user!.id, p.projectId, data.name)
      return project ? { project } : reply.code(404).send({ error: NOT_FOUND })
    })

    app.delete('/api/projects/:projectId', opts, async (request, reply) => {
      const p = parseParams(params, request.params, reply, NOT_FOUND)
      if (!p) return reply
      const deleted = await store.deleteProject(request.user!.id, p.projectId)
      return deleted ? reply.code(204).send() : reply.code(404).send({ error: NOT_FOUND })
    })
  }
