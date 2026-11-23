import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import type { Config } from '../config.js'
import type { Database } from '../db/index.js'
import { LoginThrottle } from './login-throttle.js'
import {
  createDummyVerifier,
  DEFAULT_PARAMS,
  hashPassword,
  needsRehash,
  verifyPassword,
  type ScryptParams,
} from './passwords.js'
import {
  createSession,
  deleteSession,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  type AuthUser,
} from './sessions.js'

const email = z
  .string({ error: 'Email requis.' })
  .trim()
  .toLowerCase()
  .max(254, 'Email trop long.')
  .pipe(z.email({ error: 'Email invalide.' }))

const registerSchema = z.object({
  email,
  password: z
    .string({ error: 'Mot de passe requis.' })
    .min(10, 'Le mot de passe doit contenir au moins 10 caractères.')
    .max(128, 'Le mot de passe doit contenir au plus 128 caractères.'),
})

const loginSchema = z.object({
  email,
  password: z.string({ error: 'Mot de passe requis.' }).min(1, 'Mot de passe requis.').max(128),
})

interface UserRow {
  id: string
  email: string
  password_hash: string
}

export interface AuthRouteOptions {
  /** scrypt parameters; only tests lower them for speed. */
  passwordParams?: ScryptParams
  throttle?: LoginThrottle
}

export function registerAuthRoutes(
  app: FastifyInstance,
  db: Database,
  config: Config,
  options: AuthRouteOptions = {},
): void {
  const params = options.passwordParams ?? DEFAULT_PARAMS
  const throttle = options.throttle ?? new LoginThrottle()
  const verifyAgainstDummy = createDummyVerifier(params)

  function setSessionCookie(reply: FastifyReply, token: string): void {
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: config.COOKIE_SECURE,
      maxAge: SESSION_TTL_MS / 1000,
    })
  }

  function invalid(reply: FastifyReply, error: z.ZodError) {
    // Only paths and messages: the submitted values (password) are never echoed.
    return reply.code(400).send({
      error: 'Données invalides.',
      issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }

  const limited: { rateLimit?: { max: number; timeWindow: string } } =
    config.AUTH_RATE_LIMIT_MAX > 0
      ? { rateLimit: { max: config.AUTH_RATE_LIMIT_MAX, timeWindow: '1 minute' } }
      : {}

  app.get('/api/auth/config', async () => ({ registrationOpen: config.ALLOW_REGISTRATION }))

  app.post('/api/auth/register', { config: limited }, async (request, reply) => {
    if (!config.ALLOW_REGISTRATION) {
      return reply.code(403).send({ error: 'Les inscriptions sont fermées sur cette instance.' })
    }
    const parsed = registerSchema.safeParse(request.body)
    if (!parsed.success) return invalid(reply, parsed.error)

    const { email: address, password } = parsed.data
    const passwordHash = await hashPassword(password, params)
    const user: AuthUser = { id: randomUUID(), email: address }
    try {
      db.prepare(
        'INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
      ).run(user.id, user.email, passwordHash, Date.now())
    } catch (err) {
      if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) {
        return reply.code(409).send({ error: 'Un compte existe déjà avec cet email.' })
      }
      throw err
    }
    setSessionCookie(reply, createSession(db, user.id))
    return reply.code(201).send({ user })
  })

  app.post('/api/auth/login', { config: limited }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) return invalid(reply, parsed.error)

    const { email: address, password } = parsed.data
    if (throttle.isBlocked(address)) {
      return reply.code(429).send({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' })
    }
    const row = db
      .prepare('SELECT id, email, password_hash FROM users WHERE email = ?')
      .get(address) as UserRow | undefined
    let ok = false
    if (row) {
      ok = await verifyPassword(password, row.password_hash)
    } else {
      await verifyAgainstDummy(password)
    }
    if (!row || !ok) {
      throttle.recordFailure(address)
      return reply.code(401).send({ error: 'Email ou mot de passe incorrect.' })
    }
    throttle.reset(address)
    if (needsRehash(row.password_hash, params)) {
      // Upgrade legacy hashes transparently now that we hold the plaintext password.
      const upgraded = await hashPassword(password, params)
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(upgraded, row.id)
    }
    setSessionCookie(reply, createSession(db, row.id))
    return { user: { id: row.id, email: row.email } satisfies AuthUser }
  })

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE]
    if (token) deleteSession(db, token)
    reply.clearCookie(SESSION_COOKIE, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.COOKIE_SECURE,
    })
    return reply.code(204).send()
  })

  app.get('/api/auth/me', { preHandler: app.requireAuth }, async (request) => ({
    user: request.user,
  }))
}
