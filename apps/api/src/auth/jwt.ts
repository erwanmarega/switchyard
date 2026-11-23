import { jwtVerify, createRemoteJWKSet, type JWTVerifyGetKey } from 'jose'

export interface AuthUser {
  id: string
  email: string
}

/** Resolves an access token to its user, or null when it is not acceptable. Never throws. */
export type TokenVerifier = (token: string) => Promise<AuthUser | null>

/**
 * Asymmetric algorithms only. The local Supabase stack and hosted projects sign access tokens with
 * ES256 (JWKS published at /auth/v1/.well-known/jwks.json); HS256 is deliberately not accepted.
 */
export const ACCEPTED_ALGORITHMS = ['ES256', 'RS256']

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function issuerOf(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`
}

export function remoteKeySet(supabaseUrl: string): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(`${issuerOf(supabaseUrl)}/.well-known/jwks.json`), {
    timeoutDuration: 5000,
    cooldownDuration: 30_000,
  })
}

/** Verifies Supabase access tokens locally (signature, iss, aud, exp) against `keys`. */
export function createTokenVerifier(supabaseUrl: string, keys: JWTVerifyGetKey): TokenVerifier {
  const issuer = issuerOf(supabaseUrl)
  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, keys, {
        issuer,
        audience: 'authenticated',
        algorithms: ACCEPTED_ALGORITHMS,
        requiredClaims: ['exp', 'sub'],
      })
      if (payload.role !== 'authenticated') return null
      if (payload.is_anonymous === true) return null
      if (typeof payload.sub !== 'string' || !UUID.test(payload.sub)) return null
      const email = typeof payload.email === 'string' ? payload.email : ''
      return { id: payload.sub, email }
    } catch {
      return null
    }
  }
}
