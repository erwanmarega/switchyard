/**
 * Builds the upstream URL for the same-origin API proxy.
 * `path` is the catch-all route param (e.g. "auth/me"), `search` the raw query string
 * including its leading "?" (or an empty string). Returns null when the path is unsafe.
 */
export function buildProxyTarget(apiBase: string, path: string, search = ''): string | null {
  const segments = path.split('/').filter((s) => s.length > 0)
  if (segments.length === 0) return null
  // Reject traversal and encoded separators so a request can never leave /api/.
  if (segments.some((s) => s === '.' || s === '..' || /[\\]|%2f|%5c|%2e/i.test(s))) return null
  const base = apiBase.replace(/\/+$/, '')
  return `${base}/api/${segments.join('/')}${search}`
}
