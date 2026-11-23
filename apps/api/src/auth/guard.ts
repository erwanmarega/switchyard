import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Database } from '../db/index.js'
import { findSessionUser, SESSION_COOKIE, type AuthUser } from './sessions.js'

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null
  }
}

/** Builds a preHandler that sets `request.user` or replies 401. */
export function createRequireAuth(db: Database) {
  return async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
    const token = request.cookies[SESSION_COOKIE]
    const user = token ? findSessionUser(db, token) : null
    if (!user) {
      return reply.code(401).send({ error: 'Non authentifié' })
    }
    request.user = user
  }
}
