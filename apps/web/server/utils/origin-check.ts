const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export interface OriginCheckInput {
  method: string
  /** `Sec-Fetch-Site` request header, if sent (browsers only). */
  secFetchSite: string | undefined
  /** `Origin` request header, if sent. */
  origin: string | undefined
  /** Origin of the request itself (scheme + host + port), e.g. from `getRequestURL(event).origin`. */
  requestOrigin: string
}

/** Normalizes an Origin header value to `scheme://host[:port]`, or null when unparsable. */
function normalizeOrigin(value: string): string | null {
  if (!URL.canParse(value)) return null
  const { origin } = new URL(value)
  return origin === 'null' ? null : origin
}

/**
 * CSRF-style guard for the /api proxy. For non-safe methods, a browser-issued request is refused
 * when `Sec-Fetch-Site` is present and not `same-origin`, or when `Origin` is present and differs
 * from the request's own origin. Requests carrying neither header (non-browser clients) pass: the
 * API still verifies the bearer token.
 */
export function isRequestOriginAllowed({
  method,
  secFetchSite,
  origin,
  requestOrigin,
}: OriginCheckInput): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true
  if (secFetchSite !== undefined && secFetchSite.trim().toLowerCase() !== 'same-origin') {
    return false
  }
  if (origin !== undefined) {
    const normalized = normalizeOrigin(origin.trim())
    if (normalized === null || normalized !== requestOrigin) return false
  }
  return true
}

/**
 * Validates the `publicOrigin` runtime config: a bare `http(s)://host[:port]` origin (no path,
 * query or credentials). Returns the normalized origin, or undefined when unset or invalid.
 */
export function parsePublicOrigin(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const raw = value.trim()
  if (!URL.canParse(raw)) return undefined
  const url = new URL(raw)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
  if (url.username || url.password || url.search || url.hash) return undefined
  if (url.pathname !== '/') return undefined
  return url.origin
}

/**
 * The origin the app is reached at: the configured `publicOrigin` when set (needed behind a
 * TLS-terminating proxy that does not forward the host and protocol), else the request's own.
 */
export function effectiveOrigin(publicOrigin: unknown, requestOrigin: string): string {
  return parsePublicOrigin(publicOrigin) ?? requestOrigin
}
