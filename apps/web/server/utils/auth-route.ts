import type { H3Event } from 'h3'
import { parseTrustedProxyHops, resolveClientIp } from './forward-headers'
import { effectiveOrigin, isRequestOriginAllowed } from './origin-check'
import {
  MAX_BODY_BYTES,
  checkDeclaredLength,
  isJsonContentType,
  parseJsonObject,
} from './auth-input'
import { createAuthLimiter } from './auth-rate-limit'
import { RATE_LIMITED } from '../../app/utils/auth-errors'

/** One limiter per process, shared by /auth/login and /auth/signup. */
export const authLimiter = createAuthLimiter()

/** Sends a JSON error with the right status; routes return it so headers set earlier survive. */
export function authError(event: H3Event, status: number, error: string, extra?: object) {
  setResponseStatus(event, status)
  return { error, ...extra }
}

export function tooManyAttempts(event: H3Event, retryAfterSeconds: number) {
  setHeader(event, 'retry-after', retryAfterSeconds)
  return authError(event, 429, RATE_LIMITED)
}

/** The origin this app is reached at: `publicOrigin` when configured, else the request's own. */
export function appOrigin(event: H3Event): string {
  return effectiveOrigin(useRuntimeConfig(event).publicOrigin, getRequestURL(event).origin)
}

export function clientIp(event: H3Event): string | undefined {
  return resolveClientIp({
    socketIp: getRequestIP(event),
    forwardedFor: getRequestHeader(event, 'x-forwarded-for'),
    trustedProxyHops: parseTrustedProxyHops(useRuntimeConfig(event).trustedProxyHops),
  })
}

/**
 * Common checks of the state-changing /auth/* routes: never cached, same-origin only and, when
 * the route takes a body, JSON only. Returns an error body to send back, or null to proceed.
 */
export function guardAuthPost(event: H3Event, { json }: { json: boolean }) {
  setHeader(event, 'cache-control', 'private, no-store')
  const allowed = isRequestOriginAllowed({
    method: event.method,
    secFetchSite: getRequestHeader(event, 'sec-fetch-site'),
    origin: getRequestHeader(event, 'origin'),
    requestOrigin: appOrigin(event),
  })
  if (!allowed) return authError(event, 403, 'Requête refusée.')
  if (json && !isJsonContentType(getRequestHeader(event, 'content-type'))) {
    return authError(event, 415, 'Le contenu de la requête doit être au format JSON.')
  }
  if (json) {
    const length = checkDeclaredLength(getRequestHeader(event, 'content-length'), MAX_BODY_BYTES)
    if (!length.ok) return authError(event, length.status, length.error)
  }
  return null
}

/** Reads the JSON object body (size-capped); null when missing or malformed. */
export async function readAuthBody(event: H3Event): Promise<Record<string, unknown> | null> {
  // guardAuthPost has already required a Content-Length within MAX_BODY_BYTES.
  const raw = await readRawBody(event, 'utf8').catch(() => undefined)
  return parseJsonObject(raw)
}
