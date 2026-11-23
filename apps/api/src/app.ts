import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify'
import { createRequireAuth } from './auth/guard.js'
import { registerAuthRoutes } from './auth/routes.js'
import { deleteExpiredSessions } from './auth/sessions.js'
import type { ScryptParams } from './auth/passwords.js'
import { loadConfig, type Config } from './config.js'
import { openDatabase, type Database } from './db/index.js'
import { createDefaultRegistry, type IntegrationRegistry } from './integrations/registry.js'

export const VERSION = '0.1.0'

export interface BuildAppOptions {
  logger?: boolean
  registry?: IntegrationRegistry
  config?: Config
  db?: Database
  /** scrypt parameters; only tests lower them for speed. */
  passwordParams?: ScryptParams
}

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>
  }
}

export const SESSION_SWEEP_INTERVAL_MS = 60 * 60 * 1000

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const config = options.config ?? loadConfig()
  const app = Fastify({
    trustProxy: config.TRUST_PROXY,
    logger: options.logger
      ? {
          // Never log credentials, session tokens or request bodies carrying passwords.
          redact: [
            'req.headers.cookie',
            'req.headers.authorization',
            'res.headers["set-cookie"]',
            'req.body.password',
          ],
        }
      : false,
  })
  const registry = options.registry ?? createDefaultRegistry()
  const db = options.db ?? openDatabase(config.DATABASE_URL)
  // Expired sessions are only deleted lazily on lookup: sweep them at startup and hourly.
  const sweep = () => {
    try {
      deleteExpiredSessions(db)
    } catch (err) {
      app.log.error(err, 'session sweep failed')
    }
  }
  sweep()
  const sweepTimer = setInterval(sweep, SESSION_SWEEP_INTERVAL_MS)
  sweepTimer.unref()
  app.addHook('onClose', async () => {
    clearInterval(sweepTimer)
    db.close()
  })

  // Never leak real error details: 5xx get a generic message (the cause is logged), while
  // 4xx keep Fastify's standard response shape and messages.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status = error.statusCode ?? 500
    if (status >= 500) {
      request.log.error(error)
      return reply.code(status).send({ error: 'Erreur interne du serveur.' })
    }
    return reply.code(status).send(error)
  })

  // Auth data must never be stored by browsers, proxies or CDNs.
  app.addHook('onSend', async (request, reply) => {
    const path = request.url.split('?')[0]
    if (path === '/api/integrations' || path?.startsWith('/api/auth/')) {
      reply.header('cache-control', 'private, no-store')
    }
  })

  app.register(cookie)
  if (config.AUTH_RATE_LIMIT_MAX > 0) {
    app.register(rateLimit, { global: false, errorResponseBuilder: rateLimitError })
  }

  // CSRF posture: state-changing routes only accept `application/json` bodies (Fastify's
  // default parsers reject other content types, so plain HTML forms cannot reach them),
  // the session cookie is SameSite=Lax (not sent on cross-site POSTs), and any request
  // carrying an `Origin` header outside ALLOWED_ORIGINS is rejected below.
  const allowedOrigins = new Set(config.ALLOWED_ORIGINS)
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin
    if (!SAFE_METHODS.has(request.method) && origin !== undefined && !allowedOrigins.has(origin)) {
      return reply.code(403).send({ error: 'Origine non autorisée.' })
    }
  })

  app.decorateRequest('user', null)
  app.decorate('requireAuth', createRequireAuth(db))

  app.get('/health', async () => ({ status: 'ok', version: VERSION }))

  // Registered as a plugin so @fastify/rate-limit's onRoute hook is active when routes are added.
  app.register(async (scope) =>
    registerAuthRoutes(scope, db, config, { passwordParams: options.passwordParams }),
  )

  app.get('/api/integrations', { preHandler: app.requireAuth }, async () => ({
    integrations: registry.list().map((i) => ({
      id: i.id,
      name: i.name,
      checks: i.checks.map((c) => c.id),
    })),
  }))

  return app
}

function rateLimitError() {
  return {
    statusCode: 429,
    error: 'Trop de tentatives. Réessayez dans une minute.',
  }
}
