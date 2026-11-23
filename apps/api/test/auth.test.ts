import { SignJWT } from 'jose'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ISSUER, USER_ID, makeSigner, signToken, testApp, type Signer } from './helpers.js'

let signer: Signer
let other: Signer
let app: FastifyInstance

beforeAll(async () => {
  signer = await makeSigner()
  other = await makeSigner('ES256', 'test-key') // same kid, different key
  app = testApp(signer)
})
afterAll(() => app.close())

const me = (authorization?: string) =>
  app.inject({
    method: 'GET',
    url: '/api/me',
    headers: authorization ? { authorization } : {},
  })

describe('requireAuth (Supabase access token)', () => {
  it('accepts a valid token and exposes the user', async () => {
    const res = await me(`Bearer ${await signToken(signer)}`)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ user: { id: USER_ID, email: 'alice@example.com' } })
  })

  it('sets no-store on /api responses', async () => {
    const res = await me()
    expect(res.headers['cache-control']).toBe('private, no-store')
  })

  const rejected: [string, () => Promise<string | undefined>][] = [
    ['a missing header', async () => undefined],
    ['a non-Bearer scheme', async () => `Basic ${await signToken(signer)}`],
    ['a malformed token', async () => 'Bearer not.a.jwt'],
    ['an empty bearer', async () => 'Bearer '],
    ['an expired token', async () => `Bearer ${await signToken(signer, { expiresIn: -60 })}`],
    ['a wrong audience', async () => `Bearer ${await signToken(signer, { aud: 'anon' })}`],
    [
      'a wrong issuer',
      async () => `Bearer ${await signToken(signer, { iss: 'http://evil.test/auth/v1' })}`,
    ],
    ['a wrong role', async () => `Bearer ${await signToken(signer, { role: 'service_role' })}`],
    ['an anonymous user', async () => `Bearer ${await signToken(signer, { anonymous: true })}`],
    ['a non-UUID sub', async () => `Bearer ${await signToken(signer, { sub: 'admin' })}`],
    ['a missing sub', async () => `Bearer ${await signToken(signer, { sub: null })}`],
    ['a foreign signature', async () => `Bearer ${await signToken(other)}`],
    ['an unknown kid', async () => `Bearer ${await signToken(signer, { kid: 'nope' })}`],
    [
      'an HS256 token (algorithm confusion)',
      async () => {
        const secret = new TextEncoder().encode(
          'super-secret-jwt-token-with-at-least-32-characters-long',
        )
        const t = await new SignJWT({ role: 'authenticated' })
          .setProtectedHeader({ alg: 'HS256', kid: 'test-key' })
          .setIssuer(ISSUER)
          .setAudience('authenticated')
          .setSubject(USER_ID)
          .setExpirationTime('1h')
          .sign(secret)
        return `Bearer ${t}`
      },
    ],
    [
      'alg none',
      async () => {
        const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
        const exp = Math.floor(Date.now() / 1000) + 3600
        const payload = {
          iss: ISSUER,
          aud: 'authenticated',
          sub: USER_ID,
          role: 'authenticated',
          exp,
        }
        return `Bearer ${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`
      },
    ],
    [
      'a tampered payload',
      async () => {
        const [h, p, s] = (await signToken(signer)).split('.')
        const claims = JSON.parse(Buffer.from(p!, 'base64url').toString())
        claims.sub = '11111111-1111-4111-8111-111111111111'
        return `Bearer ${h}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${s}`
      },
    ],
  ]

  it.each(rejected)('rejects %s with 401', async (_name, make) => {
    const res = await me(await make())
    expect(res.statusCode).toBe(401)
    expect(res.json()).toEqual({ error: 'Non authentifié' })
  })

  it('ignores cookies entirely', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: `sb-access-token=${await signToken(signer)}` },
    })
    expect(res.statusCode).toBe(401)
  })
})
