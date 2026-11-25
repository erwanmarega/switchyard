import { randomUUID } from 'node:crypto'
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type CryptoKey,
  type JWK,
} from 'jose'
import { buildApp } from '../src/app.js'
import { createTokenVerifier } from '../src/auth/jwt.js'
import { loadConfig, type Config } from '../src/config.js'
import type { Database } from '../src/db/index.js'
import type { Store } from '../src/store/types.js'
import { createMemoryStore } from './support/memory-store.js'

export const SUPABASE_URL = 'http://127.0.0.1:54321'
export const ISSUER = `${SUPABASE_URL}/auth/v1`
export const USER_ID = '6eead7eb-f9d4-4df1-954a-e948a33e2e6b'

// Fake, test-only connection string (never reaches a real server: the db is injected).
export const TEST_ENV = {
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test',
  SUPABASE_URL,
  // Test-only key (32 bytes of a constant pattern). Never use it anywhere else.
  SWITCHYARD_ENCRYPTION_KEY: Buffer.alloc(32, 0x42).toString('base64'),
}

export function testConfig(env: Record<string, string> = {}): Config {
  return loadConfig({ ...TEST_ENV, ...env })
}

export function fakeDb(ok = true): Database & { closed: boolean } {
  return {
    closed: false,
    async ping() {
      if (!ok) throw new Error('connection refused: postgresql://secret@host')
    },
    async close() {
      this.closed = true
    },
  }
}

export interface Signer {
  privateKey: CryptoKey
  jwk: JWK
}

export async function makeSigner(alg = 'ES256', kid = 'test-key'): Promise<Signer> {
  const { publicKey, privateKey } = await generateKeyPair(alg)
  return { privateKey, jwk: { ...(await exportJWK(publicKey)), kid, alg, use: 'sig' } }
}

export interface TokenOptions {
  alg?: string
  kid?: string
  iss?: string
  aud?: string
  sub?: string | null
  role?: string
  email?: string
  anonymous?: boolean
  expiresIn?: string | number
}

export async function signToken(signer: Signer, o: TokenOptions = {}): Promise<string> {
  const claims: Record<string, unknown> = {
    role: o.role ?? 'authenticated',
    email: o.email ?? 'alice@example.com',
    is_anonymous: o.anonymous ?? false,
  }
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: o.alg ?? 'ES256', kid: o.kid ?? 'test-key' })
    .setIssuer(o.iss ?? ISSUER)
    .setAudience(o.aud ?? 'authenticated')
    .setIssuedAt()
    .setExpirationTime(o.expiresIn ?? '1h')
  if (o.sub !== null) jwt.setSubject(o.sub ?? USER_ID)
  return jwt.sign(signer.privateKey)
}

export function testApp(
  signer: Signer,
  db: Database = fakeDb(),
  env: Record<string, string> = {},
  store: Store = createMemoryStore(),
) {
  const config = testConfig(env)
  const verifyToken = createTokenVerifier(
    config.SUPABASE_URL,
    createLocalJWKSet({ keys: [signer.jwk] }),
  )
  return buildApp({ config, db, verifyToken, store })
}

export const randomId = () => randomUUID()
