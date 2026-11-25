import { randomUUID } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { CredentialsError, secretFieldKeys, splitCredentials } from '../connections/credentials.js'
import type { SecretBox } from '../crypto/secrets.js'
import type { IntegrationRegistry } from '../integrations/registry.js'
import { LimitError, type ConnectionRecord, type Store } from '../store/types.js'
import { parseBody, parseParams, sendInvalid, trimmed, uuid } from './util.js'

const PROJECT_NOT_FOUND = 'Projet introuvable.'
const NOT_FOUND = 'Connexion introuvable.'
const UNKNOWN_INTEGRATION = 'Intégration inconnue.'

const projectParams = z.strictObject({ projectId: uuid })
const connectionParams = z.strictObject({ projectId: uuid, connectionId: uuid })
// The serialized size is capped so the sealed value (base64url of the UTF-8 JSON, x4/3 plus
// ~50 chars of prefix, IV and tag) always fits the 16384-char `connections.secrets` check.
const MAX_CREDENTIALS_BYTES = 10_000
const credentials = z
  .record(z.string().max(64), z.string().min(1).max(4096))
  .refine((c) => Buffer.byteLength(JSON.stringify(c), 'utf8') <= MAX_CREDENTIALS_BYTES, {
    message: 'Identifiants trop volumineux.',
  })
const createBody = z.strictObject({
  integrationId: z.string().min(1).max(64),
  label: trimmed(100),
  credentials,
})
const patchBody = z
  .strictObject({ label: trimmed(100).optional(), credentials: credentials.optional() })
  .refine((v) => v.label !== undefined || v.credentials !== undefined, {
    message: 'Au moins un champ est requis (label ou credentials).',
  })

export const connectionRoutes =
  (store: Store, registry: IntegrationRegistry, box: SecretBox): FastifyPluginAsync =>
  async (app) => {
    const opts = { preHandler: app.requireAuth }

    /** Public shape: never includes the ciphertext or any secret value. */
    const present = (c: ConnectionRecord) => {
      const integration = registry.get(c.integrationId)
      return {
        id: c.id,
        projectId: c.projectId,
        integrationId: c.integrationId,
        label: c.label,
        config: c.config,
        secretFields: c.hasSecrets && integration ? secretFieldKeys(integration) : [],
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }
    }

    app.get('/api/projects/:projectId/connections', opts, async (request, reply) => {
      const p = parseParams(projectParams, request.params, reply, PROJECT_NOT_FOUND)
      if (!p) return reply
      const list = await store.listConnections(request.user!.id, p.projectId)
      return list
        ? { connections: list.map(present) }
        : reply.code(404).send({ error: PROJECT_NOT_FOUND })
    })

    app.post('/api/projects/:projectId/connections', opts, async (request, reply) => {
      const p = parseParams(projectParams, request.params, reply, PROJECT_NOT_FOUND)
      if (!p) return reply
      const data = parseBody(createBody, request.body, reply)
      if (!data) return reply
      const userId = request.user!.id
      const integration = registry.get(data.integrationId)
      if (!integration) return reply.code(400).send({ error: UNKNOWN_INTEGRATION })

      const id = randomUUID()
      try {
        const sealed = splitCredentials(box, integration, data.credentials, id, userId)
        const connection = await store.createConnection(userId, p.projectId, {
          id,
          integrationId: integration.id,
          label: data.label,
          ...sealed,
        })
        if (!connection) return reply.code(404).send({ error: PROJECT_NOT_FOUND })
        return reply.code(201).send({ connection: present(connection) })
      } catch (err) {
        if (err instanceof CredentialsError) return sendInvalid(reply, err.issues)
        if (err instanceof LimitError) return reply.code(409).send({ error: err.message })
        throw err
      }
    })

    app.get('/api/projects/:projectId/connections/:connectionId', opts, async (request, reply) => {
      const p = parseParams(connectionParams, request.params, reply, NOT_FOUND)
      if (!p) return reply
      const connection = await store.getConnection(request.user!.id, p.projectId, p.connectionId)
      return connection
        ? { connection: present(connection) }
        : reply.code(404).send({ error: NOT_FOUND })
    })

    app.patch(
      '/api/projects/:projectId/connections/:connectionId',
      opts,
      async (request, reply) => {
        const p = parseParams(connectionParams, request.params, reply, NOT_FOUND)
        if (!p) return reply
        const data = parseBody(patchBody, request.body, reply)
        if (!data) return reply
        const userId = request.user!.id

        let patch: Parameters<Store['updateConnection']>[3] = { label: data.label }
        if (data.credentials) {
          const existing = await store.getConnection(userId, p.projectId, p.connectionId)
          if (!existing) return reply.code(404).send({ error: NOT_FOUND })
          const integration = registry.get(existing.integrationId)
          if (!integration) return reply.code(400).send({ error: UNKNOWN_INTEGRATION })
          try {
            // Re-sealed under the same connection id (it is bound into the AAD).
            patch = {
              label: data.label,
              credentials: splitCredentials(
                box,
                integration,
                data.credentials,
                existing.id,
                userId,
              ),
            }
          } catch (err) {
            if (err instanceof CredentialsError) return sendInvalid(reply, err.issues)
            throw err
          }
        }
        const connection = await store.updateConnection(userId, p.projectId, p.connectionId, patch)
        return connection
          ? { connection: present(connection) }
          : reply.code(404).send({ error: NOT_FOUND })
      },
    )

    app.delete(
      '/api/projects/:projectId/connections/:connectionId',
      opts,
      async (request, reply) => {
        const p = parseParams(connectionParams, request.params, reply, NOT_FOUND)
        if (!p) return reply
        const deleted = await store.deleteConnection(request.user!.id, p.projectId, p.connectionId)
        return deleted ? reply.code(204).send() : reply.code(404).send({ error: NOT_FOUND })
      },
    )
  }
