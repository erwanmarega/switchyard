/** Request headers the /api proxy forwards upstream; everything else is dropped. */
export const FORWARDED_REQUEST_HEADERS = [
  'cookie',
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

export interface ClientIpInput {
  /** Address of the TCP peer talking to this server (undefined on SSR-internal calls). */
  socketIp: string | undefined
  /** Raw incoming `x-forwarded-for` header, only honoured when `trustFrontProxy` is set. */
  forwardedFor: string | undefined
  /** True when a trusted reverse proxy in front of Nitro sets `x-forwarded-for`. */
  trustFrontProxy: boolean
}

/**
 * Resolves the real client IP. By default only the socket address is trusted; behind a trusted
 * front proxy the left-most `x-forwarded-for` entry is used (the one that proxy appended).
 */
export function resolveClientIp({
  socketIp,
  forwardedFor,
  trustFrontProxy,
}: ClientIpInput): string | undefined {
  if (trustFrontProxy) {
    const first = forwardedFor?.split(',')[0]?.trim()
    if (first) return first
  }
  return socketIp || undefined
}
