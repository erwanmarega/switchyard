import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp, VERSION } from '../src/app.js'
import { DEFAULT_ALLOWED_ORIGINS, loadConfig } from '../src/config.js'
import { startupWarnings } from '../src/startup.js'
import {
  TEST_ENV,
  fakeDb,
  makeSigner,
  signToken,
  testApp,
  testConfig,
  type Signer,
} from './helpers.js'
import { createMemoryStore } from './support/memory-store.js'

let signer: Signer
let app: FastifyInstance

beforeAll(async () => {
  signer = await makeSigner()
  app = testApp(signer)
})
afterAll(() => app.close())

describe('GET /health', () => {
  it('returns ok with the version and db status', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok', version: VERSION, db: 'ok' })
  })

  it('returns 503 degraded without leaking the error when the db is down', async () => {
    const down = testApp(signer, fakeDb(false))
    const res = await down.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual({ status: 'degraded', db: 'down' })
    expect(res.body).not.toMatch(/secret|postgresql|refused/)
    await down.close()
  })
})

describe('GET /api/integrations', () => {
  it('requires authentication', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/integrations' })
    expect(res.statusCode).toBe(401)
    expect(res.headers['cache-control']).toBe('private, no-store')
  })

  it('lists integrations for an authenticated user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/integrations',
      headers: { authorization: `Bearer ${await signToken(signer)}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().integrations[0]).toMatchObject({ id: 'demo' })
    expect(res.headers['cache-control']).toBe('private, no-store')
  })
})

describe('Origin check', () => {
  const post = (origin?: string) =>
    app.inject({
      method: 'POST',
      url: '/api/anything',
      payload: {},
      headers: origin ? { origin } : {},
    })

  it('rejects state-changing requests from a foreign origin', async () => {
    const res = await post('https://evil.example')
    expect(res.statusCode).toBe(403)
  })

  it('lets allowed origins and origin-less requests through to routing', async () => {
    expect((await post('http://localhost:3000')).statusCode).toBe(404)
    expect((await post()).statusCode).toBe(404)
  })
})

describe('error handler', () => {
  it('hides the cause of 5xx errors', async () => {
    const failing = buildApp({
      config: testConfig(),
      db: fakeDb(),
      store: createMemoryStore(),
      verifyToken: async () => {
        throw new Error('boom: postgresql://secret@host')
      },
    })
    const res = await failing.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: 'Bearer abc.def.ghi' },
    })
    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({ error: 'Erreur interne du serveur.' })
    await failing.close()
  })
})

describe('lifecycle', () => {
  it('closes the database on close', async () => {
    const db = fakeDb()
    const a = testApp(signer, db)
    await a.ready()
    await a.close()
    expect(db.closed).toBe(true)
  })
})

describe('loadConfig', () => {
  it('applies defaults', () => {
    expect(loadConfig(TEST_ENV)).toEqual({
      PORT: 3001,
      HOST: '127.0.0.1',
      NODE_ENV: 'development',
      DATABASE_URL: TEST_ENV.DATABASE_URL,
      DATABASE_SSL: 'disable',
      SUPABASE_URL: TEST_ENV.SUPABASE_URL,
      SWITCHYARD_ENCRYPTION_KEY: Buffer.from(TEST_ENV.SWITCHYARD_ENCRYPTION_KEY, 'base64'),
      ALLOWED_ORIGINS: ['http://localhost:3000', 'http://127.0.0.1:3000'],
      TRUST_PROXY: ['127.0.0.1', '::1'],
    })
  })

  it('requires DATABASE_URL and points to .env.example', () => {
    expect(() => loadConfig({ SUPABASE_URL: TEST_ENV.SUPABASE_URL })).toThrow(/\.env\.example/)
    expect(() => loadConfig({ ...TEST_ENV, DATABASE_URL: '' })).toThrow(/DATABASE_URL/)
  })

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => loadConfig({ ...TEST_ENV, DATABASE_URL: 'file:./x.sqlite' })).toThrow(/postgresql/)
  })

  it('requires a valid SUPABASE_URL and strips trailing slashes', () => {
    expect(() => loadConfig({ DATABASE_URL: TEST_ENV.DATABASE_URL })).toThrow(/SUPABASE_URL/)
    expect(() => loadConfig({ ...TEST_ENV, SUPABASE_URL: 'nope' })).toThrow(/SUPABASE_URL/)
    expect(loadConfig({ ...TEST_ENV, SUPABASE_URL: 'https://x.supabase.co/' }).SUPABASE_URL).toBe(
      'https://x.supabase.co',
    )
  })

  it('parses TRUST_PROXY as a list', () => {
    expect(loadConfig({ ...TEST_ENV, TRUST_PROXY: '10.0.0.1, 172.16.0.0/12' }).TRUST_PROXY).toEqual(
      ['10.0.0.1', '172.16.0.0/12'],
    )
  })

  describe('production transport security', () => {
    const prodEnv = {
      ...TEST_ENV,
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://x.supabase.co',
      DATABASE_URL: 'postgresql://u:p@db.example.com:5432/postgres',
    }

    it('rejects an http SUPABASE_URL in production only', () => {
      expect(() => loadConfig({ ...prodEnv, SUPABASE_URL: 'http://x.supabase.co' })).toThrow(
        /SUPABASE_URL must use https/,
      )
      expect(() => loadConfig({ ...prodEnv, SUPABASE_URL: 'http://127.0.0.1:54321' })).toThrow(
        /SUPABASE_URL must use https/,
      )
      expect(loadConfig({ ...TEST_ENV, NODE_ENV: 'development' }).SUPABASE_URL).toMatch(/^http:/)
    })

    it('defaults DATABASE_SSL to require in production and disable otherwise', () => {
      expect(loadConfig(prodEnv).DATABASE_SSL).toBe('require')
      expect(loadConfig(TEST_ENV).DATABASE_SSL).toBe('disable')
      expect(loadConfig({ ...TEST_ENV, DATABASE_SSL: 'require' }).DATABASE_SSL).toBe('require')
    })

    it('rejects an invalid DATABASE_SSL value', () => {
      expect(() => loadConfig({ ...TEST_ENV, DATABASE_SSL: 'maybe' })).toThrow(/DATABASE_SSL/)
    })

    it('rejects DATABASE_SSL=disable on a remote host in production', () => {
      expect(() => loadConfig({ ...prodEnv, DATABASE_SSL: 'disable' })).toThrow(
        /DATABASE_SSL=disable is only allowed/,
      )
    })

    it('allows DATABASE_SSL=disable on a loopback host in production', () => {
      for (const host of ['127.0.0.1', '[::1]', 'localhost']) {
        const config = loadConfig({
          ...prodEnv,
          DATABASE_SSL: 'disable',
          DATABASE_URL: `postgresql://u:p@${host}:5432/postgres`,
        })
        expect(config.DATABASE_SSL).toBe('disable')
      }
    })

    it('allows DATABASE_SSL=disable on any host outside production', () => {
      expect(
        loadConfig({
          ...TEST_ENV,
          DATABASE_SSL: 'disable',
          DATABASE_URL: 'postgresql://u:p@db.example.com/postgres',
        }).DATABASE_SSL,
      ).toBe('disable')
    })
  })

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ ...TEST_ENV, PORT: 'abc' })).toThrow(/Invalid environment/)
  })
})

describe('startupWarnings', () => {
  const HARDENED = {
    SUPABASE_URL: 'https://x.supabase.co',
    DATABASE_URL: 'postgresql://u:p@db.example.com:5432/postgres',
    ALLOWED_ORIGINS: 'https://app.example.com',
  }
  const prod = (env: Record<string, string> = {}) =>
    startupWarnings(testConfig({ NODE_ENV: 'production', ...HARDENED, ...env }))

  it('is silent outside production', () => {
    expect(startupWarnings(testConfig())).toEqual([])
  })

  it('warns about a localhost Supabase URL and default origins', () => {
    // Build the config directly: loadConfig rejects http SUPABASE_URL in production.
    const config = { ...testConfig({ NODE_ENV: 'production', ...HARDENED }) }
    config.SUPABASE_URL = 'https://localhost'
    config.ALLOWED_ORIGINS = DEFAULT_ALLOWED_ORIGINS.split(',')
    const warnings = startupWarnings(config)
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toMatch(/SUPABASE_URL points to localhost/)
    expect(warnings[1]).toMatch(/ALLOWED_ORIGINS/)
  })

  it('is silent for a hardened production config', () => {
    expect(prod()).toEqual([])
    expect(DEFAULT_ALLOWED_ORIGINS).toContain('localhost')
  })
})
