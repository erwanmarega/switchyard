/**
 * Request headers the /api proxy forwards upstream; everything else is dropped. `cookie` is
 * deliberately absent (Supabase refresh tokens must never reach the API) and so is
 * `authorization` (the proxy sets its own from the server-side session).
 */
export const FORWARDED_REQUEST_HEADERS = [
  'content-type',
  'origin',
  'user-agent',
  'accept',
  'accept-language',
] as const

type HeaderBag = Record<string, string | string[] | undefined>

/**
 * Keeps only allowlisted headers. In particular `x-forwarded-*`, `x-real-ip`, `forwarded`,
 * `authorization` and `host` never reach the API. `content-length` is left out on purpose:
 * the upstream fetch recomputes it from the buffered body.
 */
export function filterForwardHeaders(headers: HeaderBag): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = headers[name]
    if (value === undefined) continue
    out[name] = Array.isArray(value) ? value.join(', ') : value
  }
  return out
}

export interface UpstreamHeadersInput {
  incoming: HeaderBag
  /** Supabase access token of the current session, if any. */
  accessToken?: string | null
  /** Resolved client IP (see `resolveClientIp`), if any. */
  clientIp?: string
}

/**
 * Builds the headers sent to the API: the allowlisted incoming headers, a Bearer token taken
 * only from the server-side session (never from the incoming request), and a rebuilt
 * `x-forwarded-for`.
 */
export function buildUpstreamHeaders({
  incoming,
  accessToken,
  clientIp,
}: UpstreamHeadersInput): Record<string, string> {
  const headers = filterForwardHeaders(incoming)
  if (accessToken) headers.authorization = `Bearer ${accessToken}`
  if (clientIp) headers['x-forwarded-for'] = clientIp
  return headers
}

export interface ClientIpInput {
  /** Address of the TCP peer talking to this server (undefined on SSR-internal calls). */
  socketIp: string | undefined
  /** Raw incoming `x-forwarded-for` header; only read when `trustedProxyHops` > 0. */
  forwardedFor: string | undefined
  /** Number of trusted reverse proxies between the client and this server (0 = none). */
  trustedProxyHops: number
}

/**
 * Normalizes the `trustedProxyHops` runtime config (a string when set from the environment) to
 * an integer >= 0. Anything else (empty, negative, fractional, garbage) means 0: no trust.
 * The legacy `NUXT_TRUST_FRONT_PROXY=true` is not supported anymore.
 */
export function parseTrustedProxyHops(value: unknown): number {
  const n = typeof value === 'string' ? Number(value.trim() || NaN) : Number(value)
  return Number.isInteger(n) && n >= 0 && n <= 32 ? n : 0
}

/**
 * Resolves the real client IP. By default only the socket address is trusted. Each trusted proxy
 * appends the address of its own peer to the right of `x-forwarded-for`, so the left-most entries
 * are client-controlled and never used: with N trusted hops, the N-th entry from the RIGHT is
 * the address seen by the outermost trusted proxy. With fewer entries than hops, the header is
 * inconsistent with the setup and the socket address is used.
 */
export function resolveClientIp({
  socketIp,
  forwardedFor,
  trustedProxyHops,
}: ClientIpInput): string | undefined {
  if (trustedProxyHops > 0 && forwardedFor) {
    const entries = forwardedFor.split(',').map((entry) => entry.trim())
    const picked =
      entries.length >= trustedProxyHops ? entries[entries.length - trustedProxyHops] : ''
    if (picked) return picked
  }
  return socketIp || undefined
}
