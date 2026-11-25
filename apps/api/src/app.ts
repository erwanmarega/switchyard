import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify'
import { createRequireAuth } from './auth/guard.js'
import { createTokenVerifier, remoteKeySet, type TokenVerifier } from './auth/jwt.js'
import { loadConfig, type Config } from './config.js'
import { createSecretBox, type SecretBox } from './crypto/secrets.js'
import { openDatabase, type Database, type PostgresDatabase } from './db/index.js'
import { createDefaultRegistry, type IntegrationRegistry } from './integrations/registry.js'
import { createCheckScheduler } from './checks/scheduler.js'
import { checkRoutes } from './routes/checks.js'
import { connectionRoutes } from './routes/connections.js'
import { pathRoutes } from './routes/path.js'
import { projectRoutes } from './routes/projects.js'
import { createPostgresSchedulerStore, createPostgresStore } from './store/postgres.js'
import type { Store } from './store/types.js'

export const VERSION = '0.1.0'

export interface BuildAppOptions {
  logger?: boolean
  registry?: IntegrationRegistry
  config?: Config
  /** Defaults to a lazy Postgres client built from `config.DATABASE_URL`. */
  db?: Database
  /** Defaults to the Postgres store on the database opened by the app. Required with `db`. */
  store?: Store
  /** Defaults to a box keyed by `config.SWITCHYARD_ENCRYPTION_KEY`. */
  secretBox?: SecretBox
  /** Defaults to local verification against the Supabase JWKS; tests inject their own keys. */
  verifyToken?: TokenVerifier
  /** Starts the background check scheduler on ready. Defaults to false; tests never start it. */
  startScheduler?: boolean
}

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const HEALTH_DB_TIMEOUT_MS = 3000

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const config = options.config ?? loadConfig()
  const app = Fastify({
    trustProxy: config.TRUST_PROXY,
    logger: options.logger
      ? {
          // Never log credentials or access tokens.
          redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
        }
      : false,
  })
  const registry = options.registry ?? createDefaultRegistry()
  if (options.db && !options.store) {
    throw new Error('buildApp: an injected `db` requires an explicit `store`')
  }
  let ownedDb: PostgresDatabase | undefined
  if (!options.db) ownedDb = openDatabase(config.DATABASE_URL, config.DATABASE_SSL)
  const db: Database = options.db ?? ownedDb!
  const store = options.store ?? createPostgresStore(ownedDb!.sql)
  const secretBox = options.secretBox ?? createSecretBox(config.SWITCHYARD_ENCRYPTION_KEY)
  const verifyToken =
    options.verifyToken ??
    createTokenVerifier(config.SUPABASE_URL, remoteKeySet(config.SUPABASE_URL))
  if (options.startScheduler && options.db) {
    throw new Error('buildApp: `startScheduler` requires the app to own its database')
  }
  app.addHook('onClose', async () => {
    await db.close()
  })

  if (options.startScheduler && config.CHECKS_ENABLED && ownedDb) {
    const log = app.log.child({ component: 'check-scheduler' })
    const call =
      (level: 'debug' | 'info' | 'warn' | 'error') =>
      (message: string, meta?: Record<string, unknown>) =>
        log[level](meta ?? {}, message)
    const scheduler = createCheckScheduler({
      store,
      scheduler: createPostgresSchedulerStore(ownedDb.sql),
      registry,
      box: secretBox,
      logger: {
        debug: call('debug'),
        info: call('info'),
        warn: call('warn'),
        error: call('error'),
      },
      intervalSeconds: config.CHECK_INTERVAL_SECONDS,
    })
    app.addHook('onReady', async () => scheduler.start())
    // preClose runs before the server and the onClose hooks, so the db is still open here.
    app.addHook('preClose', async () => scheduler.stop())
  }

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

  // Per-user data must never be stored by browsers, proxies or CDNs.
  app.addHook('onSend', async (request, reply) => {
    const path = request.url.split('?')[0]
    if (path?.startsWith('/api/')) {
      reply.header('cache-control', 'private, no-store')
    }
  })

  // CSRF posture: the API authenticates with a Bearer token that the browser never attaches on
  // its own (the web proxy injects it), state-changing routes only accept `application/json`,
  // and any request carrying an `Origin` header outside ALLOWED_ORIGINS is rejected below.
  const allowedOrigins = new Set(config.ALLOWED_ORIGINS)
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin
    if (!SAFE_METHODS.has(request.method) && origin !== undefined && !allowedOrigins.has(origin)) {
      return reply.code(403).send({ error: 'Origine non autorisée.' })
    }
  })

  app.decorateRequest('user', null)
  app.decorate('requireAuth', createRequireAuth(verifyToken))

  app.get('/health', async (request, reply) => {
    try {
      let timer: NodeJS.Timeout | undefined
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('db ping timeout')), HEALTH_DB_TIMEOUT_MS)
      })
      try {
        await Promise.race([db.ping(), timeout])
      } finally {
        clearTimeout(timer)
      }
      return { status: 'ok', version: VERSION, db: 'ok' }
    } catch (err) {
      request.log.error(err, 'health check: database unreachable')
      return reply.code(503).send({ status: 'degraded', db: 'down' })
    }
  })

  app.get('/api/me', { preHandler: app.requireAuth }, async (request) => ({
    user: request.user,
  }))

  app.get('/api/integrations', { preHandler: app.requireAuth }, async () => ({
    integrations: registry.list().map((i) => ({
      id: i.id,
      name: i.name,
      checks: i.checks.map((c) => c.id),
      credentialsSchema: i.credentialsSchema.map((f) => ({
        key: f.key,
        label: f.label,
        secret: f.secret,
      })),
    })),
  }))

  app.register(projectRoutes(store))
  app.register(connectionRoutes(store, registry, secretBox))
  app.register(pathRoutes(store))
  app.register(checkRoutes(store))

  return app
}
