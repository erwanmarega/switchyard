import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AuthUser, TokenVerifier } from './jwt.js'

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null
  }
}

const BEARER = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/

/** Builds a preHandler that sets `request.user` from the Bearer access token or replies 401. */
export function createRequireAuth(verify: TokenVerifier) {
  return async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
    const token = request.headers.authorization?.match(BEARER)?.[1]
    const user = token ? await verify(token) : null
    if (!user) {
      return reply.code(401).send({ error: 'Non authentifié' })
    }
    request.user = user
  }
}
