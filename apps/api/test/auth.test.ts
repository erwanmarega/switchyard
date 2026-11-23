import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { describe, it, expect, afterEach } from 'vitest'
import { buildApp } from '../src/app.js'
import {
  DEFAULT_PARAMS,
  hashPassword,
  needsRehash,
  verifyPassword,
  type ScryptParams,
} from '../src/auth/passwords.js'
import { loadConfig } from '../src/config.js'
import { deleteExpiredSessions } from '../src/auth/sessions.js'
import { openDatabase, type Database } from '../src/db/index.js'

const PASSWORD = 'correct horse battery'
const apps: FastifyInstance[] = []
// Cheap scrypt parameters keep the suite fast; the default (strong) ones are covered below.
const FAST_PARAMS: ScryptParams = { N: 2 ** 10, r: 8, p: 1 }

function setup(env: Record<string, string> = {}) {
  const db = openDatabase(':memory:')
  const config = loadConfig({ DATABASE_URL: ':memory:', AUTH_RATE_LIMIT_MAX: '0', ...env })
  const app = buildApp({ config, db, passwordParams: FAST_PARAMS })
  apps.push(app)
  return { app, db }
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()))
})

function post(app: FastifyInstance, url: string, payload: unknown, headers = {}) {
  return app.inject({ method: 'POST', url, payload: payload as object, headers })
}

function cookieOf(res: LightMyRequestResponse): string {
  const c = res.cookies.find((x) => x.name === 'sy_session')
  if (!c) throw new Error('no session cookie')
  return `sy_session=${c.value}`
}

async function register(app: FastifyInstance, email = 'Alice@Example.com ') {
  return post(app, '/api/auth/register', { email, password: PASSWORD })
}

describe('register', () => {
  it('creates the user, sets a hardened cookie and logs in', async () => {
    const { app } = setup()
    const res = await register(app)
    expect(res.statusCode).toBe(201)
    expect(res.json().user.email).toBe('alice@example.com')
    const setCookie = String(res.headers['set-cookie'])
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Lax/i)
    expect(setCookie).toMatch(/Path=\//)
    expect(setCookie).not.toMatch(/Secure/i)

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: cookieOf(res) },
    })
    expect(me.statusCode).toBe(200)
    expect(me.json().user).toEqual(res.json().user)
  })

  it('marks the cookie Secure when configured', async () => {
    const { app } = setup({ NODE_ENV: 'production' })
    const res = await register(app)
    expect(String(res.headers['set-cookie'])).toMatch(/Secure/i)
  })

  it('stores only a hash of the session token', async () => {
    const { app, db } = setup()
    const res = await register(app)
    const token = cookieOf(res).split('=')[1]!
    const rows = db.prepare('SELECT id_hash FROM sessions').all() as { id_hash: string }[]
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id_hash).not.toBe(token)
    expect(rows[0]!.id_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('rejects a duplicate email (case-insensitive) with 409', async () => {
    const { app } = setup()
    await register(app)
    const res = await register(app, 'ALICE@example.com')
    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual({ error: 'Un compte existe déjà avec cet email.' })
  })

  it('rejects invalid bodies with 400 and does not echo the password', async () => {
    const { app } = setup()
    const secret = 'short-pw'
    const res = await post(app, '/api/auth/register', { email: 'not-an-email', password: secret })
    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.error).toBe('Données invalides.')
    expect(body.issues.map((i: { path: string }) => i.path).sort()).toEqual(['email', 'password'])
    expect(res.body).not.toContain(secret)
  })

  it('returns 403 when registration is closed', async () => {
    const { app } = setup({ ALLOW_REGISTRATION: 'false' })
    const res = await register(app)
    expect(res.statusCode).toBe(403)
    expect(res.json()).toEqual({ error: 'Les inscriptions sont fermées sur cette instance.' })
    const cfg = await app.inject({ method: 'GET', url: '/api/auth/config' })
    expect(cfg.json()).toEqual({ registrationOpen: false })
  })

  it('advertises open registration by default', async () => {
    const { app } = setup()
    const cfg = await app.inject({ method: 'GET', url: '/api/auth/config' })
    expect(cfg.json()).toEqual({ registrationOpen: true })
  })
})

describe('login', () => {
  it('returns the same 401 for a wrong password and an unknown email', async () => {
    const { app } = setup()
    await register(app)
    const wrong = await post(app, '/api/auth/login', {
      email: 'alice@example.com',
      password: 'wrong password!',
    })
    const unknown = await post(app, '/api/auth/login', {
      email: 'nobody@example.com',
      password: 'wrong password!',
    })
    expect(wrong.statusCode).toBe(401)
    expect(unknown.statusCode).toBe(401)
    expect(wrong.body).toBe(unknown.body)
    expect(wrong.json()).toEqual({ error: 'Email ou mot de passe incorrect.' })
  })

  it('logs in with valid credentials', async () => {
    const { app } = setup()
    await register(app)
    const res = await post(app, '/api/auth/login', {
      email: ' ALICE@example.com',
      password: PASSWORD,
    })
    expect(res.statusCode).toBe(200)
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: cookieOf(res) },
    })
    expect(me.statusCode).toBe(200)
  })

  it('rate limits repeated attempts when enabled', async () => {
    const { app } = setup({ AUTH_RATE_LIMIT_MAX: '2' })
    const attempt = () =>
      post(app, '/api/auth/login', { email: 'a@example.com', password: 'whatever' })
    expect((await attempt()).statusCode).toBe(401)
    expect((await attempt()).statusCode).toBe(401)
    expect((await attempt()).statusCode).toBe(429)
  })

  it('rate limits per client IP forwarded by a trusted proxy', async () => {
    const { app } = setup({ AUTH_RATE_LIMIT_MAX: '1' })
    const attempt = (ip: string) =>
      post(
        app,
        '/api/auth/login',
        { email: 'a@example.com', password: 'whatever' },
        { 'x-forwarded-for': ip },
      )
    expect((await attempt('203.0.113.1')).statusCode).toBe(401)
    expect((await attempt('203.0.113.1')).statusCode).toBe(429)
    // A different client behind the same proxy has its own budget.
    expect((await attempt('203.0.113.2')).statusCode).toBe(401)
  })

  it('ignores X-Forwarded-For from untrusted peers', async () => {
    const { app } = setup({ AUTH_RATE_LIMIT_MAX: '1', TRUST_PROXY: '10.0.0.1' })
    const attempt = (ip: string) =>
      post(
        app,
        '/api/auth/login',
        { email: 'a@example.com', password: 'whatever' },
        { 'x-forwarded-for': ip },
      )
    expect((await attempt('203.0.113.1')).statusCode).toBe(401)
    // Peer 127.0.0.1 is not trusted: a spoofed header does not grant a fresh budget.
    expect((await attempt('203.0.113.2')).statusCode).toBe(429)
  })
})

describe('per-account throttle', () => {
  const wrong = (app: FastifyInstance, email = 'alice@example.com') =>
    post(app, '/api/auth/login', { email, password: 'wrong password!' })

  it('answers 429 on the 6th failed login for the same email', async () => {
    const { app } = setup()
    await register(app)
    for (let i = 0; i < 5; i++) expect((await wrong(app)).statusCode).toBe(401)
    const blocked = await wrong(app)
    expect(blocked.statusCode).toBe(429)
    expect(blocked.json()).toEqual({
      error: 'Trop de tentatives. Réessayez dans quelques minutes.',
    })
    // Even the right password is refused while the window is active.
    const good = await post(app, '/api/auth/login', {
      email: 'alice@example.com',
      password: PASSWORD,
    })
    expect(good.statusCode).toBe(429)
    // Other accounts are unaffected.
    expect((await wrong(app, 'bob@example.com')).statusCode).toBe(401)
  })

  it('normalizes the email and resets on success', async () => {
    const { app } = setup()
    await register(app)
    for (let i = 0; i < 4; i++) await wrong(app, ' ALICE@example.com')
    const ok = await post(app, '/api/auth/login', {
      email: 'alice@example.com',
      password: PASSWORD,
    })
    expect(ok.statusCode).toBe(200)
    for (let i = 0; i < 5; i++) expect((await wrong(app)).statusCode).toBe(401)
    expect((await wrong(app)).statusCode).toBe(429)
  })
})

describe('password rehash', () => {
  it('upgrades an old-parameter hash after a successful login', async () => {
    const { app, db } = setup()
    const reg = await register(app)
    const old = await hashPassword(PASSWORD, { N: 2 ** 9, r: 8, p: 1 })
    db.prepare('UPDATE users SET password_hash = ?').run(old)
    const res = await post(app, '/api/auth/login', {
      email: 'alice@example.com',
      password: PASSWORD,
    })
    expect(res.statusCode).toBe(200)
    expect(reg.statusCode).toBe(201)
    const row = db.prepare('SELECT password_hash FROM users').get() as { password_hash: string }
    expect(row.password_hash).not.toBe(old)
    expect(row.password_hash.startsWith('scrypt$1024$8$1$')).toBe(true)
    expect(await verifyPassword(PASSWORD, row.password_hash)).toBe(true)
  })

  it('does not rehash on a failed login', async () => {
    const { app, db } = setup()
    await register(app)
    const old = await hashPassword(PASSWORD, { N: 2 ** 9, r: 8, p: 1 })
    db.prepare('UPDATE users SET password_hash = ?').run(old)
    await post(app, '/api/auth/login', { email: 'alice@example.com', password: 'wrong password!' })
    expect(db.prepare('SELECT password_hash FROM users').get()).toEqual({ password_hash: old })
  })
})

describe('session sweep', () => {
  it('deletes only expired sessions', async () => {
    const { app, db } = setup()
    await register(app)
    await post(app, '/api/auth/login', { email: 'alice@example.com', password: PASSWORD })
    const first = db.prepare('SELECT id_hash FROM sessions LIMIT 1').get() as { id_hash: string }
    db.prepare('UPDATE sessions SET expires_at = ? WHERE id_hash = ?').run(1, first.id_hash)
    expect(deleteExpiredSessions(db)).toBe(1)
    expect(count(db, 'sessions')).toBe(1)
  })

  it('sweeps at app start', () => {
    const db = openDatabase(':memory:')
    db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)').run(
      'u1',
      'a@example.com',
      'x',
      1,
    )
    db.prepare(
      'INSERT INTO sessions (id_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    ).run('h', 'u1', 1, 1)
    const app = buildApp({ config: loadConfig({ DATABASE_URL: ':memory:' }), db })
    apps.push(app)
    expect(count(db, 'sessions')).toBe(0)
  })
})

describe('cache headers', () => {
  it('sets no-store on auth routes and integrations, including errors', async () => {
    const { app } = setup()
    const reg = await register(app)
    const cookie = cookieOf(reg)
    const urls = ['/api/auth/me', '/api/auth/config', '/api/integrations']
    for (const url of urls) {
      const res = await app.inject({ method: 'GET', url, headers: { cookie } })
      expect(res.headers['cache-control']).toBe('private, no-store')
    }
    expect(reg.headers['cache-control']).toBe('private, no-store')
    const unauth = await app.inject({ method: 'GET', url: '/api/auth/me' })
    expect(unauth.statusCode).toBe(401)
    expect(unauth.headers['cache-control']).toBe('private, no-store')
    const health = await app.inject({ method: 'GET', url: '/health' })
    expect(health.headers['cache-control']).toBeUndefined()
  })
})

describe('error handler', () => {
  it('hides 5xx details but keeps 4xx messages', async () => {
    const { app } = setup()
    app.get('/boom', async () => {
      throw new Error('secret SQL detail')
    })
    const res = await app.inject({ method: 'GET', url: '/boom' })
    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({ error: 'Erreur interne du serveur.' })
    expect(res.body).not.toContain('secret')

    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/xml' },
      payload: 'x',
    })
    expect(bad.statusCode).toBe(415)
    expect(bad.json().error).toBe('Unsupported Media Type')
  })
})

describe('logout and sessions', () => {
  it('logout deletes the session and clears the cookie', async () => {
    const { app, db } = setup()
    const reg = await register(app)
    const cookie = cookieOf(reg)
    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } })
    expect(out.statusCode).toBe(204)
    expect(String(out.headers['set-cookie'])).toMatch(/sy_session=;/)
    expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 })
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })
    expect(me.statusCode).toBe(401)
    expect(me.json()).toEqual({ error: 'Non authentifié' })
  })

  it('logout without a session is still 204', async () => {
    const { app } = setup()
    const out = await app.inject({ method: 'POST', url: '/api/auth/logout' })
    expect(out.statusCode).toBe(204)
  })

  it('rejects and deletes an expired session', async () => {
    const { app, db } = setup()
    const reg = await register(app)
    db.prepare('UPDATE sessions SET expires_at = ?').run(Date.now() - 1000)
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: cookieOf(reg) },
    })
    expect(me.statusCode).toBe(401)
    expect(count(db, 'sessions')).toBe(0)
  })
})

function count(db: Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
}

describe('GET /api/integrations', () => {
  it('requires authentication', async () => {
    const { app } = setup()
    const res = await app.inject({ method: 'GET', url: '/api/integrations' })
    expect(res.statusCode).toBe(401)
  })

  it('lists integrations for an authenticated user', async () => {
    const { app } = setup()
    const reg = await register(app)
    const res = await app.inject({
      method: 'GET',
      url: '/api/integrations',
      headers: { cookie: cookieOf(reg) },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      integrations: [{ id: 'demo', name: 'Demo (example)', checks: ['always-ok'] }],
    })
  })
})

describe('Origin check', () => {
  it('rejects state-changing requests from a disallowed origin', async () => {
    const { app, db } = setup()
    const res = await post(
      app,
      '/api/auth/register',
      { email: 'a@example.com', password: PASSWORD },
      { origin: 'https://evil.example' },
    )
    expect(res.statusCode).toBe(403)
    expect(count(db, 'users')).toBe(0)
  })

  it('accepts an allowed origin and requests without Origin', async () => {
    const { app } = setup()
    const res = await post(
      app,
      '/api/auth/register',
      { email: 'a@example.com', password: PASSWORD },
      { origin: 'http://localhost:3000' },
    )
    expect(res.statusCode).toBe(201)
  })
})

describe('passwords', () => {
  it('hashes to scrypt$N$r$p$salt$hash and verifies', async () => {
    const hash = await hashPassword(PASSWORD)
    expect(hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/)
    expect(await verifyPassword(PASSWORD, hash)).toBe(true)
    expect(await verifyPassword('another password', hash)).toBe(false)
    expect(await hashPassword(PASSWORD)).not.toBe(hash)
  })

  it('uses N=2^17, r=8, p=1 by default and flags other parameters for rehash', async () => {
    expect(DEFAULT_PARAMS).toEqual({ N: 131072, r: 8, p: 1 })
    const strong = await hashPassword(PASSWORD)
    expect(strong.startsWith('scrypt$131072$8$1$')).toBe(true)
    expect(needsRehash(strong)).toBe(false)
    expect(needsRehash(await hashPassword(PASSWORD, FAST_PARAMS))).toBe(true)
    expect(needsRehash('garbage')).toBe(true)
  })

  it('rejects malformed hashes', async () => {
    expect(await verifyPassword(PASSWORD, 'garbage')).toBe(false)
    expect(await verifyPassword(PASSWORD, 'scrypt$x$8$1$AAAA$AAAA')).toBe(false)
  })
})
