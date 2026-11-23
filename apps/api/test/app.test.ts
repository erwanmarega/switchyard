import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, afterAll } from 'vitest'
import { buildApp, VERSION } from '../src/app.js'
import { loadConfig, DEFAULT_ALLOWED_ORIGINS } from '../src/config.js'
import { startupWarnings } from '../src/startup.js'
import { openDatabase } from '../src/db/index.js'

const app = buildApp({
  config: loadConfig({ DATABASE_URL: ':memory:', AUTH_RATE_LIMIT_MAX: '0' }),
  db: openDatabase(':memory:'),
})
afterAll(() => app.close())

describe('GET /health', () => {
  it('returns status ok and the version', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok', version: VERSION })
  })
})

describe('loadConfig', () => {
  it('applies defaults', () => {
    expect(loadConfig({})).toEqual({
      PORT: 3001,
      HOST: '127.0.0.1',
      NODE_ENV: 'development',
      DATABASE_URL: 'file:./data/switchyard.sqlite',
      ALLOW_REGISTRATION: true,
      COOKIE_SECURE: false,
      ALLOWED_ORIGINS: ['http://localhost:3000', 'http://127.0.0.1:3000'],
      AUTH_RATE_LIMIT_MAX: 10,
      TRUST_PROXY: ['127.0.0.1', '::1'],
    })
  })

  it('parses TRUST_PROXY as a list', () => {
    expect(loadConfig({ TRUST_PROXY: '10.0.0.1, 172.16.0.0/12' }).TRUST_PROXY).toEqual([
      '10.0.0.1',
      '172.16.0.0/12',
    ])
  })

  it('derives COOKIE_SECURE from NODE_ENV unless set', () => {
    expect(loadConfig({ NODE_ENV: 'production' }).COOKIE_SECURE).toBe(true)
    expect(loadConfig({ NODE_ENV: 'production', COOKIE_SECURE: 'false' }).COOKIE_SECURE).toBe(false)
  })

  it('parses ALLOW_REGISTRATION and rejects junk', () => {
    expect(loadConfig({ ALLOW_REGISTRATION: 'false' }).ALLOW_REGISTRATION).toBe(false)
    expect(() => loadConfig({ ALLOW_REGISTRATION: 'maybe' })).toThrow(/Invalid environment/)
  })

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/Invalid environment/)
  })
})

describe('startupWarnings', () => {
  const prod = (env: Record<string, string> = {}) =>
    startupWarnings(loadConfig({ NODE_ENV: 'production', ...env }))

  it('is silent outside production', () => {
    expect(startupWarnings(loadConfig({ AUTH_RATE_LIMIT_MAX: '0' }))).toEqual([])
  })

  it('warns about open registration, disabled rate limit and default origins', () => {
    const warnings = prod({ AUTH_RATE_LIMIT_MAX: '0' })
    expect(warnings).toHaveLength(3)
    expect(warnings[0]).toMatch(/open registration: anyone who can reach this instance/)
    expect(warnings[1]).toMatch(/AUTH_RATE_LIMIT_MAX/)
    expect(warnings[2]).toMatch(/ALLOWED_ORIGINS/)
  })

  it('is silent for a hardened production config', () => {
    expect(
      prod({ ALLOW_REGISTRATION: 'false', ALLOWED_ORIGINS: 'https://app.example.com' }),
    ).toEqual([])
    expect(DEFAULT_ALLOWED_ORIGINS).toContain('localhost')
  })
})

describe('openDatabase file permissions', () => {
  it('creates the directory 0700 and the file 0600', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sy-db-'))
    try {
      const file = join(dir, 'data', 'db.sqlite')
      openDatabase(`file:${file}`).close()
      expect(statSync(join(dir, 'data')).mode & 0o777).toBe(0o700)
      expect(statSync(file).mode & 0o777).toBe(0o600)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
